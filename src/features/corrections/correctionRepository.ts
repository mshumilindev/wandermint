import type { OpeningHours } from "../places/opening-hours/openingHours.types";
import type {
  EnrichedCoordinates,
  EnrichedOpeningHours,
  EnrichedPriceRange,
  PlaceEnrichmentContribution,
  PlaceEnrichmentPartial,
} from "../places/enrichment/placeEnrichment.types";
import type { UserCorrection } from "./correction.types";

const STORAGE_KEY = "wandermint.userCorrections.v1";

type CorrectionsStoreV1 = {
  v: 1;
  items: UserCorrection[];
};

const emptyStore = (): CorrectionsStoreV1 => ({ v: 1, items: [] });

const readStore = (): CorrectionsStoreV1 => {
  if (typeof localStorage === "undefined") {
    return emptyStore();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyStore();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("items" in parsed)) {
      return emptyStore();
    }
    const items = (parsed as CorrectionsStoreV1).items;
    if (!Array.isArray(items)) {
      return emptyStore();
    }
    return { v: 1, items: items.filter((row) => row && typeof row === "object" && typeof (row as UserCorrection).id === "string") as UserCorrection[] };
  } catch {
    return emptyStore();
  }
};

const writeStore = (store: CorrectionsStoreV1): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private mode
  }
};

const sameEntityField = (a: UserCorrection, userId: string, entityId: string, field: string): boolean =>
  a.userId === userId && a.entityId === entityId && a.field === field;

/**
 * Persisted corrections (separate from trips / enrichment cache). Latest row per
 * `(userId, entityId, field)` wins.
 */
export const correctionRepository = {
  listForUser: async (userId: string): Promise<UserCorrection[]> => {
    if (!userId.trim()) {
      return [];
    }
    return readStore().items.filter((c) => c.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  listForEntity: async (userId: string, entityId: string): Promise<UserCorrection[]> => {
    if (!userId.trim() || !entityId.trim()) {
      return [];
    }
    return readStore()
      .items.filter((c) => c.userId === userId && c.entityId === entityId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getLatestForField: async (userId: string, entityId: string, field: string): Promise<UserCorrection | null> => {
    const list = await correctionRepository.listForEntity(userId, entityId);
    return list.find((c) => c.field === field) ?? null;
  },

  save: async (correction: UserCorrection): Promise<void> => {
    const store = readStore();
    const next = store.items.filter(
      (c) => !sameEntityField(c, correction.userId, correction.entityId, correction.field),
    );
    next.push(correction);
    writeStore({ v: 1, items: next });
  },

  delete: async (userId: string, correctionId: string): Promise<void> => {
    const store = readStore();
    writeStore({
      v: 1,
      items: store.items.filter((c) => !(c.userId === userId && c.id === correctionId)),
    });
  },
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const parseOpeningHoursValue = (raw: unknown): { structured?: OpeningHours; label?: string; timezone?: string } | null => {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.variant === "structured" && isRecord(raw.value) && typeof (raw.value as OpeningHours).sourceLabel === "string") {
    return { structured: raw.value as OpeningHours };
  }
  if (raw.variant === "label" && typeof raw.label === "string") {
    return { label: raw.label, timezone: typeof raw.timezone === "string" ? raw.timezone : undefined };
  }
  if (typeof raw.sourceLabel === "string" && typeof raw.timezone === "string") {
    return { structured: raw as unknown as OpeningHours };
  }
  if (typeof raw.label === "string") {
    return { label: raw.label, timezone: typeof raw.timezone === "string" ? raw.timezone : undefined };
  }
  return null;
};

/**
 * Turns stored {@link UserCorrection} rows into enrichment contributions so merge runs
 * with {@link FieldConfidence} `user_override` (see `enrichPlace`).
 */
export const userCorrectionsToPlaceContributions = (corrections: readonly UserCorrection[]): PlaceEnrichmentContribution[] => {
  const out: PlaceEnrichmentContribution[] = [];
  for (const c of corrections) {
    const partial: PlaceEnrichmentPartial = {};
    switch (c.field) {
      case "location": {
        const v = c.newValue;
        if (isRecord(v) && typeof v.lat === "number" && typeof v.lng === "number") {
          partial.coordinates = { lat: v.lat, lng: v.lng } satisfies EnrichedCoordinates;
        }
        break;
      }
      case "openingHours": {
        const parsed = parseOpeningHoursValue(c.newValue);
        if (parsed?.structured) {
          partial.openingHoursStructured = parsed.structured;
        } else if (parsed?.label) {
          partial.openingHoursLabel = parsed.label;
          partial.openingHoursTimezone = parsed.timezone;
        }
        break;
      }
      case "image": {
        if (typeof c.newValue === "string" && c.newValue.trim() !== "") {
          partial.imageUrl = c.newValue.trim();
        }
        break;
      }
      case "price": {
        if (typeof c.newValue === "number" && Number.isFinite(c.newValue)) {
          partial.priceLevel = c.newValue;
        } else if (isRecord(c.newValue) && typeof c.newValue.min === "number" && typeof c.newValue.max === "number") {
          const cur = typeof c.newValue.currency === "string" ? c.newValue.currency : "USD";
          partial.priceRange = { min: c.newValue.min, max: c.newValue.max, currency: cur } satisfies EnrichedPriceRange;
        }
        break;
      }
      case "category": {
        if (typeof c.newValue === "string" && c.newValue.trim() !== "") {
          partial.category = c.newValue.trim();
        }
        break;
      }
      case "eventDate":
      default:
        break;
    }

    if (Object.keys(partial).length === 0) {
      continue;
    }

    out.push({
      contributionId: `user-correction:${c.id}`,
      sourceKind: "user_correction",
      defaultFactualReliability: "user_override",
      partial,
    });
  }
  return out;
};

export const clearCorrectionRepositoryForTests = (): void => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
};
