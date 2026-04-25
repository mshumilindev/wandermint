export type MusicProvider = "spotify" | "appleMusic" | "youtubeMusic";

export type MusicConnectionStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "expired"
  | "error"
  | "unsupported";

export type Confidence = "low" | "medium" | "high";

export type MusicProviderConnection = {
  provider: MusicProvider;
  status: MusicConnectionStatus;
  connectedAt?: string;
  lastSyncedAt?: string;
  expiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type ExternalMusicImage = {
  url: string;
  width?: number;
  height?: number;
};

export type MusicArtistSource = "top_artist" | "recent_track_artist" | "library_artist" | "playlist_artist";

export type MusicArtistSignal = {
  provider: MusicProvider;
  providerArtistId: string;
  name: string;
  genres: string[];
  imageUrl?: string;
  externalUrl?: string;
  providerPopularity?: number;
  score: number;
  confidence: Confidence;
  source: MusicArtistSource;
};

export type MusicTrackSource = "top_track" | "recent_track";

export type MusicTrackSignal = {
  provider: MusicProvider;
  providerTrackId: string;
  title: string;
  artistNames: string[];
  albumName?: string;
  imageUrl?: string;
  externalUrl?: string;
  score: number;
  confidence: Confidence;
  source: MusicTrackSource;
};

export type MusicGenreSignal = {
  name: string;
  score: number;
  confidence: Confidence;
  sourceProviders: MusicProvider[];
};

export type MusicSceneSignal = {
  key: string;
  label: string;
  score: number;
  confidence: Confidence;
  derivedFrom: string[];
};

export type MusicTasteProfile = {
  userId: string;
  providers: MusicProviderConnection[];
  topArtists: MusicArtistSignal[];
  topTracks: MusicTrackSignal[];
  topGenres: MusicGenreSignal[];
  scenes: MusicSceneSignal[];
  updatedAt: string;
  expiresAt: string;
};

export type MusicPersonalizationSettings = {
  useMusicTastePersonalization: boolean;
  allowConcertSuggestions: boolean;
  allowVenueSuggestions: boolean;
  allowAiMusicInterpretation: boolean;
};

export const defaultMusicPersonalizationSettings = (): MusicPersonalizationSettings => ({
  useMusicTastePersonalization: false,
  allowConcertSuggestions: true,
  allowVenueSuggestions: true,
  allowAiMusicInterpretation: true,
});

/** Compact signals passed into trip / local prompts — never raw listening history. */
export type MusicPlanningSignals = {
  topArtists: string[];
  topGenres: string[];
  scenes: string[];
  vibe?: string;
  confidence: Confidence;
};

export type MusicVibeProfile = {
  travelVibe: string;
  preferredExperienceTypes: string[];
  avoidExperienceTypes: string[];
  explanation: string;
  confidence: Confidence;
};

export type MusicSuggestionDecision = {
  shouldSuggest: boolean;
  confidence: number;
  reason: string;
};
