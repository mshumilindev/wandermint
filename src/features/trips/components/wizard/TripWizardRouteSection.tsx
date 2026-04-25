import type { Dispatch, SetStateAction } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { Box, Button, Chip, Grid, MenuItem, TextField, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { TripDraft } from "../../../../services/planning/tripGenerationService";
import { AccommodationBaseSearchField } from "../AccommodationBaseSearchField";
import { GlassPanel } from "../../../../shared/ui/GlassPanel";
import { WizardStepCard } from "../../../../shared/ui/wizard/WizardStepCard";
import { LocationAutocompleteField } from "../../../../shared/ui/LocationAutocompleteField";
import { EntityPreviewImage } from "../../../../shared/ui/EntityPreviewImage";
import { sanitizeUserFacingLine } from "../../../../shared/lib/userFacingText";
import type { AnchorEventDraft, EventValidationResult, TripValidationResult } from "../../validation/tripWizardValidation";
import { EventLookupResultsPanel } from "../../events/EventLookupResultsPanel";
import type { EventLookupResult } from "../../../../entities/events/eventLookup.model";
import type { UseEventLookupState } from "../../events/useEventLookup";
import { WizardSectionHeader } from "../../../../shared/ui/wizard/WizardSectionHeader";
import { TransportNodeSearchField } from "../TransportNodeSearchField";
import type { TransportNode } from "../../../../services/transport/transportNodeTypes";

const planningModes = [
  { value: "city_first" as const, titleKey: "wizard.planningModes.cityFirst", descriptionKey: "wizard.planningModes.cityFirstDescription" },
  { value: "event_led" as const, titleKey: "wizard.planningModes.eventLed", descriptionKey: "wizard.planningModes.eventLedDescription" },
];

interface TripWizardRouteSectionProps {
  draft: TripDraft;
  tripValidation: TripValidationResult;
  eventDraft: AnchorEventDraft;
  eventValidation: EventValidationResult;
  showEventErrors: boolean;
  eventLookupQuery: string;
  eventLookup: Pick<UseEventLookupState, "results" | "loading" | "error" | "warnings">;
  /** When false, catalog search is off — show a short privacy hint instead of results. */
  externalEventSearchAllowed?: boolean;
  patchDraft: (patch: Partial<TripDraft>) => void;
  updateSegment: (segmentId: string, patch: Partial<TripDraft["tripSegments"][number]>) => void;
  addSegment: () => void;
  patchEventDraft: <Key extends keyof AnchorEventDraft>(field: Key, value: AnchorEventDraft[Key], trackUserEdit?: boolean) => void;
  setEventFieldLocks: Dispatch<SetStateAction<Set<string>>>;
  setEventDraft: Dispatch<SetStateAction<AnchorEventDraft>>;
  addAnchorEvent: () => void;
  onEventLookupPick: (result: EventLookupResult, replaceAll: boolean) => void;
  onRemoveSegmentRequest: (segmentId: string) => void;
  onRemoveAnchorRequest: (eventId: string) => void;
}

export const TripWizardRouteSection = ({
  draft,
  tripValidation,
  eventDraft,
  eventValidation,
  showEventErrors,
  eventLookupQuery,
  eventLookup,
  externalEventSearchAllowed = true,
  patchDraft,
  updateSegment,
  addSegment,
  patchEventDraft,
  setEventFieldLocks,
  setEventDraft,
  addAnchorEvent,
  onEventLookupPick,
  onRemoveSegmentRequest,
  onRemoveAnchorRequest,
}: TripWizardRouteSectionProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <WizardStepCard sx={{ gap: 2 }}>
      <WizardSectionHeader index={1} title={t("wizard.sections.routeAnchors")} subtitle={t("wizard.sections.routeAnchorsSubtitle")} />

      <Box sx={{ display: "grid", gap: 1.5 }}>
        <Typography variant="overline" color="primary.main">
          {t("wizard.planningMode")}
        </Typography>
        <Grid container spacing={1.5}>
          {planningModes.map((mode) => (
            <Grid item xs={12} sm={6} key={mode.value}>
              <Box
                onClick={() => patchDraft({ planningMode: mode.value })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    patchDraft({ planningMode: mode.value });
                  }
                }}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: draft.planningMode === mode.value ? "primary.main" : "rgba(255,255,255,0.08)",
                  background: draft.planningMode === mode.value ? "rgba(0, 180, 216, 0.12)" : "rgba(3, 15, 23, 0.35)",
                  transition: "border-color 0.2s, background 0.2s",
                  "&:hover": { borderColor: "primary.light" },
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t(mode.titleKey)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  {t(mode.descriptionKey)}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>

      {draft.planningMode === "city_first" ? (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {t("wizard.destination")}
          </Typography>
          {draft.tripSegments.map((segment, index) => (
            <GlassPanel key={segment.id} sx={{ p: 2, display: "grid", gap: 2, background: "rgba(3, 15, 23, 0.42)", overflow: "visible" }}>
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
                  <TextField
                    fullWidth
                    type="date"
                    label={t("wizard.start")}
                    InputLabelProps={{ shrink: true }}
                    value={segment.startDate}
                    error={Boolean(tripValidation.segmentErrorsById[segment.id]?.startDate)}
                    helperText={tripValidation.segmentErrorsById[segment.id]?.startDate ?? " "}
                    onChange={(event) => updateSegment(segment.id, { startDate: event.target.value })}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    type="date"
                    label={t("wizard.end")}
                    InputLabelProps={{ shrink: true }}
                    value={segment.endDate}
                    error={Boolean(tripValidation.segmentErrorsById[segment.id]?.endDate)}
                    helperText={tripValidation.segmentErrorsById[segment.id]?.endDate ?? " "}
                    onChange={(event) => updateSegment(segment.id, { endDate: event.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={3} sx={{ overflow: "visible" }}>
                  <AccommodationBaseSearchField
                    label={t("wizard.hotel")}
                    city={segment.city}
                    country={segment.country}
                    dateRange={draft.dateRange}
                    value={draft.segmentAccommodationBases?.[segment.id]}
                    onChange={(next) => {
                      const bases = { ...(draft.segmentAccommodationBases ?? {}) };
                      if (!next) {
                        delete bases[segment.id];
                      } else {
                        bases[segment.id] = next;
                      }
                      patchDraft({ segmentAccommodationBases: bases });
                      updateSegment(segment.id, {
                        hotelInfo: {
                          ...segment.hotelInfo,
                          name: next?.label ?? "",
                          address: next?.mode === "resolved" ? next.candidate?.address : segment.hotelInfo.address,
                        },
                      });
                    }}
                  />
                </Grid>
              </Grid>
              {draft.tripSegments.length > 1 && index > 0 ? (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TransportNodeSearchField
                      label={t("wizard.transport.entryHub")}
                      city={segment.city}
                      country={segment.country}
                      value={draft.segmentTransportNodes?.[segment.id]?.entry}
                      onChange={(next: TransportNode | undefined) => {
                        const prevMap = draft.segmentTransportNodes ?? {};
                        const cur = prevMap[segment.id] ?? {};
                        const row = { ...cur, entry: next };
                        const nextMap = { ...prevMap, [segment.id]: row };
                        if (!row.entry && !row.exit) {
                          delete nextMap[segment.id];
                        }
                        patchDraft({
                          segmentTransportNodes: Object.keys(nextMap).length > 0 ? nextMap : {},
                        });
                      }}
                    />
                  </Grid>
                </Grid>
              ) : null}
              {draft.tripSegments.length > 1 && index < draft.tripSegments.length - 1 ? (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TransportNodeSearchField
                      label={t("wizard.transport.exitHub")}
                      city={segment.city}
                      country={segment.country}
                      value={draft.segmentTransportNodes?.[segment.id]?.exit}
                      onChange={(next: TransportNode | undefined) => {
                        const prevMap = draft.segmentTransportNodes ?? {};
                        const cur = prevMap[segment.id] ?? {};
                        const row = { ...cur, exit: next };
                        const nextMap = { ...prevMap, [segment.id]: row };
                        if (!row.entry && !row.exit) {
                          delete nextMap[segment.id];
                        }
                        patchDraft({
                          segmentTransportNodes: Object.keys(nextMap).length > 0 ? nextMap : {},
                        });
                      }}
                    />
                  </Grid>
                </Grid>
              ) : null}
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label={t("wizard.arrivalNotes")}
                    value={segment.arrivalTransportNotes ?? ""}
                    onChange={(event) => updateSegment(segment.id, { arrivalTransportNotes: event.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label={t("wizard.departureNotes")}
                    value={segment.departureTransportNotes ?? ""}
                    onChange={(event) => updateSegment(segment.id, { departureTransportNotes: event.target.value })}
                  />
                </Grid>
              </Grid>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">
                  {t("wizard.stopNumber", { count: index + 1 })}
                </Typography>
                {draft.tripSegments.length > 1 ? (
                  <Button color="inherit" onClick={() => onRemoveSegmentRequest(segment.id)}>
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
      ) : (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {t("wizard.anchorEvent")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("wizard.anchorEventSubtitle")}
          </Typography>
          <GlassPanel sx={{ p: 2, display: "grid", gap: 2, background: "rgba(3, 15, 23, 0.42)" }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label={t("wizard.eventType")} value={eventDraft.type} onChange={(event) => patchEventDraft("type", event.target.value as AnchorEventDraft["type"])}>
                  {["concert", "festival", "show", "sports", "exhibition", "other"].map((type) => (
                    <MenuItem key={type} value={type}>
                      {t(`wizard.eventTypes.${type}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label={t("wizard.eventTitle")}
                  value={eventDraft.title}
                  error={showEventErrors && Boolean(eventValidation.errors.title)}
                  helperText={showEventErrors ? (eventValidation.errors.title ?? " ") : " "}
                  onChange={(event) => patchEventDraft("title", event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label={t("wizard.eventArtist")} value={eventDraft.artistOrSeries ?? ""} onChange={(event) => patchEventDraft("artistOrSeries", event.target.value)} />
              </Grid>
              <Grid item xs={12} md={4}>
                <LocationAutocompleteField
                  label={t("wizard.eventLocation")}
                  city={eventDraft.city}
                  country={eventDraft.country}
                  error={showEventErrors && Boolean(eventValidation.errors.city)}
                  helperText={showEventErrors ? (eventValidation.errors.city ?? " ") : " "}
                  onSelect={(value) => {
                    setEventFieldLocks((prev) => new Set(prev).add("city").add("country"));
                    setEventDraft((current) => ({
                      ...current,
                      city: value?.city ?? "",
                      country: value?.country ?? "",
                    }));
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label={t("wizard.venue")} value={eventDraft.venue} onChange={(event) => patchEventDraft("venue", event.target.value)} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="date"
                  label={t("wizard.eventDate")}
                  InputLabelProps={{ shrink: true }}
                  value={eventDraft.date}
                  error={showEventErrors && Boolean(eventValidation.errors.date)}
                  helperText={showEventErrors ? (eventValidation.errors.date ?? " ") : " "}
                  onChange={(event) => patchEventDraft("date", event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="date"
                  label={t("wizard.eventEndDate")}
                  InputLabelProps={{ shrink: true }}
                  value={eventDraft.endDate ?? ""}
                  error={showEventErrors && Boolean(eventValidation.errors.endDate)}
                  helperText={showEventErrors ? (eventValidation.errors.endDate ?? " ") : " "}
                  onChange={(event) => patchEventDraft("endDate", event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="time"
                  label={t("wizard.eventStartTime")}
                  InputLabelProps={{ shrink: true }}
                  value={eventDraft.startTime}
                  error={showEventErrors && Boolean(eventValidation.errors.startTime)}
                  helperText={showEventErrors ? (eventValidation.errors.startTime ?? " ") : " "}
                  onChange={(event) => patchEventDraft("startTime", event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="time"
                  label={t("wizard.eventEndTime")}
                  InputLabelProps={{ shrink: true }}
                  value={eventDraft.endTime ?? ""}
                  error={showEventErrors && Boolean(eventValidation.errors.endTime)}
                  helperText={showEventErrors ? (eventValidation.errors.endTime ?? " ") : " "}
                  onChange={(event) => patchEventDraft("endTime", event.target.value)}
                />
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
                      patchEventDraft("bufferDaysBefore", 1, false);
                      patchEventDraft("bufferDaysAfter", 1, false);
                      return;
                    }
                    patchEventDraft("bufferDaysBefore", 0, false);
                    patchEventDraft("bufferDaysAfter", 0, false);
                  }}
                >
                  {["interested", "planned", "booked"].map((status) => (
                    <MenuItem key={status} value={status}>
                      {t(`wizard.ticketStatuses.${status}`)}
                    </MenuItem>
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
                    ? t("wizard.eventBufferHintBooked")
                    : t("wizard.eventBufferHintFlexible")}
                </Typography>
              </Grid>
            </Grid>
            {eventLookupQuery.length >= 3 && !externalEventSearchAllowed ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {t("privacy.eventSearchDisabledShort")}
              </Typography>
            ) : null}
            {eventLookupQuery.length >= 3 && externalEventSearchAllowed ? (
              <EventLookupResultsPanel
                mode="upcoming"
                results={eventLookup.results}
                loading={eventLookup.loading}
                error={eventLookup.error}
                warnings={eventLookup.warnings}
                onPick={onEventLookupPick}
              />
            ) : null}
          </GlassPanel>

          {draft.anchorEvents.length > 0 ? (
            <Box sx={{ display: "grid", gap: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t("wizard.derivedRoute")}
              </Typography>
              <Grid container spacing={1.5}>
                {draft.anchorEvents.map((event) => (
                  <Grid item xs={12} sm={6} key={event.id}>
                    <GlassPanel
                      sx={{
                        p: 0,
                        overflow: "hidden",
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "140px 1fr" },
                        minHeight: 120,
                        border: "1px solid rgba(0, 180, 216, 0.2)",
                      }}
                    >
                      <Box sx={{ position: "relative", minHeight: 100, bgcolor: "rgba(0,0,0,0.25)" }}>
                        <EntityPreviewImage
                          entityId={`anchor-draft:${event.id}`}
                          variant="activityThumb"
                          title={event.title}
                          locationHint={`${event.city}, ${event.country}`}
                          categoryHint="event"
                          existingImageUrl={event.imageUrl}
                          providerImageUrl={event.imageUrl}
                          latitude={event.latitude}
                          longitude={event.longitude}
                          alt={sanitizeUserFacingLine(event.title)}
                          sx={{ height: "100%", minHeight: 100, borderRadius: 0 }}
                        />
                        <Chip
                          icon={<LockRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                          label={t("wizard.lockedAnchor")}
                          size="small"
                          color="primary"
                          sx={{
                            position: "absolute",
                            top: 8,
                            left: 8,
                            fontWeight: 600,
                            backdropFilter: "blur(8px)",
                          }}
                        />
                      </Box>
                      <Box sx={{ p: 1.75, display: "grid", gap: 0.75 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, pr: 4 }}>
                          {sanitizeUserFacingLine(event.title)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {event.venue} · {event.city}
                        </Typography>
                        <Typography variant="body2" color="primary.light">
                          {dayjs(event.startAt).format("ddd D MMM · HH:mm")}
                        </Typography>
                        <Button size="small" color="inherit" onClick={() => onRemoveAnchorRequest(event.id)} sx={{ justifySelf: "start", mt: 0.5 }}>
                          {t("common.delete")}
                        </Button>
                      </Box>
                    </GlassPanel>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t("wizard.noAnchorEvents")}
            </Typography>
          )}
        </Box>
      )}
    </WizardStepCard>
  );
};
