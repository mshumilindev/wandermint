import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import { Box, Button, Chip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { getCountryFlagEmoji } from "../../../shared/ui/CountryFlag";
import { ActivityBlockCard } from "./ActivityBlockCard";
import { MovementLegRow } from "./MovementLegRow";
import { buildGoogleMapsDirectionsUrl } from "../../../shared/lib/googleMapsDirectionsUrl";
import { DayTimeline } from "../../timeline-visual/DayTimeline";
import { dayPlanToTripPlanItems } from "../execution/buildLiveExecutionModel";
import { classifyDayVsToday, findCalendarTodayDayId } from "../pacing/tripCurrentDay";
import { resolvePlanTimezone } from "../pacing/planTimeUtils";

interface DayPlanTimelineProps {
  dayPlans: DayPlan[];
  openLabel?: string;
  doneLabel: string;
  skippedLabel: string;
  /** Shared / read-only: hide step costs even if present on the model. */
  hideCosts?: boolean;
  /** When set, “today” is resolved per day using {@link resolvePlanTimezone}. */
  trip?: Trip | null;
  /** Scroll the calendar-today day into view once per session; use e.g. `tripId` so revisiting resets scroll. */
  autoScrollToToday?: boolean;
  scrollSessionKey?: string;
  /** Renders an hour-scaled day schedule under each day (requires `trip`). */
  showHourlyTimeline?: boolean;
  /** When `showHourlyTimeline`, shows the moving “now” line when true (e.g. match share `includeLiveStatus`). */
  hourlyShowNowIndicator?: boolean;
  /** Read-only: hour view hides controls (shared viewers). */
  hourlyReadonly?: boolean;
  /** Block ids that should briefly emphasize after a remote completion sync (e.g. shared link). */
  completionHighlightBlockIds?: ReadonlySet<string>;
}

const countCompletedBlocks = (day: DayPlan): number => day.blocks.filter((b) => b.completionStatus === "done").length;

export const DayPlanTimeline = ({
  dayPlans,
  openLabel,
  doneLabel,
  skippedLabel,
  hideCosts = false,
  trip = null,
  autoScrollToToday = false,
  scrollSessionKey = "",
  showHourlyTimeline = false,
  hourlyShowNowIndicator = true,
  hourlyReadonly = false,
  completionHighlightBlockIds,
}: DayPlanTimelineProps): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const todayElRef = useRef<HTMLDivElement | null>(null);
  const didScrollRef = useRef(false);

  const todayId = useMemo(() => {
    if (!trip || dayPlans.length === 0) {
      return null;
    }
    return findCalendarTodayDayId(dayPlans, trip, new Date());
  }, [trip, dayPlans]);

  useEffect(() => {
    if (!autoScrollToToday || !todayId || didScrollRef.current) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      todayElRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      didScrollRef.current = true;
    });
    return () => window.cancelAnimationFrame(id);
  }, [autoScrollToToday, todayId, dayPlans]);

  useEffect(() => {
    didScrollRef.current = false;
  }, [scrollSessionKey, todayId, trip?.id]);

  const groupedPlans = dayPlans.reduce<Array<{ segmentId: string; cityLabel: string; countryLabel?: string; days: DayPlan[] }>>((groups, dayPlan) => {
    const currentGroup = groups.at(-1);
    if (currentGroup && currentGroup.segmentId === dayPlan.segmentId) {
      currentGroup.days.push(dayPlan);
      return groups;
    }

    return [
      ...groups,
      {
        segmentId: dayPlan.segmentId,
        cityLabel: dayPlan.cityLabel,
        countryLabel: dayPlan.countryLabel,
        days: [dayPlan],
      },
    ];
  }, []);

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {groupedPlans.map((group) => (
        <Box key={group.segmentId} sx={{ display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", px: 0.25 }}>
            <Typography variant="overline" color="primary.main">
              {group.cityLabel}
            </Typography>
            {group.countryLabel ? <MetadataPill label={`${getCountryFlagEmoji(group.countryLabel) ?? ""} ${group.countryLabel}`.trim()} tone="teal" /> : null}
            <MetadataPill label={`${group.days.length} ${group.days.length === 1 ? "day" : "days"}`} />
          </Box>
          {group.days.map((dayPlan) => {
            const vsToday = trip ? classifyDayVsToday(dayPlan, trip, new Date()) : null;
            const isToday = vsToday === "today";
            const attachTodayRef = isToday && todayId === dayPlan.id ? todayElRef : undefined;
            const totalBlocks = dayPlan.blocks.length;
            const completedBlocks = countCompletedBlocks(dayPlan);
            return (
              <Box key={dayPlan.id} ref={attachTodayRef}>
                <GlassPanel
                  sx={{
                    p: 2.5,
                    display: "grid",
                    gap: 2,
                    ...(isToday
                      ? {
                          border: "1px solid",
                          borderColor: "primary.main",
                          boxShadow: (theme) => `0 0 0 1px ${alpha(theme.palette.primary.main, 0.35)}, 0 8px 28px ${alpha(theme.palette.common.black, 0.12)}`,
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                        }
                      : {}),
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.25 }}>
                        <Typography variant="overline" color="text.secondary">
                          {dayPlan.date} · {dayPlan.cityLabel}
                        </Typography>
                        {isToday ? (
                          <Chip label={t("trips.currentDay.todayBadge")} size="small" color="primary" variant="outlined" sx={{ height: 22 }} />
                        ) : null}
                      </Box>
                      <Typography variant="h6">{dayPlan.theme}</Typography>
                      {isToday && totalBlocks > 0 ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          {t("trips.currentDay.blockProgress", { done: completedBlocks, total: totalBlocks })}
                        </Typography>
                      ) : null}
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                      <StatusBadge status={dayPlan.completionStatus} />
                      <MetadataPill label={dayPlan.validationStatus} tone={dayPlan.validationStatus === "fresh" ? "teal" : "amber"} />
                      {(() => {
                        const url = buildGoogleMapsDirectionsUrl(
                          dayPlan.blocks
                            .map((b) => b.place)
                            .filter((place): place is NonNullable<(typeof dayPlan.blocks)[number]["place"]> =>
                              Boolean(place && place.latitude !== undefined && place.longitude !== undefined),
                            ),
                        );
                        return url ? (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<MapOutlinedIcon />}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ textTransform: "none" }}
                          >
                            {t("common.openInGoogleMaps")}
                          </Button>
                        ) : null;
                      })()}
                      {openLabel ? (
                        <Button variant="outlined" onClick={() => void navigate({ to: "/trips/$tripId/day/$dayId", params: { tripId: dayPlan.tripId, dayId: dayPlan.id } })}>
                          {openLabel}
                        </Button>
                      ) : null}
                    </Box>
                  </Box>
                  <Box sx={{ display: "grid", gap: 1.5 }}>
                    {dayPlan.blocks.slice(0, openLabel ? 2 : dayPlan.blocks.length).map((block, index, visibleBlocks) => (
                      <Box key={block.id} sx={{ display: "grid", gap: 1.25 }}>
                        <ActivityBlockCard
                          block={block}
                          doneLabel={doneLabel}
                          skippedLabel={skippedLabel}
                          hideCosts={hideCosts}
                          statusHighlight={Boolean(completionHighlightBlockIds?.has(block.id))}
                        />
                        {index < visibleBlocks.length - 1
                          ? (() => {
                              const nextBlock = visibleBlocks[index + 1];
                              const leg = dayPlan.movementLegs?.find((item) => item.fromBlockId === block.id && item.toBlockId === nextBlock?.id);
                              return leg ? <MovementLegRow leg={leg} /> : null;
                            })()
                          : null}
                      </Box>
                    ))}
                  </Box>
                  {showHourlyTimeline && trip && dayPlan.blocks.length > 0 ? (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        {t("timelineVisual.scheduleHeading")}
                      </Typography>
                      <DayTimeline
                        date={dayPlan.date}
                        timezone={resolvePlanTimezone(trip, dayPlan.segmentId)}
                        startHour={7}
                        endHour={22}
                        items={dayPlanToTripPlanItems(dayPlan, trip, dayPlan.movementLegs)}
                        showNowIndicator={hourlyShowNowIndicator}
                        readonly={hourlyReadonly}
                      />
                    </Box>
                  ) : null}
                </GlassPanel>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};
