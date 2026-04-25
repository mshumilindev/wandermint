/**
 * Traveler Journey — emotional center: a film-like map of who you are as a traveler.
 *
 * Components: {@link TravelerJourneyView}, data hook {@link useTravelerJourneyData}.
 * Layout: see `travelerJourneyLayout.ts` (timeline sine spine + constellation ring).
 * Interactions: `travelerJourneyInteractions.ts` (filters, throttle, reduced motion, viewport culling).
 * Data graph: `travelerJourneyBuilder.ts` (trips → spine, cities, achievements, bucket milestones).
 */

import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import ZoomOutMapOutlinedIcon from "@mui/icons-material/ZoomOutMapOutlined";
import { Box, Button, Popover, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "../../entities/trip/model";
import { useUserPreferencesStore } from "../../app/store/useUserPreferencesStore";
import { achievementRepository } from "../achievements/achievementRepository";
import type { AchievementProgressDocument } from "../achievements/achievementRepository";
import { bucketListRepository } from "../bucket-list/bucketListRepository";
import type { BucketListItem } from "../bucket-list/bucketList.types";
import { GlassPanel } from "../../shared/ui/GlassPanel";
import {
  buildCountriesByTripId,
  buildTravelerJourney,
  parseHomeCountryFromHomeCityLabel,
} from "./travelerJourneyBuilder";
import { buildSpinePath, layoutConstellation, layoutTimelinePath } from "./travelerJourneyLayout";
import type { TravelerJourneyVisualMode } from "./travelerJourney.types";
import type { TravelerJourney } from "./travelerJourney.types";
import type { TravelerJourneyNode } from "./travelerJourney.types";
import {
  filterTravelerJourney,
  getPrefersReducedMotion,
  graphViewportFromCanvasTransform,
  throttle,
  visibleNodeIdsInViewport,
} from "./travelerJourneyInteractions";

const VIRTUALIZE_THRESHOLD = 200;

export function useTravelerJourneyData(userId: string | undefined, trips: Trip[]): {
  journey: TravelerJourney;
  countriesByTripId: Map<string, string[]>;
  extrasLoading: boolean;
} {
  const preferences = useUserPreferencesStore((s) => s.preferences);
  const [achievements, setAchievements] = useState<AchievementProgressDocument[]>([]);
  const [bucket, setBucket] = useState<BucketListItem[]>([]);
  const [extrasLoading, setExtrasLoading] = useState(false);

  useEffect(() => {
    if (!userId?.trim()) {
      setAchievements([]);
      setBucket([]);
      return;
    }
    let cancelled = false;
    setExtrasLoading(true);
    void Promise.all([achievementRepository.listByUserId(userId), bucketListRepository.listByUserId(userId)])
      .then(([a, b]) => {
        if (!cancelled) {
          setAchievements(a);
          setBucket(b);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setExtrasLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const homeCountry = preferences?.homeCity ? parseHomeCountryFromHomeCityLabel(preferences.homeCity) : "";

  return useMemo(() => {
    const journey = buildTravelerJourney(trips, achievements, bucket, { homeCountry });
    const countriesByTripId = buildCountriesByTripId(trips);
    return { journey, countriesByTripId, extrasLoading };
  }, [trips, achievements, bucket, homeCountry]);
}

export type TravelerJourneyViewProps = {
  journey: TravelerJourney;
  countriesByTripId: Map<string, string[]>;
  /** Full analytics canvas or compact home / trip strip. */
  variant?: "full" | "strip";
  /** When set, dims everything outside this trip’s neighborhood (focus path). */
  focusTripId?: string;
  defaultMode?: TravelerJourneyVisualMode;
};

function focusNeighborhood(journey: TravelerJourney, focusTripId: string | undefined): Set<string> | null {
  if (!focusTripId?.trim()) {
    return null;
  }
  const root = `trip:${focusTripId}`;
  const ids = new Set<string>([root]);
  for (const n of journey.nodes) {
    if (n.tripId === focusTripId) {
      ids.add(n.id);
    }
  }
  for (const e of journey.edges) {
    if (e.from === root || e.to === root) {
      ids.add(e.from);
      ids.add(e.to);
    }
  }
  return ids;
}

function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 - 18;
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
}

export const TravelerJourneyView = ({
  journey: rawJourney,
  countriesByTripId,
  variant = "full",
  focusTripId,
  defaultMode = "timeline",
}: TravelerJourneyViewProps): JSX.Element => {
  const svgUid = useId().replace(/:/g, "");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const panDragRef = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null);
  const [size, setSize] = useState({ w: 920, h: 420 });
  const [mode, setMode] = useState<TravelerJourneyVisualMode>(defaultMode);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [countryQ, setCountryQ] = useState("");
  const [categoryQ, setCategoryQ] = useState("");
  const [tStart, setTStart] = useState("");
  const [tEnd, setTEnd] = useState("");
  const [hover, setHover] = useState<{ node: TravelerJourneyNode; anchor: { left: number; top: number } } | null>(
    null,
  );
  const [constellationPhase, setConstellationPhase] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const reducedMotion = useRef(getPrefersReducedMotion());
  const focusSet = useMemo(() => focusNeighborhood(rawJourney, focusTripId), [rawJourney, focusTripId]);

  const filtered = useMemo(
    () =>
      filterTravelerJourney(
        rawJourney,
        {
          country: countryQ || undefined,
          category: categoryQ || undefined,
          time: { start: tStart || undefined, end: tEnd || undefined },
        },
        countriesByTripId,
      ),
    [rawJourney, countryQ, categoryQ, tStart, tEnd, countriesByTripId],
  );

  const isStrip = variant === "strip";
  const tripCount = useMemo(() => filtered.nodes.filter((n) => n.type === "trip").length, [filtered.nodes]);
  const layoutW = isStrip ? Math.max(520, Math.max(tripCount, 1) * 124) : Math.max(560, size.w);
  const layoutH = isStrip ? 220 : Math.max(300, size.h);

  const positions = useMemo(() => {
    return mode === "timeline" ? layoutTimelinePath(filtered, layoutW, layoutH) : layoutConstellation(filtered, layoutW, layoutH);
  }, [filtered, mode, layoutW, layoutH]);

  const spineD = useMemo(() => buildSpinePath(filtered, positions), [filtered, positions]);

  useLayoutEffect(() => {
    if (isStrip) {
      return;
    }
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) {
        return;
      }
      setSize({ w: Math.max(400, cr.width), h: Math.max(300, cr.height || 400) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isStrip]);

  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!path || !spineD || reducedMotion.current || variant === "strip") {
      return;
    }
    try {
      const len = path.getTotalLength();
      path.style.strokeDasharray = `${len}`;
      path.style.strokeDashoffset = `${len}`;
      path.getBoundingClientRect();
      path.style.transition = "stroke-dashoffset 1.4s ease-out";
      path.style.strokeDashoffset = "0";
    } catch {
      /* ignore */
    }
  }, [spineD, mode, variant, filtered.nodes.length]);

  useEffect(() => {
    if (reducedMotion.current || mode !== "constellation" || variant === "strip") {
      return;
    }
    let raf = 0;
    const tick = (): void => {
      setConstellationPhase((p) => p + 0.012);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, variant]);

  const onWheel = useMemo(
    () =>
      throttle<[ReactWheelEvent]>((e) => {
        if (isStrip) {
          return;
        }
        e.preventDefault();
        const delta = -e.deltaY * 0.0015;
        setScale((s) => Math.min(2.6, Math.max(0.55, s + delta)));
      }, 32),
    [isStrip],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (isStrip || e.button !== 0) {
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsPanning(true);
      panDragRef.current = { cx: e.clientX, cy: e.clientY, px: pan.x, py: pan.y };
    },
    [isStrip, pan.x, pan.y],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = panDragRef.current;
      if (!d) {
        return;
      }
      setPan({
        x: d.px + (e.clientX - d.cx) * (layoutW / Math.max(wrapRef.current?.clientWidth ?? layoutW, 1)),
        y: d.py + (e.clientY - d.cy) * (layoutH / Math.max(wrapRef.current?.clientHeight ?? layoutH, 1)),
      });
    },
    [layoutW, layoutH],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (panDragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    panDragRef.current = null;
    setIsPanning(false);
  }, []);

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setScale(1);
  }, []);

  const visibleIds = useMemo(() => {
    if (filtered.nodes.length <= VIRTUALIZE_THRESHOLD) {
      return null;
    }
    const vp = graphViewportFromCanvasTransform(layoutW, layoutH, pan, scale);
    return visibleNodeIdsInViewport(positions, vp, 120);
  }, [filtered.nodes.length, positions, layoutW, layoutH, pan, scale]);

  const handleNodeNavigate = useCallback(
    (node: TravelerJourneyNode) => {
      if (node.tripId) {
        void navigate({ to: "/trips/$tripId", params: { tripId: node.tripId } });
        return;
      }
      if (node.type === "achievement") {
        void navigate({ to: "/achievements" });
        return;
      }
      if (node.type === "milestone" && node.id.startsWith("bucket:")) {
        void navigate({ to: "/bucket-list" });
      }
    },
    [navigate],
  );

  const cameraTransform = !isStrip ? `translate(${pan.x},${pan.y}) scale(${scale})` : undefined;
  const driftTransform =
    !isStrip && mode === "constellation" && !reducedMotion.current
      ? `rotate(${(Math.sin(constellationPhase) * 1.25).toFixed(4)} ${layoutW / 2} ${layoutH / 2})`
      : undefined;

  const showEmpty = filtered.nodes.length === 0;
  const emptyMessageKey =
    showEmpty && rawJourney.nodes.length > 0 ? "travelerJourney.emptyFiltered" : "travelerJourney.empty";

  return (
    <GlassPanel
      elevated={variant === "full"}
      sx={{
        p: variant === "strip" ? 1.5 : 2.5,
        position: "relative",
        overflow: "hidden",
        borderColor: "rgba(201, 184, 255, 0.22)",
        boxShadow: "0 0 48px rgba(var(--wm-space-orange-rgb), 0.06), 0 24px 80px rgba(0,0,0,0.35)",
      }}
    >
      <Stack spacing={isStrip ? 0.75 : 1.25}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box>
            {!isStrip ? (
              <Typography variant="overline" sx={{ color: "var(--deep-purple, var(--wm-deep-purple))", letterSpacing: 4 }}>
                {t("travelerJourney.kicker")}
              </Typography>
            ) : null}
            <Typography variant={isStrip ? "subtitle2" : "h6"} sx={{ fontWeight: 800 }}>
              {t("travelerJourney.title")}
            </Typography>
            {!isStrip ? (
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
                {t("travelerJourney.subtitle")}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {t("travelerJourney.stripHint")}
              </Typography>
            )}
          </Box>
          {!isStrip ? (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <ToggleButtonGroup
                exclusive
                size="small"
                value={mode}
                onChange={(_, v) => v && setMode(v)}
                sx={{ bgcolor: "rgba(0,0,0,0.2)" }}
              >
                <ToggleButton value="timeline">
                  <TimelineOutlinedIcon sx={{ mr: 0.5, fontSize: 18 }} />
                  {t("travelerJourney.modeTimeline")}
                </ToggleButton>
                <ToggleButton value="constellation">
                  <AutoAwesomeOutlinedIcon sx={{ mr: 0.5, fontSize: 18 }} />
                  {t("travelerJourney.modeConstellation")}
                </ToggleButton>
              </ToggleButtonGroup>
              <Button size="small" variant="outlined" startIcon={<ZoomOutMapOutlinedIcon />} onClick={resetView}>
                {t("travelerJourney.resetView")}
              </Button>
            </Stack>
          ) : null}
        </Box>

        {!isStrip ? (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap flexWrap="wrap">
            <TextField
              size="small"
              label={t("travelerJourney.filterCountry")}
              value={countryQ}
              onChange={(e) => setCountryQ(e.target.value)}
              sx={{ minWidth: 140 }}
            />
            <TextField
              size="small"
              label={t("travelerJourney.filterCategory")}
              value={categoryQ}
              onChange={(e) => setCategoryQ(e.target.value)}
              sx={{ minWidth: 140 }}
            />
            <TextField
              size="small"
              type="date"
              label={t("travelerJourney.filterTimeStart")}
              InputLabelProps={{ shrink: true }}
              value={tStart}
              onChange={(e) => setTStart(e.target.value)}
            />
            <TextField
              size="small"
              type="date"
              label={t("travelerJourney.filterTimeEnd")}
              InputLabelProps={{ shrink: true }}
              value={tEnd}
              onChange={(e) => setTEnd(e.target.value)}
            />
          </Stack>
        ) : null}

        {!isStrip ? (
          <Typography variant="caption" color="text.secondary">
            {t("travelerJourney.statsLine", {
              trips: rawJourney.totalTrips,
              countries: rawJourney.totalCountries,
              cities: rawJourney.totalCities,
            })}
          </Typography>
        ) : null}
      </Stack>

      <Box
        ref={wrapRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        sx={{
          mt: isStrip ? 1 : 2,
          width: "100%",
          height: isStrip ? 152 : Math.max(320, size.h),
          borderRadius: 2,
          position: "relative",
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(var(--wm-space-orange-rgb), 0.12), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(201, 184, 255, 0.14), transparent 45%), rgba(5, 10, 18, 0.55)",
          overflow: "hidden",
          cursor: isStrip ? "default" : isPanning ? "grabbing" : "grab",
        }}
      >
        {showEmpty ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">{t(emptyMessageKey)}</Typography>
          </Box>
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${layoutW} ${layoutH}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block", touchAction: isStrip ? "auto" : "none" }}
          >
            <defs>
              <linearGradient id={`wmJourneyEdge-${svgUid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--space-orange, rgb(var(--wm-space-orange-rgb)))" stopOpacity="0.95" />
                <stop offset="100%" stopColor="var(--deep-purple, var(--wm-deep-purple))" stopOpacity="0.85" />
              </linearGradient>
              <filter id={`wmJourneyGlow-${svgUid}`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g transform={cameraTransform}>
              <g transform={driftTransform}>
              {spineD ? (
                <path
                  ref={pathRef}
                  d={spineD}
                  fill="none"
                  stroke={`url(#wmJourneyEdge-${svgUid})`}
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={0.85}
                  filter={`url(#wmJourneyGlow-${svgUid})`}
                />
              ) : null}
              {filtered.edges.map((e) => {
                const a = positions.get(e.from);
                const b = positions.get(e.to);
                if (!a || !b) {
                  return null;
                }
                if (visibleIds && (!visibleIds.has(e.from) || !visibleIds.has(e.to))) {
                  return null;
                }
                const outOfFocus = focusSet && !focusSet.has(e.from) && !focusSet.has(e.to);
                const dim = outOfFocus ? 0.09 : e.type === "sequence" ? 0.55 : 0.28;
                return (
                  <path
                    key={`${e.from}-${e.to}`}
                    d={edgePath(a, b)}
                    fill="none"
                    stroke={`url(#wmJourneyEdge-${svgUid})`}
                    strokeWidth={e.type === "sequence" ? 1.4 : 0.9}
                    opacity={dim}
                  />
                );
              })}
              {filtered.nodes.map((n) => {
                const p = positions.get(n.id);
                if (!p) {
                  return null;
                }
                if (visibleIds && !visibleIds.has(n.id)) {
                  return null;
                }
                const focusDim = focusSet && !focusSet.has(n.id) ? 0.22 : 1;
                const pulse = !reducedMotion.current && n.milestoneKind && variant === "full";
                const r = p.r * (n.milestoneKind ? 1.08 : 1);
                const fill =
                  n.type === "trip"
                    ? "var(--space-orange, rgb(var(--wm-space-orange-rgb)))"
                    : n.type === "achievement"
                      ? "var(--deep-purple, var(--wm-deep-purple))"
                      : n.type === "city"
                        ? "rgba(33, 220, 195, 0.85)"
                        : "rgba(255, 255, 255, 0.78)";
                return (
                  <g key={n.id} style={{ opacity: focusDim }}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r + (n.milestoneKind ? 3 : 0)}
                      fill={fill}
                      opacity={0.22}
                      filter={`url(#wmJourneyGlow-${svgUid})`}
                      style={
                        pulse
                          ? {
                              animation: "wmJourneyPulse 3.2s ease-in-out infinite",
                            }
                          : undefined
                      }
                    />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill={fill}
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth={1}
                      style={{ cursor: "pointer" }}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onMouseEnter={(ev) => {
                        const rect = (ev.target as SVGCircleElement).getBoundingClientRect();
                        setHover({
                          node: n,
                          anchor: { left: rect.left + rect.width / 2, top: rect.top },
                        });
                      }}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => handleNodeNavigate(n)}
                    />
                  </g>
                );
              })}
              </g>
            </g>
            {!reducedMotion.current ? (
              <style>{`@keyframes wmJourneyPulse { 0%,100%{ transform: scale(1); opacity:.22} 50%{ transform: scale(1.06); opacity:.38} }`}</style>
            ) : null}
          </svg>
        )}
      </Box>

      <Popover
        open={Boolean(hover)}
        anchorReference="anchorPosition"
        anchorPosition={hover ? { top: hover.anchor.top, left: hover.anchor.left } : undefined}
        onClose={() => setHover(null)}
        disableRestoreFocus
        slotProps={{
          paper: {
            sx: {
              px: 1.5,
              py: 1,
              maxWidth: 280,
              pointerEvents: "none",
              bgcolor: "rgba(12,18,28,0.94)",
              border: "1px solid rgba(201, 184, 255, 0.25)",
              backdropFilter: "blur(12px)",
            },
          },
        }}
      >
        {hover ? (
          <Box>
            <Typography variant="subtitle2" fontWeight={800}>
              {hover.node.label}
            </Typography>
            {hover.node.date ? (
              <Typography variant="caption" color="text.secondary">
                {hover.node.date}
              </Typography>
            ) : null}
            {hover.node.subtitle ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {hover.node.subtitle}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("travelerJourney.tooltipDefault")}
              </Typography>
            )}
          </Box>
        ) : null}
      </Popover>
    </GlassPanel>
  );
};
