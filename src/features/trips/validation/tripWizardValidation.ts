import dayjs from "dayjs";
import type { AnchorEvent } from "../../../entities/trip/model";
import type { PreferenceProfile } from "../../../entities/user/model";
import type { FestivalSelection } from "../../../entities/events/eventLookup.model";
import type { TripDraft } from "../../../services/planning/tripGenerationService";
import { foodPreferenceDedupeKey, MAX_FOOD_PREFERENCES } from "../../../services/food/foodPreferenceTypes";
import { MAX_MUST_SEE_PLACES, tripPlaceDedupeKey } from "../../../services/places/placeTypes";
import {
  isDestinationLocationAvoided,
  mergePreferenceProfile,
} from "../../../services/preferences/preferenceConstraintsService";

export interface SegmentFieldErrors {
  city?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
}

export interface TripValidationResult {
  isValid: boolean;
  segmentErrorsById: Record<string, SegmentFieldErrors>;
  budgetErrors: {
    amount?: string;
  };
  message: string | null;
}

export interface AnchorEventDraft {
  type: AnchorEvent["type"];
  title: string;
  artistOrSeries?: string;
  city: string;
  country: string;
  venue: string;
  date: string;
  /** When set, end time is interpreted on this calendar day (multi-day / festivals). */
  endDate?: string;
  startTime: string;
  endTime?: string;
  bufferDaysBefore: number;
  bufferDaysAfter: number;
  ticketStatus: AnchorEvent["ticketStatus"];
  timezone?: string;
  countryCode?: string;
  sourceUrl?: string;
  imageUrl?: string;
  ticketUrl?: string;
  provider?: AnchorEvent["provider"];
  providerEventId?: string;
  latitude?: number;
  longitude?: number;
  festivalSelection?: FestivalSelection;
}

export interface EventValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof AnchorEventDraft, string>>;
}

const isDateFilled = (value: string): boolean => value.trim().length > 0 && dayjs(value).isValid();
const isTimeFilled = (value: string | undefined): boolean => Boolean(value && /^\d{2}:\d{2}$/.test(value));

const emptyTripValidation = (): TripValidationResult => ({
  isValid: true,
  segmentErrorsById: {},
  budgetErrors: {},
  message: null,
});

const validateBudget = (draft: TripDraft): TripValidationResult["budgetErrors"] => {
  const amount = draft.budget.amount;

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      amount: "Add a realistic budget before generating options.",
    };
  }

  return {};
};

const BLOCKED_DESTINATION_MSG = "This area is blocked in your travel settings — change the stop or update Settings → travel blocks.";

const validateCityFirstStructure = (draft: TripDraft, preferenceProfile?: PreferenceProfile | null): TripValidationResult => {
  const profile = mergePreferenceProfile(preferenceProfile ?? null);
  const segmentErrorsById = draft.tripSegments.reduce<Record<string, SegmentFieldErrors>>((errors, segment, index) => {
    const fieldErrors: SegmentFieldErrors = {};
    const previousSegment = index > 0 ? draft.tripSegments[index - 1] : null;

    if (segment.city.trim().length === 0) {
      fieldErrors.city = "City is required";
    }
    if (segment.country.trim().length === 0) {
      fieldErrors.country = "Country is required";
    }
    if (!isDateFilled(segment.startDate)) {
      fieldErrors.startDate = "Start date is required";
    }
    if (!isDateFilled(segment.endDate)) {
      fieldErrors.endDate = "End date is required";
    }
    if (isDateFilled(segment.startDate) && isDateFilled(segment.endDate) && dayjs(segment.startDate).isAfter(dayjs(segment.endDate))) {
      fieldErrors.endDate = "End date must be after start date";
    }

    if (
      previousSegment &&
      isDateFilled(previousSegment.endDate) &&
      isDateFilled(segment.startDate) &&
      dayjs(segment.startDate).isBefore(dayjs(previousSegment.endDate))
    ) {
      fieldErrors.startDate = "This stop overlaps the previous one.";
    }

    if (
      profile.avoid.length > 0 &&
      segment.country.trim().length > 0 &&
      isDestinationLocationAvoided(profile, { country: segment.country, city: segment.city })
    ) {
      if (!fieldErrors.country) {
        fieldErrors.country = BLOCKED_DESTINATION_MSG;
      }
      if (segment.city.trim().length > 0 && !fieldErrors.city) {
        fieldErrors.city = BLOCKED_DESTINATION_MSG;
      }
    }

    return Object.keys(fieldErrors).length > 0 ? { ...errors, [segment.id]: fieldErrors } : errors;
  }, {});

  if (draft.tripSegments.length === 0) {
    return {
      isValid: false,
      segmentErrorsById,
      budgetErrors: {},
      message: "Add at least one city to continue.",
    };
  }

  if (Object.keys(segmentErrorsById).length > 0) {
    return {
      isValid: false,
      segmentErrorsById,
      budgetErrors: {},
      message: "Complete each city stop before continuing.",
    };
  }

  if (!isDateFilled(draft.dateRange.start) || !isDateFilled(draft.dateRange.end)) {
    return {
      isValid: false,
      segmentErrorsById,
      budgetErrors: {},
      message: "Add your trip dates before continuing.",
    };
  }

  const tripStart = dayjs(draft.dateRange.start);
  const tripEnd = dayjs(draft.dateRange.end);
  if (tripStart.isAfter(tripEnd)) {
    return {
      isValid: false,
      segmentErrorsById,
      budgetErrors: {},
      message: "Your trip should start before it ends.",
    };
  }

  const hasSegmentOutsideTripRange = draft.tripSegments.some((segment) => dayjs(segment.startDate).isBefore(tripStart) || dayjs(segment.endDate).isAfter(tripEnd));
  if (hasSegmentOutsideTripRange) {
    return {
      isValid: false,
      segmentErrorsById,
      budgetErrors: {},
      message: "Each city stop should fit inside the trip dates.",
    };
  }

  return {
    isValid: true,
    segmentErrorsById,
    budgetErrors: {},
    message: null,
  };
};

const validateEventLedStructure = (draft: TripDraft, preferenceProfile?: PreferenceProfile | null): TripValidationResult => {
  if (draft.anchorEvents.length === 0) {
    return {
      isValid: false,
      segmentErrorsById: {},
      budgetErrors: {},
      message: "Add at least one anchor event so WanderMint can shape the route around it.",
    };
  }

  const profile = mergePreferenceProfile(preferenceProfile ?? null);
  if (
    profile.avoid.length > 0 &&
    draft.anchorEvents.some((ev) => ev.country.trim() && isDestinationLocationAvoided(profile, { country: ev.country, city: ev.city }))
  ) {
    return {
      isValid: false,
      segmentErrorsById: {},
      budgetErrors: {},
      message: "An anchor event sits in a destination you blocked in Settings — change the event location or your travel blocks.",
    };
  }

  const hasInvalidEvent = draft.anchorEvents.some(
    (event) =>
      event.city.trim().length === 0 ||
      event.country.trim().length === 0 ||
      event.startAt.trim().length === 0 ||
      !dayjs(event.startAt).isValid(),
  );

  if (hasInvalidEvent) {
    return {
      isValid: false,
      segmentErrorsById: {},
      budgetErrors: {},
      message: "Every locked event needs a real city, country, date, and start time before WanderMint can shape the route.",
    };
  }

  return emptyTripValidation();
};

const validateFoodPreferences = (draft: TripDraft): TripValidationResult | null => {
  const prefs = draft.foodPreferences ?? [];
  if (prefs.length > MAX_FOOD_PREFERENCES) {
    return {
      isValid: false,
      segmentErrorsById: {},
      budgetErrors: {},
      message: `Keep food picks to at most ${MAX_FOOD_PREFERENCES} combined restaurants and wishes.`,
    };
  }
  const seen = new Set<string>();
  for (const pref of prefs) {
    const key = foodPreferenceDedupeKey(pref);
    if (seen.has(key)) {
      return {
        isValid: false,
        segmentErrorsById: {},
        budgetErrors: {},
        message: "Remove duplicate food preferences before generating.",
      };
    }
    seen.add(key);
  }
  return null;
};

const validateMustSeePlaces = (draft: TripDraft): TripValidationResult | null => {
  const places = draft.mustSeePlaces ?? [];
  if (places.length > MAX_MUST_SEE_PLACES) {
    return {
      isValid: false,
      segmentErrorsById: {},
      budgetErrors: {},
      message: `Add at most ${MAX_MUST_SEE_PLACES} must-see places so the planner can keep them honest.`,
    };
  }
  const seen = new Set<string>();
  for (const place of places) {
    const key = tripPlaceDedupeKey(place);
    if (seen.has(key)) {
      return {
        isValid: false,
        segmentErrorsById: {},
        budgetErrors: {},
        message: "Remove duplicate must-see places before generating.",
      };
    }
    seen.add(key);
  }
  return null;
};

export const validateTripDraft = (draft: TripDraft, preferenceProfile?: PreferenceProfile | null): TripValidationResult => {
  const mustSeeIssues = validateMustSeePlaces(draft);
  if (mustSeeIssues) {
    return {
      ...mustSeeIssues,
      budgetErrors: validateBudget(draft),
      isValid: false,
      message: mustSeeIssues.message,
    };
  }

  const foodIssues = validateFoodPreferences(draft);
  if (foodIssues) {
    return {
      ...foodIssues,
      budgetErrors: validateBudget(draft),
      isValid: false,
      message: foodIssues.message,
    };
  }

  if (draft.planningMode === "event_led") {
    const eventValidation = validateEventLedStructure(draft, preferenceProfile ?? draft.userPreferences?.preferenceProfile ?? null);
    const budgetErrors = validateBudget(draft);

    return {
      ...eventValidation,
      isValid: eventValidation.isValid && Object.keys(budgetErrors).length === 0,
      budgetErrors,
      message: eventValidation.message ?? budgetErrors.amount ?? null,
    };
  }

  const structureValidation = validateCityFirstStructure(draft, preferenceProfile ?? draft.userPreferences?.preferenceProfile ?? null);
  const budgetErrors = validateBudget(draft);

  return {
    ...structureValidation,
    isValid: structureValidation.isValid && Object.keys(budgetErrors).length === 0,
    budgetErrors,
    message: structureValidation.message ?? budgetErrors.amount ?? null,
  };
};

export const validateTripWizardStep = (draft: TripDraft, step: number, preferenceProfile?: PreferenceProfile | null): TripValidationResult => {
  const profile = preferenceProfile ?? draft.userPreferences?.preferenceProfile ?? null;
  if (step === 0) {
    return draft.planningMode === "event_led" ? validateEventLedStructure(draft, profile) : validateCityFirstStructure(draft, profile);
  }

  if (step === 2) {
    return validateTripDraft(draft, profile);
  }

  return emptyTripValidation();
};

export const validateAnchorEventDraft = (draft: AnchorEventDraft): EventValidationResult => {
  const errors: EventValidationResult["errors"] = {};
  if (!draft.type) {
    errors.type = "Choose the kind of event you want to anchor the trip around.";
  }
  if (draft.title.trim().length === 0) {
    errors.title = "Event title is required";
  }
  if (draft.city.trim().length === 0) {
    errors.city = "Event city is required";
  }
  if (draft.country.trim().length === 0) {
    errors.country = "Event country is required";
  }
  if (!isDateFilled(draft.date)) {
    errors.date = "Event date is required";
  }
  if (!isTimeFilled(draft.startTime)) {
    errors.startTime = "Event start time is required";
  }
  if (isDateFilled(draft.date) && draft.endDate?.trim() && dayjs(draft.endDate).isBefore(dayjs(draft.date))) {
    errors.endDate = "End date should be on or after the event date.";
  }
  if (isTimeFilled(draft.startTime) && isTimeFilled(draft.endTime)) {
    const endDay = draft.endDate?.trim() && isDateFilled(draft.endDate) ? draft.endDate : draft.date;
    const start = dayjs(`${draft.date}T${draft.startTime}`);
    const end = dayjs(`${endDay}T${draft.endTime}`);
    if (!end.isAfter(start)) {
      errors.endTime = "Event end time should be after the start time";
    }
  }
  if (!draft.ticketStatus) {
    errors.ticketStatus = "Ticket status is required";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};
