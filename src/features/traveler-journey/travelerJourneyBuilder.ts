import type { Trip } from "../../entities/trip/model";
import { isSyntheticTravelMemoryTripId } from "../travel-stats/travelMemoryTripEquivalence";
import { ACHIEVEMENT_DEFINITIONS } from "../achievements/achievement.definitions";
import type { AchievementProgressDocument } from "../achievements/achievementRepository";
import type { BucketListItem } from "../bucket-list/bucketList.types";
import type {
  TravelerJourney,
  TravelerJourneyBuildInput,
  TravelerJourneyEdge,
  TravelerJourneyMilestoneKind,
  TravelerJourneyNode,
} from "./travelerJourney.types";

const COMPLETED_STATUSES = new Set(["completed", "partially_completed"]);

const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENT_DEFINITIONS.map((a) => [a.key, a]));

/** Last segment of "City, Country" style home label — used for first-international detection. */
export function parseHomeCountryFromHomeCityLabel(homeCity: string): string {
  const parts = homeCity.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    return "";
  }
  return parts[parts.length - 1] ?? "";
}

export function buildCountriesByTripId(trips: Iterable<Trip>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const t of trips) {
    const countries = [...new Set((t.tripSegments ?? []).map((s) => s.country).filter(Boolean))] as string[];
    m.set(t.id, countries);
  }
  return m;
}

function normalizeCountry(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function tripDurationDays(trip: Trip): number {
  const start = trip.dateRange?.start ? new Date(trip.dateRange.start).getTime() : NaN;
  const end = trip.dateRange?.end ? new Date(trip.dateRange.end).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

function tripEndDateIso(trip: Trip): string | undefined {
  return trip.dateRange?.end ?? trip.dateRange?.start;
}

function isInternationalTrip(trip: Trip, home: string): boolean {
  const h = normalizeCountry(home);
  if (!h) return false;
  const segs = trip.tripSegments ?? [];
  return segs.some((s) => normalizeCountry(s.country) && normalizeCountry(s.country) !== h);
}

function isSoloTrip(trip: Trip): boolean {
  if (isSyntheticTravelMemoryTripId(trip.id)) {
    return false;
  }
  return trip.preferences?.partyComposition === "solo";
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/**
 * Builds a graph of the traveler’s history: completed trips on a spine,
 * cities and achievements as related nodes, milestones for narrative beats.
 */
export function buildTravelerJourney(
  trips: Trip[],
  achievements: AchievementProgressDocument[],
  bucketItems: BucketListItem[],
  input: TravelerJourneyBuildInput = {},
): TravelerJourney {
  const home = input.homeCountry ?? "";
  const completionById = input.tripCompletionByTripId ?? {};

  const finished = trips
    .filter((t) => COMPLETED_STATUSES.has(t.status))
    .slice()
    .sort((a, b) => {
      const ea = tripEndDateIso(a) ?? "";
      const eb = tripEndDateIso(b) ?? "";
      return ea.localeCompare(eb);
    });

  const nodes: TravelerJourneyNode[] = [];
  const edges: TravelerJourneyEdge[] = [];

  const countrySet = new Set<string>();
  const citySet = new Set<string>();

  for (const trip of finished) {
    for (const seg of trip.tripSegments ?? []) {
      if (seg.country) countrySet.add(normalizeCountry(seg.country));
      if (seg.city) citySet.add(`${normalizeCountry(seg.country)}|${seg.city.trim().toLowerCase()}`);
    }
  }

  let longestTripId: string | null = null;
  let longestDays = 0;
  for (const trip of finished) {
    const d = tripDurationDays(trip);
    if (d > longestDays) {
      longestDays = d;
      longestTripId = trip.id;
    }
  }

  let mostCompletedTripId: string | null = null;
  let bestRatio = -1;
  for (const trip of finished) {
    const r = completionById[trip.id];
    if (typeof r === "number" && r > bestRatio) {
      bestRatio = r;
      mostCompletedTripId = trip.id;
    }
  }

  const milestoneFlags = new Map<string, Set<TravelerJourneyMilestoneKind>>();

  const markMilestone = (tripId: string, kind: TravelerJourneyMilestoneKind) => {
    if (!milestoneFlags.has(tripId)) milestoneFlags.set(tripId, new Set());
    milestoneFlags.get(tripId)!.add(kind);
  };

  const firstFinished = finished[0];
  if (firstFinished) {
    markMilestone(firstFinished.id, "first_trip");
  }

  let seenIntl = false;
  let seenSolo = false;
  for (const trip of finished) {
    if (!seenIntl && home && isInternationalTrip(trip, home)) {
      markMilestone(trip.id, "first_international");
      seenIntl = true;
    }
    if (!seenSolo && isSoloTrip(trip)) {
      markMilestone(trip.id, "first_solo");
      seenSolo = true;
    }
  }

  if (longestTripId) markMilestone(longestTripId, "longest_trip");
  if (mostCompletedTripId && bestRatio >= 0) markMilestone(mostCompletedTripId, "most_completed");

  let prevTripNodeId: string | null = null;

  for (const trip of finished) {
    const endIso = tripEndDateIso(trip);
    const days = tripDurationDays(trip);
    const kinds = milestoneFlags.get(trip.id);
    const hasMilestone = kinds && kinds.size > 0;
    const baseImportance = Math.min(1, 0.45 + Math.min(days, 21) / 42);
    const importance = hasMilestone ? Math.min(1, baseImportance + 0.28) : baseImportance;

    const tripNodeId = `trip:${trip.id}`;
    const subtitleParts: string[] = [];
    if (kinds?.has("first_trip")) subtitleParts.push("First trip");
    if (kinds?.has("first_international")) subtitleParts.push("First international");
    if (kinds?.has("first_solo")) subtitleParts.push("First solo");
    if (kinds?.has("longest_trip")) subtitleParts.push("Longest journey");
    if (kinds?.has("most_completed")) subtitleParts.push("Most completed");

    nodes.push({
      id: tripNodeId,
      type: "trip",
      label: trip.title || "Trip",
      date: endIso,
      tripId: trip.id,
      importance,
      completed: true,
      milestoneKind: kinds ? [...kinds][0] : undefined,
      subtitle: subtitleParts.length ? subtitleParts.join(" · ") : `${days} day${days === 1 ? "" : "s"}`,
      category: [trip.preferences?.partyComposition, ...(trip.preferences?.vibe ?? [])].filter(Boolean).join(" ") || undefined,
    });

    if (prevTripNodeId) {
      edges.push({ from: prevTripNodeId, to: tripNodeId, type: "sequence" });
    }
    prevTripNodeId = tripNodeId;

    const seenCityInTrip = new Set<string>();
    for (const seg of trip.tripSegments ?? []) {
      if (!seg.city?.trim()) continue;
      const key = `${normalizeCountry(seg.country)}|${seg.city.trim().toLowerCase()}`;
      if (seenCityInTrip.has(key)) continue;
      seenCityInTrip.add(key);
      const cityId = `city:${trip.id}:${slug(seg.city)}`;
      nodes.push({
        id: cityId,
        type: "city",
        label: seg.city.trim(),
        date: seg.endDate ?? seg.startDate ?? endIso,
        tripId: trip.id,
        importance: 0.35,
        completed: true,
        subtitle: seg.country,
      });
      edges.push({ from: tripNodeId, to: cityId, type: "relation" });
    }
  }

  const unlockedAchievements = achievements.filter((a) => a.unlocked);
  for (const a of unlockedAchievements) {
    const id = `achievement:${a.achievementKey}`;
    const date = a.unlockedAt ?? a.updatedAt;
    const def = ACHIEVEMENT_BY_KEY.get(a.achievementKey);
    nodes.push({
      id,
      type: "achievement",
      label: def?.title ?? a.achievementKey.replace(/_/g, " "),
      date,
      category: def?.category,
      importance: 0.72,
      completed: true,
      milestoneKind: "achievement_unlock",
      subtitle: "Achievement",
    });
    const anchor = finished
      .filter((t) => {
        const end = tripEndDateIso(t);
        return end && date && end <= date;
      })
      .pop();
    if (anchor) {
      edges.push({ from: `trip:${anchor.id}`, to: id, type: "relation" });
    }
  }

  const visitedBuckets = bucketItems.filter((b) => b.visited && b.visitedAt);
  const capBuckets = 24;
  for (const b of visitedBuckets.slice(0, capBuckets)) {
    const id = `bucket:${b.id}`;
    nodes.push({
      id,
      type: "milestone",
      label: b.title,
      date: b.visitedAt,
      tripId: undefined,
      location: b.location?.lat != null && b.location?.lng != null ? { lat: b.location.lat, lng: b.location.lng } : undefined,
      importance: 0.55,
      completed: true,
      subtitle: b.location?.city ? `${b.location.city}${b.location.country ? `, ${b.location.country}` : ""}` : "Bucket list",
      category: b.category,
    });
    const anchor = finished
      .filter((t) => {
        const end = tripEndDateIso(t);
        return end && b.visitedAt && end <= b.visitedAt;
      })
      .pop();
    if (anchor) {
      edges.push({ from: `trip:${anchor.id}`, to: id, type: "relation" });
    }
  }

  return {
    nodes,
    edges,
    totalTrips: finished.length,
    totalCountries: countrySet.size,
    totalCities: citySet.size,
  };
}
