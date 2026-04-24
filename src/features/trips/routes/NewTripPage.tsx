import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Alert, Box, Button, Chip, Grid, MenuItem, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useMemo, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import type { TripDraft, TripGenerationProgressStep } from "../../../services/planning/tripGenerationService";
import { tripGenerationService } from "../../../services/planning/tripGenerationService";
import { createClientId } from "../../../shared/lib/id";
import { formatBudgetAmountLabel } from "../../../shared/lib/priceDisplay";
import { sanitizeOptionalUserFacingDescription, sanitizeUserFacingLine } from "../../../shared/lib/userFacingText";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { AiProgressPanel } from "../../../shared/ui/AiProgressPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { LocationAutocompleteField } from "../../../shared/ui/LocationAutocompleteField";
import type { GeneratedTripOptions } from "../../../services/ai/schemas";
import { validateAnchorEventDraft, validateTripDraft, validateTripWizardStep, type AnchorEventDraft } from "../validation/tripWizardValidation";

const chipOptions = [
  { value: "boutique", labelKey: "wizard.vibes.boutique" },
  { value: "culture", labelKey: "wizard.vibes.culture" },
  { value: "food", labelKey: "wizard.vibes.food" },
  { value: "nightlife", labelKey: "wizard.vibes.nightlife" },
  { value: "hidden gems", labelKey: "wizard.vibes.hiddenGems" },
  { value: "slow mornings", labelKey: "wizard.vibes.slowMornings" },
] as const;

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
  city: "",
  country: "",
  venue: "",
  date: "",
  startTime: "",
  endTime: "",
  bufferDaysBefore: 1,
  bufferDaysAfter: 1,
  ticketStatus: "booked",
});

const planningModes = [
  { value: "city_first", titleKey: "wizard.planningModes.cityFirst", descriptionKey: "wizard.planningModes.cityFirstDescription" },
  { value: "event_led", titleKey: "wizard.planningModes.eventLed", descriptionKey: "wizard.planningModes.eventLedDescription" },
] as const;

export const NewTripPage = (): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const saveGeneratedTrip = useTripsStore((state) => state.saveGeneratedTrip);
  const pushToast = useUiStore((state) => state.pushToast);
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [options, setOptions] = useState<GeneratedTripOptions["options"]>([]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [generationStep, setGenerationStep] = useState<TripGenerationProgressStep | null>(null);
  const [eventDraft, setEventDraft] = useState<AnchorEventDraft>(createAnchorEventDraft);
  const [eventAttempted, setEventAttempted] = useState(false);
  const [segmentToRemove, setSegmentToRemove] = useState<string | null>(null);
  const [anchorEventToRemove, setAnchorEventToRemove] = useState<string | null>(null);
  const [isOptionsTransitionPending, startOptionsTransition] = useTransition();
  const [draft, setDraft] = useState<TripDraft>({
    userId: user?.id ?? "",
    planningMode: "city_first",
    destination: "",
    tripSegments: [createEmptySegment()],
    dateRange: { start: "", end: "" },
    flightInfo: {},
    hotelInfo: {},
    budget: { amount: 1200, currency: "USD", style: "balanced" },
    preferences: {
      partyComposition: "couple",
      vibe: ["culture", "food"],
      foodInterests: [],
      walkingTolerance: "medium",
      pace: "balanced",
      avoids: [],
      mustSeeNotes: "",
      specialWishes: "",
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
  });

  const patchDraft = (patch: Partial<TripDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const tripValidation = useMemo(() => validateTripDraft(draft), [draft]);
  const currentStepValidation = useMemo(() => validateTripWizardStep(draft, step), [draft, step]);
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
      return {
        ...current,
        tripSegments: safeSegments,
        destination: safeSegments.map((segment) => segment.city.trim()).filter(Boolean).join(" → "),
        dateRange: {
          start: filledStarts[0] ?? "",
          end: filledEnds[filledEnds.length - 1] ?? "",
        },
      };
    });
  };

  const patchEventDraft = <Key extends keyof AnchorEventDraft>(field: Key, value: AnchorEventDraft[Key]): void => {
    setEventDraft((current) => ({ ...current, [field]: value }));
  };

  const addAnchorEvent = (): void => {
    setEventAttempted(true);
    if (!eventValidation.isValid) {
      setFormMessage(t("wizard.validation.eventRequired"));
      return;
    }

    setDraft((current) => ({
      ...current,
      anchorEvents: [
        ...current.anchorEvents,
        {
          id: createClientId("event"),
          type: eventDraft.type,
          title: eventDraft.title.trim(),
          city: eventDraft.city.trim(),
          country: eventDraft.country.trim(),
          venue: eventDraft.venue.trim(),
          startAt: dayjs(`${eventDraft.date}T${eventDraft.startTime}`).toISOString(),
          endAt: eventDraft.endTime ? dayjs(`${eventDraft.date}T${eventDraft.endTime}`).toISOString() : undefined,
          bufferDaysBefore: eventDraft.bufferDaysBefore,
          bufferDaysAfter: eventDraft.bufferDaysAfter,
          locked: true,
          ticketStatus: eventDraft.ticketStatus,
          genreTags: [],
        },
      ],
    }));
    setEventDraft(createAnchorEventDraft());
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
    const destination = draft.tripSegments.map((segment) => segment.city.trim()).filter(Boolean).join(" → ");
    try {
      const result = await tripGenerationService.generateTripOptions(
        { ...draft, userId: user.id, destination },
        {
          onStep: (nextStep) => setGenerationStep(nextStep),
        },
      );
      startOptionsTransition(() => {
        setOptions(result.options);
      });
    } catch {
      setFormMessage(t("wizard.validation.generationFailed"));
      pushToast({ tone: "error", message: t("feedback.tripGenerationFailed") });
    } finally {
      setIsGenerating(false);
      setGenerationStep(null);
    }
  };

  const continueToNextStep = (): void => {
    if (!currentStepValidation.isValid) {
      setFormMessage(currentStepValidation.message ?? t("wizard.validation.tripRequired"));
      return;
    }
    setFormMessage(null);
    setStep((current) => current + 1);
  };

  const chooseOption = async (option: GeneratedTripOptions["options"][number]): Promise<void> => {
    try {
      await saveGeneratedTrip(option.trip, option.days);
      await navigate({ to: "/trips/$tripId", params: { tripId: option.trip.id } });
    } catch {
      pushToast({ tone: "error", message: t("feedback.tripSaveFailed") });
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader title={t("wizard.title")} subtitle={t("wizard.subtitle")} />
      <GlassPanel sx={{ p: { xs: 2, md: 2.5 }, display: "grid", gap: 1.5 }}>
        <Typography variant="overline" color="primary.main">
          {t("wizard.planningMode")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {planningModes.map((mode) => (
            <Chip
              key={mode.value}
              clickable
              color={draft.planningMode === mode.value ? "primary" : "default"}
              label={t(mode.titleKey)}
              onClick={() => patchDraft({ planningMode: mode.value })}
              sx={{ px: 0.5 }}
            />
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {draft.planningMode === "event_led" ? t("wizard.planningModes.eventLedDescription") : t("wizard.planningModes.cityFirstDescription")}
        </Typography>
      </GlassPanel>
      <GlassPanel sx={{ p: { xs: 2, md: 3 } }}>
        <Stepper activeStep={step} alternativeLabel>
          {[
            draft.planningMode === "event_led" ? t("wizard.stepAnchors") : t("wizard.stepDestination"),
            t("wizard.stepStyle"),
            t("wizard.stepLogistics"),
          ].map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </GlassPanel>

      <GlassPanel elevated sx={{ p: { xs: 2.5, md: 4 }, display: "grid", gap: 3 }}>
        {formMessage ? <Alert severity="warning">{formMessage}</Alert> : null}
        {step === 0 && draft.planningMode === "city_first" ? (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Typography variant="h6">{t("wizard.destination")}</Typography>
            {draft.tripSegments.map((segment, index) => (
              <GlassPanel key={segment.id} sx={{ p: 2, display: "grid", gap: 2, background: "rgba(3, 15, 23, 0.42)" }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={5}>
                    <LocationAutocompleteField
                      label={t("wizard.cityCountry")}
                      city={segment.city}
                      country={segment.country}
                      error={Boolean(tripValidation.segmentErrorsById[segment.id]?.city) || Boolean(tripValidation.segmentErrorsById[segment.id]?.country)}
                      helperText={tripValidation.segmentErrorsById[segment.id]?.city ?? tripValidation.segmentErrorsById[segment.id]?.country ?? " "}
                      onSelect={(value) =>
                        updateSegment(segment.id, {
                          city: value?.city ?? "",
                          country: value?.country ?? "",
                        })
                      }
                    />
                  </Grid>
                  <Grid item xs={6} md={2}>
                    <TextField fullWidth type="date" label={t("wizard.start")} InputLabelProps={{ shrink: true }} value={segment.startDate} error={Boolean(tripValidation.segmentErrorsById[segment.id]?.startDate)} helperText={tripValidation.segmentErrorsById[segment.id]?.startDate ?? " "} onChange={(event) => updateSegment(segment.id, { startDate: event.target.value })} />
                  </Grid>
                  <Grid item xs={6} md={2}>
                    <TextField fullWidth type="date" label={t("wizard.end")} InputLabelProps={{ shrink: true }} value={segment.endDate} error={Boolean(tripValidation.segmentErrorsById[segment.id]?.endDate)} helperText={tripValidation.segmentErrorsById[segment.id]?.endDate ?? " "} onChange={(event) => updateSegment(segment.id, { endDate: event.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField fullWidth label={t("wizard.hotel")} value={segment.hotelInfo.name ?? ""} onChange={(event) => updateSegment(segment.id, { hotelInfo: { ...segment.hotelInfo, name: event.target.value } })} />
                  </Grid>
                </Grid>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label={t("wizard.arrivalNotes")} value={segment.arrivalTransportNotes ?? ""} onChange={(event) => updateSegment(segment.id, { arrivalTransportNotes: event.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label={t("wizard.departureNotes")} value={segment.departureTransportNotes ?? ""} onChange={(event) => updateSegment(segment.id, { departureTransportNotes: event.target.value })} />
                  </Grid>
                </Grid>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    {t("wizard.stopNumber", { count: index + 1 })}
                  </Typography>
                  {draft.tripSegments.length > 1 ? (
                    <Button color="inherit" onClick={() => setSegmentToRemove(segment.id)}>
                      {t("wizard.removeStop")}
                    </Button>
                  ) : null}
                </Box>
              </GlassPanel>
            ))}
            <Button variant="outlined" onClick={addSegment}>
              {t("wizard.addCity")}
            </Button>
          </Box>
        ) : null}

        {step === 0 && draft.planningMode === "event_led" ? (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Typography variant="h6">{t("wizard.anchorEvent")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("wizard.anchorEventSubtitle")}
            </Typography>
            <GlassPanel sx={{ p: 2, display: "grid", gap: 2, background: "rgba(3, 15, 23, 0.42)" }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField select fullWidth label={t("wizard.eventType")} value={eventDraft.type} onChange={(event) => patchEventDraft("type", event.target.value as AnchorEventDraft["type"])}>
                    {["concert", "festival", "show", "sports", "exhibition", "other"].map((type) => (
                      <MenuItem key={type} value={type}>{t(`wizard.eventTypes.${type}`)}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField fullWidth label={t("wizard.eventTitle")} value={eventDraft.title} error={showEventErrors && Boolean(eventValidation.errors.title)} helperText={showEventErrors ? (eventValidation.errors.title ?? " ") : " "} onChange={(event) => patchEventDraft("title", event.target.value)} />
                </Grid>
                <Grid item xs={12} md={4}>
                  <LocationAutocompleteField
                    label={t("wizard.eventLocation")}
                    city={eventDraft.city}
                    country={eventDraft.country}
                    error={showEventErrors && Boolean(eventValidation.errors.city)}
                    helperText={showEventErrors ? (eventValidation.errors.city ?? " ") : " "}
                    onSelect={(value) => {
                      patchEventDraft("city", value?.city ?? "");
                      patchEventDraft("country", value?.country ?? "");
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField fullWidth label={t("wizard.venue")} value={eventDraft.venue} onChange={(event) => patchEventDraft("venue", event.target.value)} />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField fullWidth type="date" label={t("wizard.eventDate")} InputLabelProps={{ shrink: true }} value={eventDraft.date} error={showEventErrors && Boolean(eventValidation.errors.date)} helperText={showEventErrors ? (eventValidation.errors.date ?? " ") : " "} onChange={(event) => patchEventDraft("date", event.target.value)} />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField fullWidth type="time" label={t("wizard.eventStartTime")} InputLabelProps={{ shrink: true }} value={eventDraft.startTime} error={showEventErrors && Boolean(eventValidation.errors.startTime)} helperText={showEventErrors ? (eventValidation.errors.startTime ?? " ") : " "} onChange={(event) => patchEventDraft("startTime", event.target.value)} />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField fullWidth type="time" label={t("wizard.eventEndTime")} InputLabelProps={{ shrink: true }} value={eventDraft.endTime ?? ""} error={showEventErrors && Boolean(eventValidation.errors.endTime)} helperText={showEventErrors ? (eventValidation.errors.endTime ?? " ") : " "} onChange={(event) => patchEventDraft("endTime", event.target.value)} />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    fullWidth
                    label={t("wizard.ticketStatus")}
                    value={eventDraft.ticketStatus}
                    onChange={(event) => {
                      const nextStatus = event.target.value as AnchorEventDraft["ticketStatus"];
                      patchEventDraft("ticketStatus", nextStatus);
                      if (nextStatus === "booked") {
                        patchEventDraft("bufferDaysBefore", 1);
                        patchEventDraft("bufferDaysAfter", 1);
                        return;
                      }
                      patchEventDraft("bufferDaysBefore", 0);
                      patchEventDraft("bufferDaysAfter", 0);
                    }}
                  >
                    {["interested", "planned", "booked"].map((status) => (
                      <MenuItem key={status} value={status}>{t(`wizard.ticketStatuses.${status}`)}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    type="number"
                    label={t("wizard.bufferBefore")}
                    value={eventDraft.bufferDaysBefore}
                    onChange={(event) => patchEventDraft("bufferDaysBefore", Math.max(0, Number(event.target.value) || 0))}
                    InputProps={{ inputProps: { min: 0, max: 7 } }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    type="number"
                    label={t("wizard.bufferAfter")}
                    value={eventDraft.bufferDaysAfter}
                    onChange={(event) => patchEventDraft("bufferDaysAfter", Math.max(0, Number(event.target.value) || 0))}
                    InputProps={{ inputProps: { min: 0, max: 7 } }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Button fullWidth variant="outlined" startIcon={<AddRoundedIcon />} onClick={addAnchorEvent} sx={{ height: "100%" }} disabled={!eventValidation.isValid}>
                    {t("wizard.addEvent")}
                  </Button>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">
                    {eventDraft.ticketStatus === "booked"
                      ? "Booked tickets default to one day buffer before and after the event."
                      : "Interested/planned tickets default to flexible buffers (0 days). Increase if you want a wider arrival/departure window."}
                  </Typography>
                </Grid>
              </Grid>
              {draft.anchorEvents.length > 0 ? (
                <Box sx={{ display: "grid", gap: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t("wizard.derivedRoute")}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    {draft.anchorEvents.map((event) => (
                      <Chip key={event.id} label={`${event.title} · ${event.city} · ${dayjs(event.startAt).format("D MMM, HH:mm")}`} onDelete={() => setAnchorEventToRemove(event.id)} />
                    ))}
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t("wizard.noAnchorEvents")}
                </Typography>
              )}
            </GlassPanel>
          </Box>
        ) : null}

        {step === 1 ? (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Typography variant="h6">{t("wizard.vibe")}</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {chipOptions.map((option) => (
                <Chip key={option.value} label={t(option.labelKey)} color={draft.preferences.vibe.includes(option.value) ? "primary" : "default"} onClick={() => toggleVibe(option.value)} />
              ))}
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  label={t("wizard.mustSeeNotes")}
                  placeholder={t("wizard.mustSeePlaceholder")}
                  value={draft.preferences.mustSeeNotes}
                  onChange={(event) => patchDraft({ preferences: { ...draft.preferences, mustSeeNotes: event.target.value } })}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label={t("wizard.party")} value={draft.preferences.partyComposition} onChange={(event) => patchDraft({ preferences: { ...draft.preferences, partyComposition: event.target.value as TripDraft["preferences"]["partyComposition"] } })}>
                  {["solo", "couple", "friends", "family"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label={t("wizard.pace")} value={draft.preferences.pace} onChange={(event) => patchDraft({ preferences: { ...draft.preferences, pace: event.target.value as TripDraft["preferences"]["pace"] } })}>
                  {["slow", "balanced", "dense"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label={t("wizard.walking")} value={draft.preferences.walkingTolerance} onChange={(event) => patchDraft({ preferences: { ...draft.preferences, walkingTolerance: event.target.value as TripDraft["preferences"]["walkingTolerance"] } })}>
                  {["low", "medium", "high"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label={t("wizard.explorationSpeed")} value={draft.executionProfile.explorationSpeed} onChange={(event) => patchDraft({ executionProfile: { ...draft.executionProfile, explorationSpeed: event.target.value as TripDraft["executionProfile"]["explorationSpeed"] } })}>
                  {["slow", "standard", "fast", "very_fast"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {t(`wizard.speed.${value}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label={t("wizard.scheduleDensity")} value={draft.executionProfile.scheduleDensity} onChange={(event) => patchDraft({ executionProfile: { ...draft.executionProfile, scheduleDensity: event.target.value as TripDraft["executionProfile"]["scheduleDensity"] } })}>
                  {["relaxed", "balanced", "dense", "extreme"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {t(`wizard.density.${value}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label={t("wizard.eventCentricity")} value={draft.executionProfile.eventCentricity} onChange={(event) => patchDraft({ executionProfile: { ...draft.executionProfile, eventCentricity: event.target.value as TripDraft["executionProfile"]["eventCentricity"] } })}>
                  {["low", "medium", "high"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {t(`common.level.${value}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          </Box>
        ) : null}

        {step === 2 ? (
          <Box sx={{ display: "grid", gap: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label={t("wizard.flight")} value={draft.flightInfo.flightNumber ?? ""} onChange={(event) => patchDraft({ flightInfo: { ...draft.flightInfo, flightNumber: event.target.value } })} />
              </Grid>
                <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label={t("wizard.budget")}
                  value={draft.budget.amount}
                  error={Boolean(tripValidation.budgetErrors.amount)}
                  helperText={tripValidation.budgetErrors.amount ?? " "}
                  onChange={(event) => patchDraft({ budget: { ...draft.budget, amount: Number(event.target.value) } })}
                />
              </Grid>
              <Grid item xs={12} md={12}>
                <TextField fullWidth label={t("wizard.wishes")} value={draft.preferences.specialWishes} onChange={(event) => patchDraft({ preferences: { ...draft.preferences, specialWishes: event.target.value } })} />
              </Grid>
            </Grid>
          </Box>
        ) : null}

        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            {t("common.cancel")}
          </Button>
          {step < 2 ? (
            <Button variant="contained" disabled={!currentStepValidation.isValid} onClick={continueToNextStep}>
              {t("common.continue")}
            </Button>
          ) : (
            <Button variant="contained" disabled={!tripValidation.isValid || isGenerating} startIcon={<AutoAwesomeOutlinedIcon />} onClick={() => void generate()}>
              {t("wizard.generate")}
            </Button>
          )}
        </Box>
      </GlassPanel>

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
      {options.length > 0 ? (
        <Grid container spacing={2}>
          {options.map((option) => (
            <Grid item xs={12} md={4} key={option.optionId}>
              <GlassPanel sx={{ p: 2.5, display: "grid", gap: 2, height: "100%" }}>
                <EntityPreviewImage
                  title={option.trip.tripSegments[0]?.city ?? option.trip.destination}
                  locationHint={option.trip.tripSegments[0]?.country ?? option.trip.destination}
                  categoryHint="city"
                  alt={option.trip.title}
                  height={156}
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
          ))}
        </Grid>
      ) : null}
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
  );
};
