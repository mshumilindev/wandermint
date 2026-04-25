import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Grid, List, ListItem, ListItemText, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { usePrivacySettingsStore } from "../../../app/store/usePrivacySettingsStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { useTravelMemoryStore } from "../../../app/store/useTravelMemoryStore";
import { usePlaceMemoryStore } from "../../../app/store/usePlaceMemoryStore";
import type { Trip } from "../../../entities/trip/model";
import type { MusicEventSuggestion } from "../../../services/events/musicEventTypes";
import type { TripDraft, TripGenerationProgressStep, TripGenerationServiceResult } from "../../../services/planning/tripGenerationService";
import { storySuggestionsForTripEntity } from "../../../services/storyTravel/storyTravelSuggestionService";
import type { StoryTravelExperience } from "../../../services/storyTravel/storyTravelTypes";
import { tripGenerationService } from "../../../services/planning/tripGenerationService";
import { resolveTripOptionCountFromDraft } from "../../../services/planning/tripOptionCountService";
import { shiftTripLikeDateRange } from "../../../services/planning/timing/travelTimingService";
import { WizardShell } from "../../../shared/ui/wizard/WizardShell";
import { createClientId } from "../../../shared/lib/id";
import { deriveMustSeeNotesFromTripPlaces } from "../../../services/places/placeTypes";
import { debugLogError, getErrorDevDetails, getErrorMessage } from "../../../shared/lib/errors";
import { formatBudgetAmountLabel } from "../../../shared/lib/priceDisplay";
import { sanitizeOptionalUserFacingDescription, sanitizeUserFacingLine } from "../../../shared/lib/userFacingText";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { AiProgressPanel } from "../../../shared/ui/AiProgressPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { GeneratedTripOptions } from "../../../services/ai/schemas";
import { buildPlanExplanationUi } from "../../explainability/planExplanation.types";
import { readAndConsumeBucketListTripPrefill } from "../../bucket-list/bucketListTripPrefill";
import { validateAnchorEventDraft, validateTripDraft, type AnchorEventDraft } from "../validation/tripWizardValidation";
import { mergeFoodDrinkPlannerSettings } from "../../../services/foodCulture/foodCultureDefaults";
import { TripWizardRouteSection } from "../components/wizard/TripWizardRouteSection";
import { TripWizardTravelStyleSection } from "../components/wizard/TripWizardTravelStyleSection";
import { TripWizardPartyPaceSection } from "../components/wizard/TripWizardPartyPaceSection";
import { TripWizardBudgetSection } from "../components/wizard/TripWizardBudgetSection";
import { TripWizardReviewSection } from "../components/wizard/TripWizardReviewSection";
import { TripWizardFoodCultureSection } from "../components/wizard/TripWizardFoodCultureSection";
import { TripWizardStoryInspirationSection } from "../components/wizard/TripWizardStoryInspirationSection";
import { MusicInspiredSuggestionCard } from "../components/MusicInspiredSuggestionCard";
import { TravelTimingWarningBanner } from "../components/TravelTimingWarningBanner";
import { StoryExperienceStrip } from "../../storyTravel/components/StoryExperienceStrip";
import { FestivalDatesDialog } from "../events/FestivalDatesDialog";
import { useEventLookup } from "../events/useEventLookup";
import { applyEventLookupToAnchorEventDraft, isMultiDayEventResult } from "../../../services/events/applyEventLookup";
import { countryLabelToIsoCode } from "../../../shared/ui/CountryFlag";
import type { EventLookupResult } from "../../../entities/events/eventLookup.model";
import type { FestivalSelection } from "../../../entities/events/eventLookup.model";

const createEmptySegment = () => ({
  id: createClientId("segment"),
  city: "",
  country: "",
  startDate: "",
  endDate: "",
  hotelInfo: {},
  arrivalTransportNotes: "",
  departureTransportNotes: "",
});

const createAnchorEventDraft = (): AnchorEventDraft => ({
  type: "concert",
  title: "",
  artistOrSeries: "",
  city: "",
  country: "",
  venue: "",
  date: "",
  endDate: "",
  startTime: "",
  endTime: "",
  bufferDaysBefore: 1,
  bufferDaysAfter: 1,
  ticketStatus: "booked",
});

export const NewTripPage = (): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const privacySettings = usePrivacySettingsStore((state) => state.settings);
  const ensurePrivacySettings = usePrivacySettingsStore((state) => state.ensurePrivacySettings);
  const saveGeneratedTrip = useTripsStore((state) => state.saveGeneratedTrip);
  const pushToast = useUiStore((state) => state.pushToast);
  const ensureTravelMemories = useTravelMemoryStore((state) => state.ensureMemories);
  const travelMemoriesById = useTravelMemoryStore((state) => state.memoriesById);
  const travelMemoryIds = useTravelMemoryStore((state) => state.memoryIds);
  const ensurePlaceMemories = usePlaceMemoryStore((state) => state.ensureMemories);
  const placeMemoriesById = usePlaceMemoryStore((state) => state.memoriesById);
  const placeMemoryIds = usePlaceMemoryStore((state) => state.memoryIds);
  const [isGenerating, setIsGenerating] = useState(false);
  const [options, setOptions] = useState<GeneratedTripOptions["options"]>([]);
  const [musicEventSuggestions, setMusicEventSuggestions] = useState<MusicEventSuggestion[]>([]);
  const [travelBehaviorHintKeys, setTravelBehaviorHintKeys] = useState<string[]>([]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [generationStep, setGenerationStep] = useState<TripGenerationProgressStep | null>(null);
  const [eventDraft, setEventDraft] = useState<AnchorEventDraft>(createAnchorEventDraft);
  const [eventFieldLocks, setEventFieldLocks] = useState<Set<string>>(() => new Set());
  const eventFieldLocksRef = useRef(eventFieldLocks);
  eventFieldLocksRef.current = eventFieldLocks;
  const [festivalPickerOpen, setFestivalPickerOpen] = useState(false);
  const [pendingFestivalResult, setPendingFestivalResult] = useState<EventLookupResult | null>(null);
  const [pendingFestivalReplaceAll, setPendingFestivalReplaceAll] = useState(false);
  const [eventAttempted, setEventAttempted] = useState(false);
  const [segmentToRemove, setSegmentToRemove] = useState<string | null>(null);
  const [anchorEventToRemove, setAnchorEventToRemove] = useState<string | null>(null);
  const [isOptionsTransitionPending, startOptionsTransition] = useTransition();
  const [dismissedStoryKeys, setDismissedStoryKeys] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<TripDraft>({
    userId: user?.id ?? "",
    planningMode: "city_first",
    destination: "",
    tripSegments: [createEmptySegment()],
    dateRange: { start: "", end: "" },
    flightInfo: {},
    hotelInfo: {},
    budget: { amount: 1200, currency: "USD", style: "balanced", dailySoftLimit: undefined },
    preferences: {
      partyComposition: "couple",
      vibe: ["culture", "food"],
      foodInterests: [],
      walkingTolerance: "medium",
      pace: "balanced",
      avoids: [],
      mustSeeNotes: "",
      specialWishes: "",
      foodDrinkPlanner: mergeFoodDrinkPlannerSettings(undefined),
      storyInspirationLevel: "subtle",
    },
    executionProfile: {
      explorationSpeed: "standard",
      scheduleDensity: "balanced",
      attractionDwellStyle: "standard",
      walkingTempo: "standard",
      transferTolerance: "medium",
      recoveryNeed: "medium",
      eventCentricity: "low",
      priorityMode: "balanced",
    },
    anchorEvents: [],
    segmentAccommodationBases: {},
    segmentTransportNodes: {},
    mustSeePlaces: [],
    foodPreferences: [],
  });

  const bucketPrefillAppliedRef = useRef(false);

  useEffect(() => {
    if (!user?.id || bucketPrefillAppliedRef.current) {
      return;
    }
    const prefill = readAndConsumeBucketListTripPrefill();
    if (!prefill) {
      return;
    }
    bucketPrefillAppliedRef.current = true;
    setDraft((current) => {
      const priorPlaces = current.mustSeePlaces ?? [];
      const customPrefill = {
        id: createClientId("must_see"),
        mode: "custom" as const,
        label: prefill.mustSeeLine.trim(),
        customText: prefill.mustSeeLine.trim(),
        locked: true as const,
      };
      const nextPlaces = [...priorPlaces, customPrefill].slice(0, 7);
      const mustSeeNotes = deriveMustSeeNotesFromTripPlaces(nextPlaces);
      const tripSegments = current.tripSegments.map((segment, index) => {
        if (index !== 0 || !prefill.segmentCity?.trim() || segment.city.trim()) {
          return segment;
        }
        const country = (prefill.segmentCountry?.trim() || segment.country).trim();
        return { ...segment, city: prefill.segmentCity.trim(), country };
      });
      return {
        ...current,
        mustSeePlaces: nextPlaces,
        preferences: { ...current.preferences, mustSeeNotes },
        tripSegments,
      };
    });
    pushToast({ message: t("bucketList.prefillTripToast"), tone: "info" });
  }, [pushToast, t, user?.id]);

  const eventLookupQuery = useMemo(() => {
    const parts = [eventDraft.title, eventDraft.artistOrSeries, eventDraft.venue].map((s) => s?.trim()).filter(Boolean) as string[];
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }, [eventDraft.title, eventDraft.artistOrSeries, eventDraft.venue]);

  const eventSearchCountry = countryLabelToIsoCode(eventDraft.country) ?? undefined;

  const eventLookup = useEventLookup({
    query: eventLookupQuery,
    mode: "upcoming",
    city: eventDraft.city.trim() || undefined,
    country: eventSearchCountry,
    startDate: draft.dateRange.start.trim() || undefined,
    endDate: draft.dateRange.end.trim() || undefined,
    enabled: draft.planningMode === "event_led" && eventLookupQuery.length >= 3,
    externalSearchAllowed: privacySettings?.allowExternalEventSearch === true,
  });

  const travelMemories = useMemo(
    () => travelMemoryIds.map((id) => travelMemoriesById[id]).filter((memory): memory is NonNullable<typeof memory> => Boolean(memory)),
    [travelMemoriesById, travelMemoryIds],
  );
  const placeMemories = useMemo(
    () => placeMemoryIds.map((id) => placeMemoriesById[id]).filter((memory): memory is NonNullable<typeof memory> => Boolean(memory)),
    [placeMemoriesById, placeMemoryIds],
  );

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    void ensureTravelMemories(user.id);
    void ensurePlaceMemories(user.id);
  }, [ensurePlaceMemories, ensureTravelMemories, user?.id]);

  useEffect(() => {
    if (!preferences?.currency) {
      return;
    }
    setDraft((current) => ({
      ...current,
      budget: { ...current.budget, currency: preferences.currency },
      preferences: {
        ...current.preferences,
        walkingTolerance: preferences.walkingTolerance,
        pace: preferences.preferredPace,
        avoids: current.preferences.avoids.length > 0 ? current.preferences.avoids : preferences.avoids,
      },
    }));
  }, [preferences]);

  const patchDraft = (patch: Partial<TripDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const tripValidation = useMemo(
    () => validateTripDraft(draft, preferences?.preferenceProfile ?? null),
    [draft, preferences?.preferenceProfile],
  );
  const primaryRouteSegment = draft.tripSegments[0];
  const tripOptionPlan = useMemo(
    () =>
      resolveTripOptionCountFromDraft(
        {
          planningMode: draft.planningMode,
          dateRange: draft.dateRange,
          tripSegments: draft.tripSegments,
          anchorEvents: draft.anchorEvents,
        },
        { missingCriticalDetails: !tripValidation.isValid },
      ),
    [draft.anchorEvents, draft.dateRange, draft.planningMode, draft.tripSegments, tripValidation.isValid],
  );
  const eventValidation = useMemo(() => validateAnchorEventDraft(eventDraft), [eventDraft]);
  const showEventErrors = eventAttempted && !eventValidation.isValid;
  const tripProgressStages = useMemo(
    () => [
      { key: "validating_trip_shape", label: t("wizard.progress.validating_trip_shape") },
      { key: "checking_forecast", label: t("wizard.progress.checking_forecast") },
      { key: "finding_city_signals", label: t("wizard.progress.finding_city_signals") },
      { key: "finding_local_places", label: t("wizard.progress.finding_local_places") },
      { key: "planning_intercity_moves", label: t("wizard.progress.planning_intercity_moves") },
      { key: "assembling_travel_support", label: t("wizard.progress.assembling_travel_support") },
      { key: "asking_ai", label: t("wizard.progress.asking_ai") },
      { key: "polishing_schedule", label: t("wizard.progress.polishing_schedule") },
      { key: "validating_trip_feasibility", label: t("wizard.progress.validating_trip_feasibility") },
    ],
    [t],
  );
  const tripProgressValue = useMemo(() => {
    const activeIndex = tripProgressStages.findIndex((item) => item.key === generationStep);
    if (activeIndex < 0) {
      return 0;
    }

    return ((activeIndex + 1) / tripProgressStages.length) * 100;
  }, [generationStep, tripProgressStages]);

  const storyByOptionId = useMemo(() => {
    const m = new Map<string, StoryTravelExperience[]>();
    if (!options.length) {
      return m;
    }
    for (const opt of options) {
      const mergedTrip: Trip = {
        ...opt.trip,
        preferences: {
          ...opt.trip.preferences,
          ...draft.preferences,
          foodDrinkPlanner: mergeFoodDrinkPlannerSettings(draft.preferences.foodDrinkPlanner),
        },
      };
      m.set(opt.optionId, storySuggestionsForTripEntity(mergedTrip, preferences));
    }
    return m;
  }, [options, draft.preferences, preferences]);

  const updateSegment = (segmentId: string, patch: Partial<TripDraft["tripSegments"][number]>): void => {
    setDraft((current) => {
      const tripSegments = current.tripSegments.map((segment) => (segment.id === segmentId ? { ...segment, ...patch } : segment));
      const filledStarts = tripSegments.map((segment) => segment.startDate).filter((value) => value.trim().length > 0).sort();
      const filledEnds = tripSegments.map((segment) => segment.endDate).filter((value) => value.trim().length > 0).sort();
      const firstStart = filledStarts[0] ?? current.dateRange.start;
      const lastEnd = filledEnds[filledEnds.length - 1] ?? current.dateRange.end;
      const destination = tripSegments
        .map((segment) => segment.city.trim())
        .filter(Boolean)
        .join(" → ");

      return {
        ...current,
        tripSegments,
        destination,
        dateRange: {
          start: firstStart,
          end: lastEnd,
        },
      };
    });
  };

  const addSegment = (): void => {
    setDraft((current) => ({
      ...current,
      tripSegments: [...current.tripSegments, createEmptySegment()],
    }));
  };

  const removeSegment = (segmentId: string): void => {
    setDraft((current) => {
      const tripSegments = current.tripSegments.filter((segment) => segment.id !== segmentId);
      const safeSegments = tripSegments.length > 0 ? tripSegments : [createEmptySegment()];
      const filledStarts = safeSegments.map((segment) => segment.startDate).filter((value) => value.trim().length > 0).sort();
      const filledEnds = safeSegments.map((segment) => segment.endDate).filter((value) => value.trim().length > 0).sort();
      const bases = { ...(current.segmentAccommodationBases ?? {}) };
      delete bases[segmentId];
      const transportNodes = { ...(current.segmentTransportNodes ?? {}) };
      delete transportNodes[segmentId];
      return {
        ...current,
        tripSegments: safeSegments,
        destination: safeSegments.map((segment) => segment.city.trim()).filter(Boolean).join(" → "),
        dateRange: {
          start: filledStarts[0] ?? "",
          end: filledEnds[filledEnds.length - 1] ?? "",
        },
        segmentAccommodationBases: bases,
        segmentTransportNodes: transportNodes,
      };
    });
  };

  const patchEventDraft = <Key extends keyof AnchorEventDraft>(field: Key, value: AnchorEventDraft[Key], trackUserEdit = true): void => {
    if (trackUserEdit) {
      setEventFieldLocks((prev) => new Set(prev).add(field as string));
    }
    setEventDraft((current) => ({ ...current, [field]: value }));
  };

  const mergeEventLookup = (result: EventLookupResult, replaceAll: boolean, festivalSelection?: FestivalSelection): void => {
    setEventDraft((current) =>
      applyEventLookupToAnchorEventDraft(current, result, {
        replaceAll,
        locks: eventFieldLocksRef.current,
        festivalSelection,
      }),
    );
    if (replaceAll) {
      setEventFieldLocks(new Set());
    }
    pushToast({
      tone: "success",
      message: t("events.filledFromProvider", {
        provider: t(`events.providers.${result.provider}`, { defaultValue: result.provider }),
      }),
    });
  };

  const handleEventLookupPick = (result: EventLookupResult, replaceAll: boolean): void => {
    if (isMultiDayEventResult(result)) {
      setPendingFestivalResult(result);
      setPendingFestivalReplaceAll(replaceAll);
      setFestivalPickerOpen(true);
      return;
    }
    mergeEventLookup(result, replaceAll);
  };

  const handleFestivalLookupConfirm = (selection: FestivalSelection): void => {
    if (pendingFestivalResult) {
      mergeEventLookup(pendingFestivalResult, pendingFestivalReplaceAll, selection);
    }
    setPendingFestivalResult(null);
  };

  const addAnchorEvent = (): void => {
    setEventAttempted(true);
    if (!eventValidation.isValid) {
      setFormMessage(t("wizard.validation.eventRequired"));
      return;
    }

    const endDayForEndTime =
      eventDraft.endDate?.trim() && dayjs(eventDraft.endDate).isValid() ? eventDraft.endDate : eventDraft.date;
    const startAt = dayjs(`${eventDraft.date}T${eventDraft.startTime}`).toISOString();
    const endAt = eventDraft.endTime?.trim()
      ? dayjs(`${endDayForEndTime}T${eventDraft.endTime}`).toISOString()
      : undefined;

    setDraft((current) => ({
      ...current,
      anchorEvents: [
        ...current.anchorEvents,
        {
          id: createClientId("event"),
          type: eventDraft.type,
          title: eventDraft.title.trim(),
          artistOrSeries: eventDraft.artistOrSeries?.trim() || undefined,
          city: eventDraft.city.trim(),
          country: eventDraft.country.trim(),
          countryCode: eventDraft.countryCode,
          venue: eventDraft.venue.trim(),
          startAt,
          endAt,
          bufferDaysBefore: eventDraft.bufferDaysBefore,
          bufferDaysAfter: eventDraft.bufferDaysAfter,
          locked: true,
          ticketStatus: eventDraft.ticketStatus,
          genreTags: [],
          timezone: eventDraft.timezone,
          sourceUrl: eventDraft.sourceUrl,
          imageUrl: eventDraft.imageUrl,
          ticketUrl: eventDraft.ticketUrl,
          provider: eventDraft.provider,
          providerEventId: eventDraft.providerEventId,
          latitude: eventDraft.latitude,
          longitude: eventDraft.longitude,
          festivalSelection: eventDraft.festivalSelection,
        },
      ],
    }));
    setEventDraft(createAnchorEventDraft());
    setEventFieldLocks(new Set());
    setEventAttempted(false);
    setFormMessage(null);
  };

  const removeAnchorEvent = (eventId: string): void => {
    setDraft((current) => ({
      ...current,
      anchorEvents: current.anchorEvents.filter((event) => event.id !== eventId),
    }));
  };

  const toggleVibe = (value: string): void => {
    setDraft((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        vibe: current.preferences.vibe.includes(value)
          ? current.preferences.vibe.filter((item) => item !== value)
          : [...current.preferences.vibe, value],
      },
    }));
  };

  const generate = async (): Promise<void> => {
    if (!user) {
      return;
    }
    if (!tripValidation.isValid) {
      setFormMessage(tripValidation.message ?? t("wizard.validation.tripRequired"));
      return;
    }

    setIsGenerating(true);
    setGenerationStep("validating_trip_shape");
    setFormMessage(null);
    setTravelBehaviorHintKeys([]);
    setMusicEventSuggestions([]);
    const destination = draft.tripSegments.map((segment) => segment.city.trim()).filter(Boolean).join(" → ");
    try {
      const result: TripGenerationServiceResult = await tripGenerationService.generateTripOptions(
        {
          ...draft,
          userId: user.id,
          destination,
          userPreferences: preferences,
          travelMemories,
          placeMemories,
        },
        {
          onStep: (nextStep) => setGenerationStep(nextStep),
        },
      );
      startOptionsTransition(() => {
        setOptions(result.options);
        setDismissedStoryKeys(new Set());
        setTravelBehaviorHintKeys(result.travelBehaviorUiHintKeys ?? []);
        setMusicEventSuggestions(result.musicEventSuggestions ?? []);
      });
    } catch (error) {
      debugLogError("wizard_generate_trip_options", error);
      const message = getErrorMessage(error);
      const dev = getErrorDevDetails(error);
      setFormMessage(import.meta.env.DEV && dev ? `${message}\n\n${dev}` : message);
      pushToast({ tone: "error", message });
    } finally {
      setIsGenerating(false);
      setGenerationStep(null);
    }
  };

  const chooseOption = async (option: GeneratedTripOptions["options"][number]): Promise<void> => {
    try {
      await saveGeneratedTrip(
        {
          ...option.trip,
          preferences: {
            ...option.trip.preferences,
            ...draft.preferences,
            foodDrinkPlanner: mergeFoodDrinkPlannerSettings(draft.preferences.foodDrinkPlanner),
          },
        },
        option.days,
      );
      await navigate({ to: "/trips/$tripId", params: { tripId: option.trip.id } });
    } catch (error) {
      debugLogError("wizard_save_generated_trip", error);
      pushToast({ tone: "error", message: getErrorMessage(error) });
    }
  };

  return (
    <WizardShell>
      <Box sx={{ display: "grid", gap: 3 }}>
        <SectionHeader title={t("wizard.title")} subtitle={t("wizard.subtitle")} />

        <Box sx={{ display: "grid", gap: 2.5 }}>
        {formMessage ? <Alert severity="warning">{formMessage}</Alert> : null}
        <TravelTimingWarningBanner
          country={primaryRouteSegment?.country ?? ""}
          city={primaryRouteSegment?.city}
          destinationLabel={draft.destination}
          dateRange={draft.dateRange}
          onApplyDateRange={(range) => {
            setDraft((current) => shiftTripLikeDateRange(current, range));
          }}
        />
        <TripWizardRouteSection
          draft={draft}
          tripValidation={tripValidation}
          eventDraft={eventDraft}
          eventValidation={eventValidation}
          showEventErrors={showEventErrors}
          eventLookupQuery={eventLookupQuery}
          eventLookup={eventLookup}
          externalEventSearchAllowed={privacySettings?.allowExternalEventSearch === true}
          patchDraft={patchDraft}
          updateSegment={updateSegment}
          addSegment={addSegment}
          patchEventDraft={patchEventDraft}
          setEventFieldLocks={setEventFieldLocks}
          setEventDraft={setEventDraft}
          addAnchorEvent={addAnchorEvent}
          onEventLookupPick={handleEventLookupPick}
          onRemoveSegmentRequest={(id) => setSegmentToRemove(id)}
          onRemoveAnchorRequest={(id) => setAnchorEventToRemove(id)}
        />
        <TripWizardTravelStyleSection draft={draft} patchDraft={patchDraft} toggleVibe={toggleVibe} />
        <TripWizardPartyPaceSection draft={draft} patchDraft={patchDraft} />
        <TripWizardBudgetSection draft={draft} tripValidation={tripValidation} patchDraft={patchDraft} />
        <TripWizardFoodCultureSection draft={draft} patchDraft={patchDraft} />
        <TripWizardStoryInspirationSection draft={draft} patchDraft={patchDraft} />
        <TripWizardReviewSection
          draft={draft}
          tripValidation={tripValidation}
          preferences={preferences}
          isGenerating={isGenerating}
          generateOptionTarget={tripOptionPlan.target}
          onGenerate={() => void generate()}
          onExit={() => void navigate({ to: "/trips" })}
        />
      </Box>

      {isGenerating || isOptionsTransitionPending ? (
        <AiProgressPanel
          title={t("wizard.generatingPanelTitle")}
          subtitle={t("wizard.generatingPanelSubtitle")}
          progress={tripProgressValue}
          activeKey={generationStep}
          stages={tripProgressStages}
          trailingLabel={generationStep ? t("wizard.generating") : undefined}
        />
      ) : null}
      {travelBehaviorHintKeys.length > 0 ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          {travelBehaviorHintKeys.map((key) => (
            <Alert key={key} severity="info">
              {t(`wizard.travelBehaviorHints.${key}`)}
            </Alert>
          ))}
        </Box>
      ) : null}
      {musicEventSuggestions.length > 0 ? (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            {t("music.wizard.musicInspiredTitle")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("music.wizard.musicInspiredSubtitle")}
          </Typography>
          <Grid container spacing={1.5}>
            {musicEventSuggestions.map((s) => (
              <Grid item xs={12} md={4} key={s.id}>
                <MusicInspiredSuggestionCard suggestion={s} onDismiss={() => setMusicEventSuggestions((cur) => cur.filter((x) => x.id !== s.id))} />
              </Grid>
            ))}
          </Grid>
        </Box>
      ) : null}
      {options.length > 0 ? (
        <Grid container spacing={2}>
          {options.map((option) => {
            const rawStories = storyByOptionId.get(option.optionId) ?? [];
            const stories = rawStories.filter((s) => !dismissedStoryKeys.has(`${option.optionId}::${s.id}`));
            return (
            <Grid item xs={12} md={4} key={option.optionId}>
              <GlassPanel sx={{ p: 2.5, display: "grid", gap: 2, height: "100%" }}>
                <EntityPreviewImage
                  entityId={`trip-option:${option.optionId}`}
                  variant="optionPreview"
                  title={option.trip.tripSegments[0]?.city ?? option.trip.destination}
                  locationHint={option.trip.tripSegments[0]?.country ?? option.trip.destination}
                  categoryHint="city"
                  alt={`${sanitizeUserFacingLine(option.trip.title)} · ${option.trip.destination}`}
                />
                <Box>
                  <Typography variant="overline" color="primary.main">
                    {option.label}
                  </Typography>
                  <Typography variant="h6">{sanitizeUserFacingLine(option.positioning)}</Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <MetadataPill
                    label={formatBudgetAmountLabel(option.trip.budget.amount, option.trip.budget.currency, {
                      preferredCurrency: preferences?.currency,
                      locale: preferences?.locale,
                    })}
                    tone="amber"
                  />
                  <MetadataPill label={`${option.trip.tripSegments.length} ${option.trip.tripSegments.length === 1 ? "city" : "cities"}`} tone="teal" />
                </Box>
                {option.tradeoffs.map((tradeoff) => {
                  const cleanTradeoff = sanitizeOptionalUserFacingDescription(tradeoff);
                  return cleanTradeoff ? (
                    <Typography key={tradeoff} variant="body2" color="text.secondary">
                      {cleanTradeoff}
                    </Typography>
                  ) : null;
                })}
                {stories.length > 0 ? (
                  <StoryExperienceStrip
                    title={t("wizard.storyTripOptionTitle")}
                    subtitle={t("wizard.storyTripOptionSubtitle")}
                    experiences={stories}
                    dismissScopeId={option.optionId}
                    onDismissExperience={(expId, scope) => {
                      if (!scope) {
                        return;
                      }
                      setDismissedStoryKeys((prev) => new Set(prev).add(`${scope}::${expId}`));
                    }}
                  />
                ) : null}
                {option.planExplanation ? (
                  <Accordion disableGutters elevation={0} sx={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, "&:before": { display: "none" } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="subtitle2">{t("wizard.planExplanation.accordionTitle")}</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      {(() => {
                        const ui = buildPlanExplanationUi(option.planExplanation);
                        return (
                          <Box sx={{ display: "grid", gap: 1.5 }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                {t("wizard.planExplanation.conciseIntro")}
                              </Typography>
                              <Typography variant="body2">{sanitizeUserFacingLine(ui.conciseHeadline)}</Typography>
                              <List dense disablePadding sx={{ mt: 0.5 }}>
                                {ui.conciseBullets.map((line) => (
                                  <ListItem key={line} disableGutters sx={{ py: 0.15 }}>
                                    <ListItemText primaryTypographyProps={{ variant: "body2", color: "text.secondary" }} primary={sanitizeUserFacingLine(line)} />
                                  </ListItem>
                                ))}
                              </List>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="primary.main" sx={{ display: "block", mb: 0.5 }}>
                                {t("wizard.planExplanation.included")}
                              </Typography>
                              <List dense disablePadding>
                                {ui.detailed.includedBecause.map((line) => (
                                  <ListItem key={line} disableGutters sx={{ py: 0.1 }}>
                                    <ListItemText primaryTypographyProps={{ variant: "body2" }} primary={sanitizeUserFacingLine(line)} />
                                  </ListItem>
                                ))}
                              </List>
                            </Box>
                            {ui.detailed.excludedBecause.length > 0 ? (
                              <Box>
                                <Typography variant="caption" color="primary.main" sx={{ display: "block", mb: 0.5 }}>
                                  {t("wizard.planExplanation.excluded")}
                                </Typography>
                                <List dense disablePadding>
                                  {ui.detailed.excludedBecause.map((line) => (
                                    <ListItem key={line} disableGutters sx={{ py: 0.1 }}>
                                      <ListItemText primaryTypographyProps={{ variant: "body2" }} primary={sanitizeUserFacingLine(line)} />
                                    </ListItem>
                                  ))}
                                </List>
                              </Box>
                            ) : null}
                            <Box>
                              <Typography variant="caption" color="primary.main" sx={{ display: "block", mb: 0.5 }}>
                                {t("wizard.planExplanation.assumptions")}
                              </Typography>
                              <List dense disablePadding>
                                {ui.detailed.assumptions.map((line) => (
                                  <ListItem key={line} disableGutters sx={{ py: 0.1 }}>
                                    <ListItemText primaryTypographyProps={{ variant: "body2" }} primary={sanitizeUserFacingLine(line)} />
                                  </ListItem>
                                ))}
                              </List>
                            </Box>
                            {ui.detailed.risks.length > 0 ? (
                              <Box>
                                <Typography variant="caption" color="warning.main" sx={{ display: "block", mb: 0.5 }}>
                                  {t("wizard.planExplanation.risks")}
                                </Typography>
                                <List dense disablePadding>
                                  {ui.detailed.risks.map((line) => (
                                    <ListItem key={line} disableGutters sx={{ py: 0.1 }}>
                                      <ListItemText primaryTypographyProps={{ variant: "body2", color: "text.secondary" }} primary={sanitizeUserFacingLine(line)} />
                                    </ListItem>
                                  ))}
                                </List>
                              </Box>
                            ) : null}
                            {ui.detailed.lowConfidenceFields.length > 0 ? (
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                                  {t("wizard.planExplanation.lowConfidence")}
                                </Typography>
                                <List dense disablePadding>
                                  {ui.detailed.lowConfidenceFields.map((line) => (
                                    <ListItem key={line} disableGutters sx={{ py: 0.1 }}>
                                      <ListItemText primaryTypographyProps={{ variant: "body2", color: "text.secondary" }} primary={sanitizeUserFacingLine(line)} />
                                    </ListItem>
                                  ))}
                                </List>
                              </Box>
                            ) : null}
                          </Box>
                        );
                      })()}
                    </AccordionDetails>
                  </Accordion>
                ) : null}
                {option.days.flatMap((day) => day.warnings).slice(0, 3).map((warning) => (
                  <Box
                    key={warning.id}
                    sx={{
                      p: 1.1,
                      borderRadius: 2,
                      border: "1px solid rgba(245, 138, 44, 0.18)",
                      background: "rgba(245, 138, 44, 0.06)",
                    }}
                  >
                    <Typography variant="caption" color="primary.main" sx={{ display: "block", mb: 0.35 }}>
                      WanderMint would challenge this
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {sanitizeUserFacingLine(warning.message)}
                    </Typography>
                  </Box>
                ))}
                <Button variant="contained" onClick={() => void chooseOption(option)}>
                  {t("wizard.choose")}
                </Button>
              </GlassPanel>
            </Grid>
            );
          })}
        </Grid>
      ) : null}
      <FestivalDatesDialog
        open={festivalPickerOpen}
        result={pendingFestivalResult}
        onClose={() => {
          setFestivalPickerOpen(false);
          setPendingFestivalResult(null);
        }}
        onConfirm={handleFestivalLookupConfirm}
      />
      <ConfirmActionDialog
        open={Boolean(segmentToRemove)}
        title={t("prompts.confirmRemoveSegmentTitle")}
        description={t("prompts.confirmRemoveSegmentDescription")}
        impactNote={t("prompts.confirmRemoveSegmentImpact")}
        confirmLabel={t("wizard.removeStop")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        onCancel={() => setSegmentToRemove(null)}
        onConfirm={() => {
          if (segmentToRemove) {
            removeSegment(segmentToRemove);
          }
          setSegmentToRemove(null);
        }}
      />
      <ConfirmActionDialog
        open={Boolean(anchorEventToRemove)}
        title={t("prompts.confirmRemoveAnchorTitle")}
        description={t("prompts.confirmRemoveAnchorDescription")}
        impactNote={t("prompts.confirmRemoveAnchorImpact")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        onCancel={() => setAnchorEventToRemove(null)}
        onConfirm={() => {
          if (anchorEventToRemove) {
            removeAnchorEvent(anchorEventToRemove);
          }
          setAnchorEventToRemove(null);
        }}
      />
      </Box>
    </WizardShell>
  );
};
