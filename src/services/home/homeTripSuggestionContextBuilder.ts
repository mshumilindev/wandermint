import dayjs from "dayjs";
import type { FlickSyncLibraryItem } from "../../entities/flicksync/model";
import type { Trip } from "../../entities/trip/model";
import type { BucketListItem, BucketListPayload } from "../../features/bucket-list/bucketList.types";
import type { PreferenceProfile, UserPreferences } from "../../entities/user/model";
import { bucketListRepository } from "../../features/bucket-list/bucketListRepository";
import { bucketListFeasibilityScore, bucketListItemCityCountry } from "../../features/bucket-list/bucketListNormalize";
import { privacySettingsRepository } from "../../features/privacy/privacySettingsRepository";
import { shouldPersistTravelBehaviorProfile } from "../../features/privacy/privacyActions";
import type { TravelBehaviorProfile } from "../../features/user-behavior/travelBehavior.types";
import { travelBehaviorRepository } from "../../features/user-behavior/travelBehaviorRepository";
import type { TravelTasteProfile } from "../../features/user-taste/travelTaste.types";
import { travelTasteRepository } from "../../features/user-taste/travelTasteRepository";
import { defaultMusicPersonalizationSettings, type MusicTasteProfile } from "../../integrations/music/musicTypes";
import { flickSyncLibraryRepository } from "../flicksync/flickSyncLibraryRepository";
import { scoreFlickSyncLibraryInterest } from "../flicksync/flickSyncLibrarySignals";
import { tripsRepository } from "../firebase/repositories/tripsRepository";
import { userPreferencesRepository } from "../firebase/repositories/userPreferencesRepository";
import { getEnabledMusicPersonalization } from "../personalization/music/musicPersonalizationService";
import { defaultPreferenceProfile, mergePreferenceProfile } from "../preferences/preferenceConstraintsService";

export type TravelBehaviorSummary = {
  planningStyle: TravelBehaviorProfile["planningBias"];
  executionStyle: TravelBehaviorProfile["preferredPace"];
  categoryAffinity: Record<string, number>;
  skipPatterns: { averageSkipRate: number; averageCompletionRate: number };
};

export type TripHistoryEntry = {
  tripId: string;
  title: string;
  status: Trip["status"];
  destinations: Array<{ city: string; country: string }>;
  durationDays: number;
  /** Proxy for satisfaction: completion-heavy trips score higher. */
  executionScore: number;
  endedAt: string;
};

export type FlickSyncSummary = {
  topTitles: string[];
  topMediaTypes: string[];
  interestSignals: string[];
};

export type MusicProfileSummary = {
  topArtists: string[];
  topGenres: string[];
  scenes: string[];
};

export type BudgetPatternSummary = {
  avgDailySpend: number | null;
  minDaily: number | null;
  maxDaily: number | null;
  currency: string;
  dominantStyle: "lean" | "balanced" | "premium" | "unknown";
};

export type BucketListSummaryRow = {
  id: string;
  payloadType: BucketListPayload["type"];
  title: string;
  city?: string;
  country?: string;
  priority: BucketListItem["priority"];
  updatedAt: string;
  touchCount: number;
  feasibilityScore: number;
};

export type BucketListSummary = {
  /** Open items ranked for homepage scoring (recency × frequency × feasibility). */
  rows: BucketListSummaryRow[];
  savedDestinations: Array<{ title: string; country?: string; city?: string; priority: BucketListItem["priority"]; id: string }>;
  savedActivities: Array<{ title: string; id: string; priority: BucketListItem["priority"] }>;
};

export type HomeSuggestionContext = {
  userId: string;
  travelBehavior: TravelBehaviorSummary | null;
  tripHistory: TripHistoryEntry[];
  flickSync: FlickSyncSummary;
  music: MusicProfileSummary | null;
  budget: BudgetPatternSummary;
  bucketList: BucketListSummary;
  /** Normalized account-wide avoid / prefer constraints (home scoring + AI). */
  preferenceProfile: PreferenceProfile;
  lastTripDate: string | null;
  tasteConfidence: number;
  /** When false, taste/behavior Firestore profiles were not loaded (privacy or missing). */
  personalizationAllowed: boolean;
  /** Account preferences when loaded (null if fetch failed). */
  accountPreferences?: UserPreferences | null;
};

const tripDurationDays = (trip: Trip): number => {
  const start = dayjs(trip.dateRange.start);
  const end = dayjs(trip.dateRange.end);
  const d = end.diff(start, "day") + 1;
  return Math.max(1, Number.isFinite(d) ? d : 1);
};

const executionScoreForTrip = (trip: Trip, behavior: TravelBehaviorProfile | null): number => {
  const statusWeight =
    trip.status === "completed"
      ? 1
      : trip.status === "partially_completed"
        ? 0.75
        : trip.status === "needs_review"
          ? 0.6
          : trip.status === "active"
            ? 0.5
            : 0.35;
  const completion = behavior?.averageCompletionRate ?? 0.65;
  return Math.min(1, statusWeight * 0.7 + Math.min(1, Math.max(0, completion)) * 0.3);
};

const buildTripHistory = (trips: Trip[], behavior: TravelBehaviorProfile | null, max = 10): TripHistoryEntry[] => {
  const sorted = [...trips].sort((a, b) => dayjs(b.dateRange.end).valueOf() - dayjs(a.dateRange.end).valueOf());
  return sorted.slice(0, max).map((trip) => ({
    tripId: trip.id,
    title: trip.title,
    status: trip.status,
    destinations: trip.tripSegments.map((s) => ({ city: s.city, country: s.country })),
    durationDays: tripDurationDays(trip),
    executionScore: executionScoreForTrip(trip, behavior),
    endedAt: trip.dateRange.end,
  }));
};

const computeBudgetPatterns = (trips: Trip[], fallbackCurrency: string): BudgetPatternSummary => {
  const completedLike = trips.filter((t) =>
    ["completed", "partially_completed", "needs_review", "active"].includes(t.status),
  );
  if (completedLike.length === 0) {
    return {
      avgDailySpend: null,
      minDaily: null,
      maxDaily: null,
      currency: fallbackCurrency,
      dominantStyle: "unknown",
    };
  }
  const dailies: number[] = [];
  let lean = 0;
  let balanced = 0;
  let premium = 0;
  for (const trip of completedLike) {
    const days = tripDurationDays(trip);
    const soft = trip.budget.dailySoftLimit;
    if (typeof soft === "number" && soft > 0 && days > 0) {
      dailies.push(soft);
    } else if (trip.budget.amount > 0 && days > 0) {
      dailies.push(trip.budget.amount / days);
    }
    if (trip.budget.style === "lean") lean += 1;
    else if (trip.budget.style === "premium") premium += 1;
    else balanced += 1;
  }
  const dominantStyle: BudgetPatternSummary["dominantStyle"] =
    lean >= balanced && lean >= premium ? "lean" : premium >= balanced ? "premium" : balanced > 0 ? "balanced" : "unknown";
  const currency =
    completedLike.find((t) => t.budget.currency)?.budget.currency ?? fallbackCurrency;
  if (dailies.length === 0) {
    return { avgDailySpend: null, minDaily: null, maxDaily: null, currency, dominantStyle };
  }
  const sum = dailies.reduce((a, b) => a + b, 0);
  return {
    avgDailySpend: sum / dailies.length,
    minDaily: Math.min(...dailies),
    maxDaily: Math.max(...dailies),
    currency,
    dominantStyle,
  };
};

const summarizeFlickSync = (items: FlickSyncLibraryItem[]): FlickSyncSummary => {
  const ranked = [...items].sort((a, b) => scoreFlickSyncLibraryInterest(b) - scoreFlickSyncLibraryInterest(a));
  const top = ranked.slice(0, 12);
  const types = new Map<string, number>();
  for (const item of top) {
    const k = item.mediaType || "unknown";
    types.set(k, (types.get(k) ?? 0) + 1);
  }
  const topMediaTypes = [...types.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return {
    topTitles: top.map((i) => i.title).filter(Boolean),
    topMediaTypes,
    interestSignals: top.slice(0, 5).flatMap((i) => {
      const s = scoreFlickSyncLibraryInterest(i);
      return s > 3 ? [`${i.title} (${i.mediaType})`] : [];
    }),
  };
};

const rankOpenBucketRow = (r: BucketListSummaryRow): number => {
  const days = dayjs().diff(dayjs(r.updatedAt), "day");
  const recency = Math.exp(-Math.max(0, days) / 95);
  const frequency = Math.min(1, Math.log1p(Math.max(1, r.touchCount)) / 4);
  return recency * 0.38 + frequency * 0.24 + r.feasibilityScore * 0.28 + (r.priority === "high" ? 0.1 : r.priority === "medium" ? 0.06 : 0.03);
};

const summarizeBucketList = (items: BucketListItem[]): BucketListSummary => {
  const open = items.filter((i) => !i.visited);
  const rows: BucketListSummaryRow[] = open.map((i) => {
    const cc = bucketListItemCityCountry(i);
    return {
      id: i.id,
      payloadType: i.payload.type,
      title: i.title,
      city: cc.city,
      country: cc.country,
      priority: i.priority,
      updatedAt: i.updatedAt,
      touchCount: i.touchCount,
      feasibilityScore: bucketListFeasibilityScore(i),
    };
  });
  rows.sort((a, b) => rankOpenBucketRow(b) - rankOpenBucketRow(a));

  const geo = rows.filter((r) => (r.payloadType === "destination" || r.payloadType === "place") && r.country);
  const savedDestinations = geo.slice(0, 20).map((r) => ({
    id: r.id,
    title: r.title,
    country: r.country,
    city: r.city,
    priority: r.priority,
  }));
  const activities = rows.filter((r) => r.payloadType === "experience" || r.payloadType === "event");
  const savedActivities = activities.slice(0, 15).map((r) => ({
    id: r.id,
    title: r.title,
    priority: r.priority,
  }));
  return { rows, savedDestinations, savedActivities };
};

export const buildHomeSuggestionContext = async (userId: string): Promise<HomeSuggestionContext> => {
  const uid = userId.trim();
  if (!uid) {
    throw new Error("buildHomeSuggestionContext requires a non-empty userId");
  }

  const [privacy, trips, prefs, bucketItems, flickItems, musicBundle] = await Promise.all([
    privacySettingsRepository.getPrivacySettings(uid).catch(() => null),
    tripsRepository.getUserTrips(uid).catch(() => [] as Trip[]),
    userPreferencesRepository.getPreferences(uid).catch(() => null),
    bucketListRepository.listByUserId(uid).catch(() => [] as BucketListItem[]),
    flickSyncLibraryRepository.getUserLibrary(uid, 120).catch(() => [] as FlickSyncLibraryItem[]),
    getEnabledMusicPersonalization(uid).catch(() => ({
      settings: defaultMusicPersonalizationSettings(),
      profile: null as MusicTasteProfile | null,
      planningConfidence: "low" as const,
      profileFreshness: "none" as const,
    })),
  ]);

  const personalizationAllowed = shouldPersistTravelBehaviorProfile(privacy);
  const [behaviorProfile, tasteProfile] = personalizationAllowed
    ? await Promise.all([
        travelBehaviorRepository.getProfile(uid).catch(() => null),
        travelTasteRepository.getProfile(uid).catch(() => null),
      ])
    : [null, null];

  const fallbackCurrency = prefs?.currency ?? "USD";
  const history = buildTripHistory(trips, behaviorProfile, 10);
  const lastTripDate =
    history.length > 0 ? history.reduce((best, h) => (dayjs(h.endedAt).isAfter(dayjs(best)) ? h.endedAt : best), history[0]!.endedAt) : null;

  const travelBehavior: TravelBehaviorSummary | null = behaviorProfile
    ? {
        planningStyle: behaviorProfile.planningBias,
        executionStyle: behaviorProfile.preferredPace,
        categoryAffinity: tasteProfile?.categoryAffinity ?? {},
        skipPatterns: {
          averageSkipRate: behaviorProfile.averageSkipRate,
          averageCompletionRate: behaviorProfile.averageCompletionRate,
        },
      }
    : null;

  const musicProfile = musicBundle.profile;
  const music: MusicProfileSummary | null = musicProfile
    ? {
        topArtists: musicProfile.topArtists.slice(0, 8).map((a) => a.name),
        topGenres: musicProfile.topGenres.slice(0, 8).map((g) => g.name),
        scenes: musicProfile.scenes.slice(0, 6).map((s) => s.label),
      }
    : null;

  return {
    userId: uid,
    travelBehavior,
    tripHistory: history,
    flickSync: summarizeFlickSync(flickItems),
    music,
    budget: computeBudgetPatterns(trips, fallbackCurrency),
    bucketList: summarizeBucketList(bucketItems),
    preferenceProfile: mergePreferenceProfile(prefs?.preferenceProfile ?? defaultPreferenceProfile()),
    lastTripDate,
    tasteConfidence: tasteProfile?.confidence ?? 0,
    personalizationAllowed,
    accountPreferences: prefs,
  };
};
