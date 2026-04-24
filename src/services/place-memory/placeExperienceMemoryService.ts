import type { ActivityBlock, PlaceSnapshot } from "../../entities/activity/model";
import type { PlaceExperienceMemory, PlaceMemoryActionInput, TravelPartyContext } from "../../entities/place-memory/model";
import { createClientId } from "../../shared/lib/id";
import { nowIso } from "../firebase/timestampMapper";

const normalizeToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[|]/g, " ");

const safeIdPart = (value: string): string => encodeURIComponent(value).slice(0, 360);

const inferShareableFromTags = (tags: string[]): boolean => {
  const normalized = tags.map(normalizeToken);
  return normalized.some((tag) =>
    ["iconic", "landmark", "viewpoint", "scenic", "rooftop", "showcase", "signature", "gallery", "museum", "attraction"].includes(tag),
  );
};

const cityCountryFromLabel = (locationLabel?: string): { city?: string; country?: string } => {
  if (!locationLabel) {
    return {};
  }

  const [city, country] = locationLabel.split(",").map((part) => part.trim());
  return {
    city: city || undefined,
    country: country || undefined,
  };
};

export const placeExperienceMemoryService = {
  createPlaceKey: (place: PlaceSnapshot, cityHint?: string, countryHint?: string): string => {
    if (place.providerPlaceId) {
      return `${normalizeToken(place.provider)}:${normalizeToken(place.providerPlaceId)}`;
    }

    const addressBits = [place.name, place.address, cityHint, countryHint].filter((value): value is string => Boolean(value)).map(normalizeToken);
    return `${normalizeToken(place.provider)}:${addressBits.join("|")}`;
  },

  createMemoryId: (userId: string, placeKey: string): string => `${safeIdPart(userId)}__${safeIdPart(placeKey)}`,

  createActionInputFromPlace: (
    userId: string,
    place: PlaceSnapshot,
    options?: {
      city?: string;
      country?: string;
      category?: string;
      tags?: string[];
      travelPartyContext?: TravelPartyContext;
      completed?: boolean;
      skipped?: boolean;
      isFavorite?: boolean;
      notInterested?: boolean;
      showToOthersCandidate?: boolean;
      happenedAt?: string;
    },
  ): PlaceMemoryActionInput => {
    const city = options?.city ?? cityCountryFromLabel(place.address).city;
    const country = options?.country ?? cityCountryFromLabel(place.address).country;
    const placeKey = placeExperienceMemoryService.createPlaceKey(place, city, country);

    return {
      userId,
      placeKey,
      placeName: place.name,
      provider: place.provider,
      providerPlaceId: place.providerPlaceId,
      city,
      country,
      experienceCategory: options?.category,
      tags: options?.tags ?? [],
      travelPartyContext: options?.travelPartyContext,
      completed: options?.completed,
      skipped: options?.skipped,
      isFavorite: options?.isFavorite,
      notInterested: options?.notInterested,
      showToOthersCandidate: options?.showToOthersCandidate,
      happenedAt: options?.happenedAt ?? nowIso(),
    };
  },

  mergeAction: (existing: PlaceExperienceMemory | null, input: PlaceMemoryActionInput): PlaceExperienceMemory => {
    const createdAt = existing?.createdAt ?? nowIso();
    const currentContexts = existing?.contextVisitCounts ?? {};
    const nextContextCounts =
      input.travelPartyContext
        ? {
            ...currentContexts,
            [input.travelPartyContext]: (currentContexts[input.travelPartyContext] ?? 0) + 1,
          }
        : currentContexts;
    const nextTags = Array.from(
      new Set(
        [...(existing?.tags ?? []), ...(input.tags ?? [])]
          .filter((tag): tag is string => Boolean(tag))
          .map(normalizeToken),
      ),
    );
    const nextContexts = Array.from(new Set([...(existing?.travelPartyContexts ?? []), ...(input.travelPartyContext ? [input.travelPartyContext] : [])]));

    return {
      id: existing?.id ?? placeExperienceMemoryService.createMemoryId(input.userId, input.placeKey),
      userId: input.userId,
      placeKey: input.placeKey,
      provider: input.provider ?? existing?.provider,
      providerPlaceId: input.providerPlaceId ?? existing?.providerPlaceId,
      placeName: input.placeName || existing?.placeName || "Saved place",
      experienceCategory: input.experienceCategory ?? existing?.experienceCategory,
      visitCount: (existing?.visitCount ?? 0) + 1,
      completedCount: (existing?.completedCount ?? 0) + (input.completed ? 1 : 0),
      skippedCount: (existing?.skippedCount ?? 0) + (input.skipped ? 1 : 0),
      lastVisitedAt: input.happenedAt,
      wasCompleted: input.completed ?? existing?.wasCompleted ?? false,
      isFavorite: input.isFavorite ?? existing?.isFavorite ?? false,
      notInterested: input.notInterested ?? existing?.notInterested,
      city: input.city ?? existing?.city,
      country: input.country ?? existing?.country,
      tags: nextTags,
      travelPartyContexts: nextContexts,
      contextVisitCounts: nextContextCounts,
      showToOthersCandidate:
        input.showToOthersCandidate ??
        existing?.showToOthersCandidate ??
        Boolean((input.isFavorite ?? existing?.isFavorite) || inferShareableFromTags(nextTags)),
      createdAt,
      updatedAt: nowIso(),
    };
  },

  toggleFavorite: (existing: PlaceExperienceMemory, value: boolean): PlaceExperienceMemory => ({
    ...existing,
    isFavorite: value,
    updatedAt: nowIso(),
    showToOthersCandidate: value || existing.showToOthersCandidate,
  }),

  setNotInterested: (existing: PlaceExperienceMemory, value: boolean): PlaceExperienceMemory => ({
    ...existing,
    notInterested: value,
    updatedAt: nowIso(),
  }),

  displayLabelForPlace: (block: ActivityBlock): { city?: string; country?: string; tags: string[]; showToOthersCandidate: boolean } => {
    const cityCountry = cityCountryFromLabel(block.place?.address);
    const tags = [block.category, ...block.tags].filter(Boolean);
    return {
      city: cityCountry.city,
      country: cityCountry.country,
      tags,
      showToOthersCandidate: inferShareableFromTags(tags) || block.priority === "must",
    };
  },

  createEmptyMemory: (input: PlaceMemoryActionInput): PlaceExperienceMemory =>
    placeExperienceMemoryService.mergeAction(null, input),

  inferContextFromTripParty: (value: string | undefined): TravelPartyContext => {
    if (value === "couple" || value === "friends" || value === "family" || value === "group") {
      return value;
    }
    return "solo";
  },
};
