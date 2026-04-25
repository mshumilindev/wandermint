import dayjs from "dayjs";
import type {
  Confidence,
  MusicArtistSignal,
  MusicGenreSignal,
  MusicProviderConnection,
  MusicSceneSignal,
  MusicTasteProfile,
  MusicTrackSignal,
} from "../../../integrations/music/musicTypes";
import type { SpotifyArtist, SpotifyRecentlyPlayedItem, SpotifyTrack } from "../../../integrations/music/spotify/spotifyTypes";
import { pickSpotifyImageUrl, spotifyGenres, spotifyTrackArtistNames } from "../../../integrations/music/spotify/spotifyProfileMapper";
import { nowIso } from "../../firebase/timestampMapper";

export type SpotifyHarvest = {
  topArtists: SpotifyArtist[];
  topTracks: SpotifyTrack[];
  recentlyPlayed: SpotifyRecentlyPlayedItem[];
};

export type MusicProviderHarvest = {
  spotify?: SpotifyHarvest;
};

const normalizeGenre = (g: string): string => g.trim().toLowerCase().replace(/\s+/g, " ");

const artistRankScore = (rank1Based: number): number => {
  if (rank1Based <= 1) {
    return 100;
  }
  if (rank1Based === 2) {
    return 95;
  }
  return Math.max(30, 105 - rank1Based * 5);
};

const sceneRules: { key: string; label: string; match: (genre: string) => boolean }[] = [
  { key: "jazz_blues_soul", label: "live music bars · jazz clubs", match: (g) => /jazz|blues|soul/.test(g) },
  { key: "electronic_club", label: "club culture · nightlife districts", match: (g) => /techno|house|electronic|edm|trance/.test(g) },
  {
    key: "classical_opera",
    label: "concert halls · cinematic cultural spaces",
    match: (g) => /classical|opera|soundtrack|instrumental|orchestral/.test(g),
  },
  { key: "rock_indie", label: "small venues · record shops · indie districts", match: (g) => /rock|indie|alternative/.test(g) },
  { key: "metal_punk", label: "underground venues", match: (g) => /metal|punk|hardcore/.test(g) },
  { key: "pop_culture", label: "pop culture districts · anime/music shops", match: (g) => /k-pop|j-pop|anime|vocaloid|kpop|jpop/.test(g) },
  { key: "folk_world", label: "local music heritage", match: (g) => /folk|world|traditional/.test(g) },
];

const genreConfidence = (score: number, artistCount: number): "low" | "medium" | "high" => {
  if (artistCount >= 3 || score >= 80) {
    return "high";
  }
  if (artistCount >= 2 || score >= 40) {
    return "medium";
  }
  return "low";
};

const artistConfidence = (score: number): "low" | "medium" | "high" => {
  if (score >= 100) {
    return "high";
  }
  if (score >= 55) {
    return "medium";
  }
  return "low";
};

export const buildMusicTasteProfile = (args: {
  userId: string;
  providerConnections: MusicProviderConnection[];
  providerHarvest: MusicProviderHarvest;
}): MusicTasteProfile => {
  const { userId, providerConnections, providerHarvest } = args;
  const spotify = providerHarvest.spotify;
  const topArtists = spotify?.topArtists ?? [];
  const topTracks = spotify?.topTracks ?? [];
  const recent = spotify?.recentlyPlayed ?? [];

  const artistNameToTrackHits = new Map<string, number>();
  for (const track of topTracks) {
    for (const name of spotifyTrackArtistNames(track)) {
      const k = name.toLowerCase();
      artistNameToTrackHits.set(k, (artistNameToTrackHits.get(k) ?? 0) + 1);
    }
  }

  const artistNameToRecentHits = new Map<string, number>();
  for (const item of recent) {
    const tr = item.track;
    if (!tr) {
      continue;
    }
    for (const name of spotifyTrackArtistNames(tr as SpotifyTrack)) {
      const k = name.toLowerCase();
      artistNameToRecentHits.set(k, (artistNameToRecentHits.get(k) ?? 0) + 1);
    }
  }

  const topArtistsSignals: MusicArtistSignal[] = topArtists.map((artist, index) => {
    const rank = index + 1;
    let score = artistRankScore(rank);
    const nameKey = artist.name.toLowerCase();
    const trackHits = artistNameToTrackHits.get(nameKey) ?? 0;
    score += Math.min(40, trackHits * 10);
    const recentHits = artistNameToRecentHits.get(nameKey) ?? 0;
    score += Math.min(20, recentHits * 4);
    const sources = 1 + (trackHits > 0 ? 1 : 0) + (recentHits > 0 ? 1 : 0);
    if (sources >= 2) {
      score += 15;
    }
    const genres = spotifyGenres(artist);
    return {
      provider: "spotify",
      providerArtistId: artist.id,
      name: artist.name,
      genres,
      imageUrl: pickSpotifyImageUrl(artist.images),
      externalUrl: artist.external_urls?.spotify,
      providerPopularity: artist.popularity,
      score,
      confidence: artistConfidence(score),
      source: "top_artist",
    };
  });

  /** Derive artist signals from tracks when top artists empty. */
  if (topArtistsSignals.length === 0 && topTracks.length > 0) {
    const seen = new Set<string>();
    let rank = 1;
    for (const track of topTracks) {
      for (const rawName of spotifyTrackArtistNames(track)) {
        const name = rawName.trim();
        const key = name.toLowerCase();
        if (!name || seen.has(key)) {
          continue;
        }
        seen.add(key);
        let score = artistRankScore(rank);
        rank += 1;
        const trackHits = artistNameToTrackHits.get(key) ?? 0;
        score += Math.min(40, trackHits * 10);
        const recentHits = artistNameToRecentHits.get(key) ?? 0;
        score += Math.min(20, recentHits * 4);
        topArtistsSignals.push({
          provider: "spotify",
          providerArtistId: `derived:${key}`,
          name,
          genres: [],
          imageUrl: pickSpotifyImageUrl(track.album?.images),
          externalUrl: track.external_urls?.spotify,
          score,
          confidence: artistConfidence(score),
          source: "playlist_artist",
        });
        if (rank > 20) {
          break;
        }
      }
    }
  }

  const genreMap = new Map<string, { score: number; providers: Set<"spotify">; artistCount: number }>();
  for (const a of topArtistsSignals) {
    for (const g of a.genres) {
      const ng = normalizeGenre(g);
      if (!ng) {
        continue;
      }
      const row = genreMap.get(ng) ?? { score: 0, providers: new Set(), artistCount: 0 };
      row.score += a.score * 0.4;
      row.providers.add("spotify");
      row.artistCount += 1;
      genreMap.set(ng, row);
    }
  }

  const topGenres: MusicGenreSignal[] = [...genreMap.entries()]
    .map(([name, row]) => ({
      name,
      score: row.score,
      confidence: genreConfidence(row.score, row.artistCount),
      sourceProviders: [...row.providers],
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 24);

  const sceneAccumulator = new Map<string, { label: string; score: number; derived: Set<string> }>();
  for (const g of topGenres) {
    for (const rule of sceneRules) {
      if (rule.match(g.name)) {
        const row = sceneAccumulator.get(rule.key) ?? { label: rule.label, score: 0, derived: new Set<string>() };
        row.score += g.score;
        row.derived.add(g.name);
        sceneAccumulator.set(rule.key, row);
      }
    }
  }

  const scenes: MusicSceneSignal[] = [...sceneAccumulator.entries()].map(([key, row]) => {
    const confidence: Confidence = row.score >= 60 ? "high" : row.score >= 30 ? "medium" : "low";
    return {
      key,
      label: row.label,
      score: row.score,
      confidence,
      derivedFrom: [...row.derived],
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const topTracksSignals: MusicTrackSignal[] = topTracks.map((track, index) => {
    const rankBoost = Math.max(40, 95 - index * 4);
    return {
      provider: "spotify",
      providerTrackId: track.id,
      title: track.name,
      artistNames: spotifyTrackArtistNames(track),
      albumName: track.album?.name,
      imageUrl: pickSpotifyImageUrl(track.album?.images),
      externalUrl: track.external_urls?.spotify,
      score: rankBoost,
      confidence: index < 5 ? "high" : index < 12 ? "medium" : "low",
      source: "top_track",
    };
  });

  const updatedAt = nowIso();
  const expiresAt = dayjs(updatedAt).add(30, "day").toISOString();

  return {
    userId,
    providers: providerConnections,
    topArtists: topArtistsSignals,
    topTracks: topTracksSignals,
    topGenres,
    scenes,
    updatedAt,
    expiresAt,
  };
};
