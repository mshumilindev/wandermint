import type { TravelBehaviorProfile } from "../../features/user-behavior/travelBehavior.types";
import type { FlickSyncLibraryItem } from "../../entities/flicksync/model";
import type { MusicPlanningSignals } from "../../integrations/music/musicTypes";
import type { UserPreferences } from "../../entities/user/model";
import { mergePreferenceProfile } from "../preferences/preferenceConstraintsService";
import { mergeFoodDrinkPlannerSettings } from "../foodCulture/foodCultureDefaults";
import type { TripDraft } from "../planning/tripGenerationService";
import { buildFlightPlanningClause } from "../flights/flightPlanningHints";
import { MAX_FOOD_PREFERENCES } from "../food/foodPreferenceTypes";
import { MAX_MUST_SEE_PLACES } from "../places/placeTypes";
import type { WizardAccommodationBase } from "../accommodation/accommodationTypes";
import type { TransportNode } from "../transport/transportNodeTypes";

export const compactUserPreferencesForAi = (prefs: UserPreferences | null | undefined): Record<string, unknown> | null => {
  if (!prefs) {
    return null;
  }
  const preferenceProfile = mergePreferenceProfile(prefs.preferenceProfile ?? null);
  return {
    currency: prefs.currency,
    locale: prefs.locale,
    preferredPace: prefs.preferredPace,
    walkingTolerance: prefs.walkingTolerance,
    avoids: prefs.avoids.slice(0, 12),
    foodInterests: prefs.foodInterests.slice(0, 12),
    homeCity: prefs.homeCity,
    rightNowExploreSpeed: prefs.rightNowExploreSpeed,
    preferenceProfile:
      preferenceProfile.avoid.length + preferenceProfile.prefer.length > 0
        ? {
            avoid: preferenceProfile.avoid.slice(0, 24),
            prefer: preferenceProfile.prefer.slice(0, 16),
          }
        : undefined,
  };
};

export const compactBehaviorProfileForAi = (profile: TravelBehaviorProfile | null | undefined): Record<string, unknown> | null => {
  if (!profile) {
    return null;
  }
  return {
    preferredPace: profile.preferredPace,
    planningBias: profile.planningBias,
    averageCompletionRate: profile.averageCompletionRate,
    averageSkipRate: profile.averageSkipRate,
    totalTrips: profile.totalTrips,
  };
};

export const compactFlickSyncSignalsForAi = (items: FlickSyncLibraryItem[] | undefined, cap = 14): Array<{ title: string; mediaType: string }> => {
  if (!items?.length) {
    return [];
  }
  return items.slice(0, cap).map((i) => ({ title: i.title.slice(0, 80), mediaType: String(i.mediaType) }));
};

export const compactMusicSignalsForAi = (signals: MusicPlanningSignals | null | undefined): Record<string, unknown> | null => {
  if (!signals) {
    return null;
  }
  return {
    confidence: signals.confidence,
    topArtists: signals.topArtists.slice(0, 5),
    topGenres: signals.topGenres.slice(0, 5),
    scenes: signals.scenes.slice(0, 4),
    vibe: signals.vibe,
  };
};

const compactTransportNode = (node: TransportNode | undefined): Record<string, unknown> | null => {
  if (!node) {
    return null;
  }
  const p = node.place;
  return {
    type: node.type,
    name: p.name.slice(0, 120),
    provider: p.provider,
    coords: p.coordinates ? { lat: p.coordinates.lat, lng: p.coordinates.lng } : null,
  };
};

export const compactTransportNodesForAi = (draft: TripDraft): string => {
  const map = draft.segmentTransportNodes;
  if (!map || Object.keys(map).length === 0) {
    return "";
  }
  const parts: string[] = [];
  for (const seg of draft.tripSegments) {
    const row = map[seg.id];
    if (!row?.entry && !row?.exit) {
      continue;
    }
    const entry = compactTransportNode(row.entry);
    const exit = compactTransportNode(row.exit);
    if (entry || exit) {
      parts.push(`${seg.city}: entry=${entry ? `${entry.type}:${entry.name}` : "—"} exit=${exit ? `${exit.type}:${exit.name}` : "—"}`);
    }
  }
  return parts.join(" | ");
};

export const compactTripDraftForAi = (draft: TripDraft): Record<string, unknown> => ({
  planningMode: draft.planningMode,
  destination: draft.destination,
  dateRange: draft.dateRange,
  segmentCount: draft.tripSegments.length,
  budget: {
    amount: draft.budget.amount,
    currency: draft.budget.currency,
    style: draft.budget.style,
    dailySoftLimit: draft.budget.dailySoftLimit,
  },
  preferences: {
    partyComposition: draft.preferences.partyComposition,
    pace: draft.preferences.pace,
    walkingTolerance: draft.preferences.walkingTolerance,
    vibe: draft.preferences.vibe.slice(0, 10),
    avoids: draft.preferences.avoids.slice(0, 10),
    foodInterests: draft.preferences.foodInterests.slice(0, 10),
    mustSeeNotes: draft.preferences.mustSeeNotes.slice(0, 400),
    specialWishes: draft.preferences.specialWishes.slice(0, 400),
    foodDrinkPlanner: mergeFoodDrinkPlannerSettings(draft.preferences.foodDrinkPlanner),
  },
  mustSeePlaces: (draft.mustSeePlaces ?? []).slice(0, MAX_MUST_SEE_PLACES).map((p) => ({
    mode: p.mode,
    label: p.label.slice(0, 120),
    coords:
      p.mode === "resolved" && p.candidate?.coordinates
        ? { lat: p.candidate.coordinates.lat, lng: p.candidate.coordinates.lng }
        : null,
    provider: p.mode === "resolved" ? p.candidate?.provider : undefined,
  })),
  foodPreferences: (draft.foodPreferences ?? []).slice(0, MAX_FOOD_PREFERENCES).map((p) =>
    p.type === "restaurant"
      ? {
          type: "restaurant" as const,
          name: p.place.name.slice(0, 120),
          provider: p.place.provider,
          coords: p.place.coordinates ? { lat: p.place.coordinates.lat, lng: p.place.coordinates.lng } : null,
        }
      : { type: "intent" as const, label: p.label.slice(0, 120), tags: p.normalizedTags.slice(0, 8) },
  ),
  executionProfile: draft.executionProfile,
  anchorEvents: draft.anchorEvents.map((e) => ({
    title: e.title,
    city: e.city,
    country: e.country,
    startAt: e.startAt,
    endAt: e.endAt,
    venue: e.venue,
    provider: e.provider,
    providerEventId: e.providerEventId,
    coords:
      e.latitude !== undefined && e.longitude !== undefined && Number.isFinite(e.latitude) && Number.isFinite(e.longitude)
        ? { lat: e.latitude, lng: e.longitude }
        : null,
  })),
  tripSegments: draft.tripSegments.map((s) => ({
    city: s.city,
    country: s.country,
    startDate: s.startDate,
    endDate: s.endDate,
    hotelName: s.hotelInfo.name?.slice(0, 120),
  })),
  flightPlanning: buildFlightPlanningClause(draft).slice(0, 2500),
  transportHubs: compactTransportNodesForAi(draft).slice(0, 2000),
});

export const compactAccommodationBasesForAi = (draft: TripDraft): string => {
  const bases = draft.segmentAccommodationBases;
  if (!bases || Object.keys(bases).length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (const seg of draft.tripSegments) {
    const row = bases[seg.id];
    if (!row) {
      continue;
    }
    if (row.mode === "custom") {
      lines.push(`${seg.city}: custom base "${row.customText ?? row.label}"`);
      continue;
    }
    const c = row.candidate;
    const coord =
      c?.coordinates && typeof c.coordinates.lat === "number" && typeof c.coordinates.lng === "number"
        ? `${c.coordinates.lat.toFixed(4)},${c.coordinates.lng.toFixed(4)}`
        : "no_coords";
    lines.push(
      `${seg.city}: ${row.label}${c?.address ? `; ${c.address}` : ""} [${coord}] sources:${(c?.mergedFromProviders ?? [c?.provider]).filter(Boolean).join("+")}`,
    );
  }
  return lines.join(" | ");
};

export const compactAccommodationBaseForAi = (base: WizardAccommodationBase | undefined): Record<string, unknown> | null => {
  if (!base) {
    return null;
  }
  if (base.mode === "custom") {
    return { mode: "custom", label: base.label.slice(0, 120), customText: base.customText?.slice(0, 120) };
  }
  const c = base.candidate;
  return {
    mode: "resolved",
    label: base.label.slice(0, 120),
    provider: c?.provider,
    coords: c?.coordinates ? { lat: c.coordinates.lat, lng: c.coordinates.lng } : null,
    city: c?.city,
    country: c?.country,
  };
};
