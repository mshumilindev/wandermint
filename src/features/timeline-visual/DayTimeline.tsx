import { Alert, Box, Chip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DayTimelineProps } from "./DayTimeline.types";
import { NowLine } from "./NowLine";
import { buildTimelineLayout, computeTimelineNowLine, suggestTimelineHours, TIMELINE_PX_PER_HOUR } from "./timelinePositioning";

dayjs.extend(utc);
dayjs.extend(timezone);

const HOUR_LABEL_WIDTH = 52;

const formatHourLabel = (hour: number): string => {
  if (hour === 24) {
    return "00";
  }
  const h = hour % 24;
  return `${h.toString().padStart(2, "0")}:00`;
};

export const DayTimeline = ({
  date,
  timezone: timeZone,
  startHour: startHourProp,
  endHour: endHourProp,
  items,
  readonly: _readOnly = false,
  showNowIndicator = true,
}: DayTimelineProps): JSX.Element => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [displayNowIso, setDisplayNowIso] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!showNowIndicator) {
      return;
    }
    const sync = (): void => {
      setDisplayNowIso(new Date().toISOString());
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, [showNowIndicator]);

  const { startHour, endHour } = useMemo(() => {
    const suggested = suggestTimelineHours(items, timeZone, startHourProp, endHourProp);
    return {
      startHour: Math.min(suggested.startHour, startHourProp),
      endHour: Math.max(suggested.endHour, endHourProp),
    };
  }, [items, timeZone, startHourProp, endHourProp]);

  const layout = useMemo(
    () => buildTimelineLayout(date, timeZone, startHour, endHour, items),
    [date, timeZone, startHour, endHour, items],
  );

  const nowState = useMemo(
    () =>
      computeTimelineNowLine({
        currentTime: displayNowIso,
        date,
        timezone: timeZone,
        startHour,
        endHour,
        windowStartMs: layout.windowStartMs,
        windowEndMs: layout.windowEndMs,
        trackHeightPx: layout.trackHeightPx,
      }),
    [displayNowIso, date, timeZone, startHour, endHour, layout.windowStartMs, layout.windowEndMs, layout.trackHeightPx],
  );

  const currentItemId = useMemo(() => {
    if (!showNowIndicator || nowState.linePx == null) {
      return null;
    }
    const y = nowState.linePx;
    const hit = layout.positioned.find((p) => y >= p.topPx - 0.5 && y <= p.topPx + p.heightPx + 0.5);
    return hit?.item.id ?? null;
  }, [showNowIndicator, nowState.linePx, layout.positioned]);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = startHour; h < endHour; h++) {
      list.push(h);
    }
    return list;
  }, [startHour, endHour]);

  const hourCount = Math.max(1, endHour - startHour);

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      {layout.hasOverlap ? (
        <Alert severity="warning" variant="outlined" sx={{ borderRadius: 1.5, py: 0.5 }}>
          {t("timelineVisual.overlapWarning")}
        </Alert>
      ) : null}

      {showNowIndicator && nowState.isTimelineDay && nowState.showBeforeHint ? (
        <Alert severity="info" variant="outlined" sx={{ borderRadius: 1.5, py: 0.5 }}>
          {t("timelineVisual.dayNotStarted")}
        </Alert>
      ) : null}
      {showNowIndicator && nowState.isTimelineDay && nowState.showAfterHint ? (
        <Alert severity="info" variant="outlined" sx={{ borderRadius: 1.5, py: 0.5 }}>
          {t("timelineVisual.dayFinished")}
        </Alert>
      ) : null}

      <Box sx={{ display: "flex", gap: 0, borderRadius: 2, overflow: "hidden", border: 1, borderColor: "divider" }}>
        <Box
          sx={{
            width: HOUR_LABEL_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: (th) => alpha(th.palette.text.primary, 0.02),
          }}
        >
          <Box sx={{ height: layout.trackHeightPx, position: "relative" }}>
            {hours.map((h, i) => (
              <Box
                key={h}
                sx={{
                  position: "absolute",
                  top: (i / hourCount) * layout.trackHeightPx,
                  left: 0,
                  right: 0,
                  height: layout.trackHeightPx / hourCount,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-end",
                  pr: 0.75,
                  pt: 0.25,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
                  {formatHourLabel(h)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, position: "relative" }}>
          <Box
            sx={{
              height: layout.trackHeightPx,
              position: "relative",
              bgcolor: (th) => alpha(th.palette.primary.main, 0.03),
              backgroundImage: (th) =>
                `linear-gradient(${alpha(th.palette.divider, 0.45)} 1px, transparent 1px)`,
              backgroundSize: `100% ${TIMELINE_PX_PER_HOUR / 4}px`,
            }}
          >
            {hours.map((h, i) => (
              <Box
                key={`grid-${h}`}
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: (i / hourCount) * layout.trackHeightPx,
                  height: layout.trackHeightPx / hourCount,
                  borderTop: 1,
                  borderColor: "divider",
                  pointerEvents: "none",
                }}
              />
            ))}

            {layout.travel.map((seg) => {
              const widthPct = 100 / seg.laneCount;
              const leftPct = (100 / seg.laneCount) * seg.lane;
              return (
                <Box
                  key={seg.id}
                  sx={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    px: 0.5,
                    top: seg.topPx,
                    height: seg.heightPx,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <Box
                    sx={{
                      width: "100%",
                      maxWidth: 120,
                      borderRadius: 1,
                      py: 0.25,
                      px: 0.5,
                      bgcolor: (th) => alpha(th.palette.text.secondary, 0.12),
                      border: 1,
                      borderColor: "divider",
                      borderStyle: "dashed",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", fontSize: 10 }}>
                      {seg.minutes > 0 ? t("timelineVisual.travelMinutes", { minutes: seg.minutes }) : t("timelineVisual.travel")}
                    </Typography>
                  </Box>
                </Box>
              );
            })}

            {layout.positioned.map((p) => {
              const isCurrent = p.item.id === currentItemId;
              const done = p.item.status === "completed";
              const skipped = p.item.status === "skipped";
              const widthPct = 100 / p.laneCount;
              const leftPct = (100 / p.laneCount) * p.lane;
              return (
                <Box
                  key={p.item.id}
                  sx={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    px: 0.35,
                    top: p.topPx,
                    height: p.heightPx,
                    minHeight: p.heightPx,
                  }}
                >
                  <Box
                    sx={{
                      height: "100%",
                      borderRadius: 1.5,
                      px: 1,
                      py: 0.5,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-start",
                      border: 1,
                      borderColor: isCurrent ? "primary.main" : "divider",
                      bgcolor: done
                        ? alpha(theme.palette.success.main, 0.12)
                        : skipped
                          ? alpha(theme.palette.text.disabled, 0.08)
                          : isCurrent
                            ? alpha(theme.palette.primary.main, 0.14)
                            : alpha(theme.palette.background.paper, 0.9),
                      boxShadow: isCurrent ? `0 0 0 2px ${alpha(theme.palette.primary.main, 0.35)}` : undefined,
                      opacity: skipped ? 0.72 : 1,
                      textDecoration: skipped ? "line-through" : undefined,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, fontSize: 10 }} noWrap>
                      {dayjs(p.item.plannedStartTime).tz(timeZone).format("HH:mm")} – {dayjs(p.item.plannedEndTime).tz(timeZone).format("HH:mm")}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.25, fontSize: 13 }} noWrap>
                      {p.item.title}
                    </Typography>
                    {isCurrent ? (
                      <Chip label={t("timelineVisual.now")} size="small" color="primary" sx={{ height: 20, mt: 0.25, alignSelf: "flex-start" }} />
                    ) : null}
                  </Box>
                </Box>
              );
            })}

            <NowLine
              enabled={showNowIndicator}
              currentTime={displayNowIso}
              date={date}
              timezone={timeZone}
              startHour={startHour}
              endHour={endHour}
              windowStartMs={layout.windowStartMs}
              windowEndMs={layout.windowEndMs}
              trackHeightPx={layout.trackHeightPx}
            />
          </Box>
        </Box>
      </Box>

      {layout.unscheduled.length > 0 ? (
        <Box sx={{ borderRadius: 2, border: 1, borderColor: "divider", p: 1.5, bgcolor: (th) => alpha(th.palette.warning.main, 0.06) }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("timelineVisual.unscheduledTitle")}
          </Typography>
          <Box sx={{ display: "grid", gap: 0.75 }}>
            {layout.unscheduled.map((it) => (
              <Typography key={it.id} variant="body2" color="text.secondary">
                · {it.title}
              </Typography>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};
