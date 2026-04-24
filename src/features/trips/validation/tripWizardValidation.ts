import dayjs from "dayjs";
import type { AnchorEvent } from "../../../entities/trip/model";
import type { TripDraft } from "../../../services/planning/tripGenerationService";

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
  city: string;
  country: string;
  venue: string;
  date: string;
  startTime: string;
  endTime?: string;
  bufferDaysBefore: number;
  bufferDaysAfter: number;
  ticketStatus: AnchorEvent["ticketStatus"];
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

const validateCityFirstStructure = (draft: TripDraft): TripValidationResult => {
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

const validateEventLedStructure = (draft: TripDraft): TripValidationResult => {
  if (draft.anchorEvents.length === 0) {
    return {
      isValid: false,
      segmentErrorsById: {},
      budgetErrors: {},
      message: "Add at least one anchor event so WanderMint can shape the route around it.",
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

export const validateTripDraft = (draft: TripDraft): TripValidationResult => {
  if (draft.planningMode === "event_led") {
    const eventValidation = validateEventLedStructure(draft);
    const budgetErrors = validateBudget(draft);

    return {
      ...eventValidation,
      isValid: eventValidation.isValid && Object.keys(budgetErrors).length === 0,
      budgetErrors,
      message: eventValidation.message ?? budgetErrors.amount ?? null,
    };
  }

  const structureValidation = validateCityFirstStructure(draft);
  const budgetErrors = validateBudget(draft);

  return {
    ...structureValidation,
    isValid: structureValidation.isValid && Object.keys(budgetErrors).length === 0,
    budgetErrors,
    message: structureValidation.message ?? budgetErrors.amount ?? null,
  };
};

export const validateTripWizardStep = (draft: TripDraft, step: number): TripValidationResult => {
  if (step === 0) {
    return draft.planningMode === "event_led" ? validateEventLedStructure(draft) : validateCityFirstStructure(draft);
  }

  if (step === 2) {
    return validateTripDraft(draft);
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
  if (isTimeFilled(draft.startTime) && isTimeFilled(draft.endTime)) {
    const start = dayjs(`2026-01-01T${draft.startTime}`);
    const end = dayjs(`2026-01-01T${draft.endTime}`);
    if (!end.isAfter(start)) {
      errors.endTime = "Event end time should be after the start time";
    }
  }
  if (!draft.ticketStatus) {
    errors.ticketStatus = "Ticket status is required";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};
