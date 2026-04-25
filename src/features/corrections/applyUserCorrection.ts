import { invalidatePlaceEnrichmentCache } from "../places/enrichment/enrichPlace";
import type { ApplyUserCorrectionInput, UserCorrection, UserCorrectableField } from "./correction.types";
import { isUserCorrectableField } from "./correction.types";
import { correctionRepository } from "./correctionRepository";

const newCorrectionId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const validateNewValue = (field: UserCorrectableField, newValue: unknown): void => {
  switch (field) {
    case "location": {
      const v = newValue as { lat?: unknown; lng?: unknown };
      if (typeof v?.lat !== "number" || typeof v?.lng !== "number" || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) {
        throw new TypeError('location correction expects newValue: { lat: number; lng: number }');
      }
      return;
    }
    case "eventDate": {
      if (typeof newValue !== "string" || newValue.trim() === "") {
        throw new TypeError("eventDate correction expects newValue: non-empty ISO or YYYY-MM-DD string.");
      }
      return;
    }
    case "openingHours": {
      if (newValue === null || typeof newValue !== "object") {
        throw new TypeError("openingHours correction expects newValue: structured OpeningHours or EnrichedOpeningHours shape.");
      }
      return;
    }
    case "image": {
      if (typeof newValue !== "string" || newValue.trim() === "") {
        throw new TypeError("image correction expects newValue: non-empty URL string.");
      }
      return;
    }
    case "price": {
      if (typeof newValue === "number" && Number.isFinite(newValue)) {
        return;
      }
      const o = newValue as { min?: unknown; max?: unknown };
      if (typeof o?.min === "number" && typeof o?.max === "number") {
        return;
      }
      throw new TypeError("price correction expects newValue: number (price level) or { min, max, currency? }.");
    }
    case "category": {
      if (typeof newValue !== "string" || newValue.trim() === "") {
        throw new TypeError("category correction expects newValue: non-empty string.");
      }
      return;
    }
  }
};

/**
 * Records a manual user correction (stored separately from provider / AI data),
 * invalidates the place enrichment memo for {@link ApplyUserCorrectionInput.entityId},
 * and returns the persisted row. Downstream {@link enrichPlace} must pass
 * `userCorrections` (or rely on a refetch that includes them) so merges apply
 * corrections after external shards with {@link FieldConfidence} `user_override`.
 */
export const applyUserCorrection = async (input: ApplyUserCorrectionInput): Promise<UserCorrection> => {
  if (!isUserCorrectableField(input.field)) {
    throw new TypeError(`Invalid correction field: ${input.field}`);
  }
  validateNewValue(input.field, input.newValue);

  const correction: UserCorrection = {
    id: newCorrectionId(),
    userId: input.userId.trim(),
    entityId: input.entityId.trim(),
    field: input.field,
    oldValue: input.oldValue,
    newValue: input.newValue,
    createdAt: new Date().toISOString(),
  };

  if (!correction.userId || !correction.entityId) {
    throw new TypeError("userId and entityId are required.");
  }

  await correctionRepository.save(correction);
  invalidatePlaceEnrichmentCache(correction.entityId);
  return correction;
};
