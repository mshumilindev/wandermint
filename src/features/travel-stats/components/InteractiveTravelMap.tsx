import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Tooltip, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TravelMemory, TravelStats } from "../../../entities/travel-memory/model";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { CountryFlag } from "../../../shared/ui/CountryFlag";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { StyleBadge } from "../../../shared/ui/StyleBadge";
import { projectToWorld, type TravelMapPoint } from "../services/travelMapService";

interface InteractiveTravelMapProps {
  points: TravelMapPoint[];
  stats: TravelStats;
  isResolving: boolean;
  unresolvedCount: number;
}

interface TileDescriptor {
  id: string;
  url: string;
  left: number;
  top: number;
}

interface CountryGroup {
  country: string;
  points: TravelMapPoint[];
  totalVisits: number;
}

interface RegionGroup {
  region: string;
  countries: CountryGroup[];
  totalVisits: number;
}

interface ProjectedMarkerPosition {
  x: number;
  y: number;
}

const worldZoom = 2;
const tileSize = 256;
const worldSize = tileSize * 2 ** worldZoom;

const formatMemoryWindow = (memory: TravelMemory): string => {
  const start = dayjs(memory.startDate);
  const end = dayjs(memory.endDate);

  if (!start.isValid() || !end.isValid()) {
    return memory.datePrecision === "month" ? memory.startDate.slice(0, 7) : memory.startDate;
  }

  if (memory.datePrecision === "month") {
    if (start.isSame(end, "month")) {
      return start.format("MMMM YYYY");
    }

    return `${start.format("MMM YYYY")} - ${end.format("MMM YYYY")}`;
  }

  if (start.isSame(end, "day")) {
    return start.format("D MMM YYYY");
  }

  return `${start.format("D MMM")} - ${end.format("D MMM YYYY")}`;
};

const summarizeStyles = (memories: TravelMemory[]): string[] => {
  const counts = memories.reduce<Record<string, number>>(
    (result, memory) => ({
      ...result,
      [memory.style]: (result[memory.style] ?? 0) + 1,
    }),
    {},
  );

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([style]) => style);
};

const summarizeNotes = (value: string): string | null => {
  const next = value.replace(/\s+/g, " ").trim();
  if (!next) {
    return null;
  }

  return next.length > 140 ? `${next.slice(0, 137).trimEnd()}...` : next;
};

const createTileUrl = (x: number, y: number): string =>
  `https://tile.openstreetmap.org/${worldZoom}/${x}/${y}.png`;

const createWorldTiles = (): TileDescriptor[] => {
  const maxTile = 2 ** worldZoom;
  const tiles: TileDescriptor[] = [];

  for (let tileX = 0; tileX < maxTile; tileX += 1) {
    for (let tileY = 0; tileY < maxTile; tileY += 1) {
      tiles.push({
        id: `${worldZoom}-${tileX}-${tileY}`,
        url: createTileUrl(tileX, tileY),
        left: tileX * tileSize,
        top: tileY * tileSize,
      });
    }
  }

  return tiles;
};

const regionFromCountry = (country: string): string => {
  const normalized = country.trim().toLowerCase();

  if (["portugal", "spain", "andorra"].includes(normalized)) {
    return "Iberia";
  }
  if (["ireland", "united kingdom", "england", "scotland", "wales", "northern ireland"].includes(normalized)) {
    return "British Isles";
  }
  if (["france", "belgium", "netherlands", "luxembourg", "germany", "austria", "switzerland"].includes(normalized)) {
    return "Western Europe";
  }
  if (["poland", "czech republic", "slovakia", "hungary"].includes(normalized)) {
    return "Central Europe";
  }
  if (["italy", "greece", "croatia", "slovenia", "serbia", "romania", "bulgaria"].includes(normalized)) {
    return "Southern & Balkan Europe";
  }
  if (["norway", "sweden", "finland", "iceland", "denmark"].includes(normalized)) {
    return "Scandinavia";
  }
  if (["japan", "south korea", "taiwan"].includes(normalized)) {
    return "East Asia";
  }
  if (["thailand", "vietnam", "malaysia", "indonesia", "singapore", "philippines"].includes(normalized)) {
    return "Southeast Asia";
  }
  if (["united states", "canada", "mexico"].includes(normalized)) {
    return "North America";
  }

  return country || "Other regions";
};

const buildRegionGroups = (points: TravelMapPoint[]): RegionGroup[] => {
  const regionMap = new Map<string, Map<string, TravelMapPoint[]>>();

  points.forEach((point) => {
    const region = regionFromCountry(point.country);
    const countryMap = regionMap.get(region) ?? new Map<string, TravelMapPoint[]>();
    const countryPoints = countryMap.get(point.country) ?? [];
    countryPoints.push(point);
    countryMap.set(point.country, countryPoints);
    regionMap.set(region, countryMap);
  });

  return Array.from(regionMap.entries())
    .map(([region, countries]): RegionGroup => ({
      region,
      countries: Array.from(countries.entries())
        .map(([country, groupedPoints]) => ({
          country,
          points: [...groupedPoints].sort(
            (left, right) => right.visitCount - left.visitCount || left.label.localeCompare(right.label),
          ),
          totalVisits: groupedPoints.reduce((sum, point) => sum + point.visitCount, 0),
        }))
        .sort((left, right) => right.totalVisits - left.totalVisits || left.country.localeCompare(right.country)),
      totalVisits: Array.from(countries.values()).flat().reduce((sum, point) => sum + point.visitCount, 0),
    }))
    .sort((left, right) => right.totalVisits - left.totalVisits || left.region.localeCompare(right.region));
};

const getMarkerPosition = (
  point: TravelMapPoint,
  mapScale: number,
  mapOffsetX: number,
  mapOffsetY: number,
): ProjectedMarkerPosition => {
  const projected = projectToWorld(point.latitude, point.longitude, worldZoom);
  return {
    x: mapOffsetX + projected.x * mapScale,
    y: mapOffsetY + projected.y * mapScale,
  };
};

const getMarkerSize = (visitCount: number): number => Math.min(22, 11 + visitCount * 2);

const getEarliestVisitDate = (point: TravelMapPoint): string =>
  [...point.memories]
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0]?.startDate ?? "";

const getLatestVisitDate = (point: TravelMapPoint): string =>
  [...point.memories]
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0]?.startDate ?? "";

const createRoutePath = (
  points: TravelMapPoint[],
  mapScale: number,
  mapOffsetX: number,
  mapOffsetY: number,
): string | null => {
  if (points.length < 2) {
    return null;
  }

  const ordered = [...points].sort((left, right) => getEarliestVisitDate(left).localeCompare(getEarliestVisitDate(right)));
  const commands = ordered.map((point, index) => {
    const position = getMarkerPosition(point, mapScale, mapOffsetX, mapOffsetY);
    return `${index === 0 ? "M" : "L"} ${position.x.toFixed(2)} ${position.y.toFixed(2)}`;
  });

  return commands.join(" ");
};

const createReminiscingMemory = (points: TravelMapPoint[]): TravelMemory | null => {
  const allMemories = points.flatMap((point) => point.memories);
  if (allMemories.length === 0) {
    return null;
  }

  return [...allMemories].sort((left, right) => left.startDate.localeCompare(right.startDate))[0] ?? null;
};

const HoverPlaceCard = ({
  point,
  t,
}: {
  point: TravelMapPoint;
  t: ReturnType<typeof useTranslation>["t"];
}): JSX.Element => {
  const recentMemories = [...point.memories]
    .sort((left, right) => right.startDate.localeCompare(left.startDate))
    .slice(0, 2);

  return (
    <GlassPanel
      sx={{
        position: "absolute",
        top: 16,
        right: 16,
        width: 280,
        p: 1.5,
        display: { xs: "none", lg: "grid" },
        gap: 1,
        pointerEvents: "none",
      }}
    >
      <Typography variant="overline" color="primary.main">
        {t("travelStats.hoveredPlace")}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
        <CountryFlag country={point.country} size="1rem" />
        <Typography variant="subtitle1">{point.label}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t("travelStats.visitCount", { count: point.visitCount })}
      </Typography>
      {recentMemories.map((memory) => (
        <Box
          key={memory.id}
          sx={{
            p: 1,
            borderRadius: 2,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(183, 237, 226, 0.08)",
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {formatMemoryWindow(memory)}
          </Typography>
          {summarizeNotes(memory.notes) ? (
            <Typography variant="caption" color="text.secondary">
              {summarizeNotes(memory.notes)}
            </Typography>
          ) : null}
        </Box>
      ))}
    </GlassPanel>
  );
};

export const InteractiveTravelMap = ({
  points,
  stats,
  isResolving,
  unresolvedCount,
}: InteractiveTravelMapProps): JSX.Element => {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1200, height: 675 });
  const [selectedPointId, setSelectedPointId] = useState<string | null>(points[0]?.id ?? null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [expandedRegions, setExpandedRegions] = useState<string[]>([]);
  const [expandedCountries, setExpandedCountries] = useState<string[]>([]);
  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);
  const tiles = useMemo(createWorldTiles, []);
  const regionGroups = useMemo(() => buildRegionGroups(points), [points]);
  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedPointId) ?? null,
    [points, selectedPointId],
  );
  const hoveredPoint = useMemo(
    () => points.find((point) => point.id === hoveredPointId) ?? null,
    [hoveredPointId, points],
  );
  const overlayStats = useMemo(
    () => [
      { label: t("travelStats.visitedCountries"), value: stats.visitedCountries },
      { label: t("travelStats.visitedCities"), value: stats.visitedCities },
      { label: t("travelStats.trips"), value: stats.tripsRecorded },
      { label: t("travelStats.travelDays"), value: stats.travelDays },
      { label: t("travelStats.repeatVisits"), value: stats.repeatVisits },
    ],
    [stats, t],
  );
  const reminiscingMemory = useMemo(() => createReminiscingMemory(points), [points]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setViewport({
        width: Math.max(entry.contentRect.width, 320),
        height: Math.max(entry.contentRect.height, 320),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedPointId((current) =>
      points.some((point) => point.id === current) ? current : points[0]?.id ?? null,
    );
  }, [points]);

  useEffect(() => {
    if (!focusedPointId) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFocusedPointId(null);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [focusedPointId]);

  const mapScale = Math.min(viewport.width / worldSize, viewport.height / worldSize);
  const renderedWorldWidth = worldSize * mapScale;
  const renderedWorldHeight = worldSize * mapScale;
  const mapOffsetX = (viewport.width - renderedWorldWidth) / 2;
  const mapOffsetY = (viewport.height - renderedWorldHeight) / 2;
  const routePath = useMemo(
    () => createRoutePath(points, mapScale, mapOffsetX, mapOffsetY),
    [mapOffsetX, mapOffsetY, mapScale, points],
  );
  const selectedMarkerPosition = selectedPoint
    ? getMarkerPosition(selectedPoint, mapScale, mapOffsetX, mapOffsetY)
    : null;
  const selectedMemories = selectedPoint
    ? [...selectedPoint.memories].sort((left, right) => right.startDate.localeCompare(left.startDate))
    : [];
  const topVisitCount = points[0]?.visitCount ?? 1;

  return (
    <GlassPanel
      elevated
      sx={{
        p: { xs: 1.25, md: 2 },
        display: "grid",
        gap: 2,
        background:
          "radial-gradient(circle at 72% 16%, rgba(48, 184, 160, 0.16), transparent 24%), radial-gradient(circle at 22% 84%, rgba(196, 95, 122, 0.14), transparent 22%), linear-gradient(180deg, rgba(6, 14, 20, 0.74), rgba(6, 10, 14, 0.82))",
      }}
    >
      <Box
        ref={viewportRef}
        role="img"
        aria-label={t("travelStats.mapLabel")}
        sx={{
          position: "relative",
          width: "100%",
          height: "clamp(420px, 52vw, 760px)",
          minHeight: 420,
          maxHeight: "760px",
          borderRadius: 3,
          overflow: "hidden",
          border: "1px solid rgba(183, 237, 226, 0.18)",
          background: "linear-gradient(180deg, rgba(2, 8, 12, 0.94), rgba(3, 8, 13, 0.98))",
          boxShadow: "inset 0 0 120px rgba(0,0,0,0.42), 0 28px 88px rgba(0, 0, 0, 0.34)",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 50%, transparent 44%, rgba(2, 8, 12, 0.48) 100%)",
            pointerEvents: "none",
            zIndex: 1,
          },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              left: 0,
              top: 0,
              width: renderedWorldWidth,
              height: renderedWorldHeight,
              transform: `translate(${mapOffsetX}px, ${mapOffsetY}px)`,
            }}
          >
            {tiles.map((tile) => (
              <Box
                key={tile.id}
                component="img"
                src={tile.url}
                alt=""
                draggable={false}
                sx={{
                  position: "absolute",
                  width: tileSize * mapScale,
                  height: tileSize * mapScale,
                  left: tile.left * mapScale,
                  top: tile.top * mapScale,
                  filter:
                    "invert(1) hue-rotate(145deg) saturate(0.9) brightness(0.72) contrast(1.12)",
                  opacity: 0.82,
                  transition: "opacity 220ms ease, filter 220ms ease",
                }}
              />
            ))}
          </Box>
        </Box>

        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            background:
              "radial-gradient(circle at 68% 20%, rgba(59, 213, 185, 0.18), transparent 26%), radial-gradient(circle at 18% 76%, rgba(153, 45, 83, 0.12), transparent 28%), linear-gradient(180deg, rgba(6,10,17,0.06), rgba(4,8,14,0.22))",
            mixBlendMode: "screen",
            animation: "wmMapGlow 16s ease-in-out infinite alternate",
            "@keyframes wmMapGlow": {
              "0%": { opacity: 0.84 },
              "100%": { opacity: 1 },
            },
          }}
        />

        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            backgroundImage:
              "linear-gradient(rgba(190, 231, 224, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(190, 231, 224, 0.04) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            opacity: 0.65,
          }}
        />

        {selectedMarkerPosition ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 1,
              background: `radial-gradient(circle at ${selectedMarkerPosition.x}px ${selectedMarkerPosition.y}px, rgba(245, 138, 44, 0.22), rgba(245, 138, 44, 0.08) 12%, transparent 28%)`,
              transition: "background 260ms ease",
            }}
          />
        ) : null}

        {routePath ? (
          <Box
            component="svg"
            viewBox={`0 0 ${viewport.width} ${viewport.height}`}
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            <path
              d={routePath}
              fill="none"
              stroke="rgba(245, 138, 44, 0.18)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="blur(6px)"
            />
            <path
              d={routePath}
              fill="none"
              stroke="rgba(245, 138, 44, 0.45)"
              strokeWidth="1.6"
              strokeDasharray="8 10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Box>
        ) : null}

        {points.map((point) => {
          const position = getMarkerPosition(point, mapScale, mapOffsetX, mapOffsetY);
          const markerSize = getMarkerSize(point.visitCount);
          const isSelected = selectedPointId === point.id;
          const isHovered = hoveredPointId === point.id;
          const isFocused = focusedPointId === point.id;
          const transformScale = isSelected ? 1.12 : isHovered || isFocused ? 1.08 : 1;
          const markerColor = isSelected ? "#F58A2C" : "#7D1836";

          return (
            <Tooltip
              key={point.id}
              title={`${point.label} · ${t("travelStats.visitCount", { count: point.visitCount })}`}
              placement="top"
              enterDelay={90}
            >
              <Box
                component="button"
                type="button"
                aria-label={`${point.city}, ${point.country}, ${t("travelStats.visitCount", { count: point.visitCount })}`}
                onClick={() => {
                  setSelectedPointId(point.id);
                  setFocusedPointId(point.id);
                }}
                onMouseEnter={() => setHoveredPointId(point.id)}
                onMouseLeave={() => setHoveredPointId((current) => (current === point.id ? null : current))}
                onFocus={() => setHoveredPointId(point.id)}
                onBlur={() => setHoveredPointId((current) => (current === point.id ? null : current))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPointId(point.id);
                    setFocusedPointId(point.id);
                  }
                }}
                sx={{
                  position: "absolute",
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  width: markerSize,
                  height: markerSize,
                  transform: `translate(-50%, -50%) scale(${transformScale})`,
                  transition: "transform 180ms ease, filter 180ms ease",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  zIndex: isSelected ? 5 : 4,
                  outline: "none",
                  "&:focus-visible": {
                    boxShadow: "0 0 0 3px rgba(245, 138, 44, 0.36)",
                    borderRadius: "999px",
                  },
                }}
              >
                <Box
                  className="travel-map-marker__pulse"
                  sx={{
                    position: "absolute",
                    inset: "-7px",
                    borderRadius: "50%",
                    border: `1px solid ${isSelected ? "rgba(245, 138, 44, 0.45)" : "rgba(125, 24, 54, 0.3)"}`,
                    background: `radial-gradient(circle, ${isSelected ? "rgba(245, 138, 44, 0.18)" : "rgba(125, 24, 54, 0.14)"} 0%, transparent 70%)`,
                    animation: isSelected || isHovered ? "wmTravelMapPulse 2.2s ease-out infinite" : "none",
                    "@keyframes wmTravelMapPulse": {
                      "0%": { opacity: 0.9, transform: "scale(0.92)" },
                      "100%": { opacity: 0, transform: "scale(1.48)" },
                    },
                  }}
                />
                <Box
                  className="travel-map-marker__halo"
                  sx={{
                    position: "absolute",
                    inset: "-3px",
                    borderRadius: "50%",
                    background: markerColor,
                    opacity: isSelected ? 0.22 : 0.14,
                    filter: "blur(6px)",
                  }}
                />
                <Box
                  className="travel-map-marker__dot"
                  sx={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: `1px solid ${isSelected ? "rgba(255, 238, 214, 0.84)" : "rgba(255, 214, 214, 0.65)"}`,
                    background: markerColor,
                    boxShadow: isHovered || isFocused || isSelected
                      ? `0 0 0 4px ${isSelected ? "rgba(245, 138, 44, 0.12)" : "rgba(125, 24, 54, 0.12)"}, 0 0 18px ${isSelected ? "rgba(245, 138, 44, 0.34)" : "rgba(125, 24, 54, 0.34)"}`
                      : `0 0 12px ${isSelected ? "rgba(245, 138, 44, 0.26)" : "rgba(125, 24, 54, 0.2)"}`,
                  }}
                />
                {point.visitCount > 1 ? (
                  <Box
                    sx={{
                      position: "absolute",
                      top: "-7px",
                      right: "-7px",
                      minWidth: 16,
                      height: 16,
                      px: 0.4,
                      borderRadius: "999px",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "rgba(255, 247, 240, 0.92)",
                      background: isSelected ? "#D96A19" : "#5B1027",
                      border: "1px solid rgba(255,255,255,0.18)",
                    }}
                  >
                    {point.visitCount}
                  </Box>
                ) : null}
              </Box>
            </Tooltip>
          );
        })}

        <Box
          sx={{
            position: "absolute",
            top: 16,
            left: 16,
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            maxWidth: "calc(100% - 32px)",
            zIndex: 3,
          }}
        >
          {overlayStats.map((item) => (
            <Chip
              key={item.label}
              label={`${item.label}: ${item.value}`}
              size="small"
              sx={{
                color: "text.primary",
                background: "rgba(4, 16, 24, 0.76)",
                border: "1px solid rgba(183, 237, 226, 0.14)",
                backdropFilter: "blur(12px)",
              }}
            />
          ))}
          {isResolving ? (
            <Chip label={t("travelStats.resolvingMap")} size="small" color="primary" />
          ) : unresolvedCount > 0 ? (
            <Chip
              label={t("travelStats.unresolvedMapCount", { count: unresolvedCount })}
              size="small"
              color="warning"
            />
          ) : null}
        </Box>

        {hoveredPoint ? <HoverPlaceCard point={hoveredPoint} t={t} /> : null}

        {reminiscingMemory ? (
          <GlassPanel
            elevated
            sx={{
              position: "absolute",
              left: 16,
              bottom: 16,
              width: { xs: "calc(100% - 32px)", lg: 360 },
              p: 1.5,
              zIndex: 3,
              display: "grid",
              gap: 1.25,
            }}
          >
            <EntityPreviewImage
              title={reminiscingMemory.city}
              locationHint={reminiscingMemory.country}
              categoryHint="city"
              alt={`${reminiscingMemory.city}, ${reminiscingMemory.country}`}
              compact
              height={110}
            />
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "start" }}>
              <Box sx={{ display: "grid", gap: 0.35 }}>
                <Typography variant="overline" color="primary.main">
                  {t("travelStats.reminiscing")}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                  <CountryFlag country={reminiscingMemory.country} size="1.05rem" />
                  <Typography variant="h6" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{`${reminiscingMemory.city}, ${reminiscingMemory.country}`}</Typography>
                </Box>
              </Box>
              <Chip
                size="small"
                label={t("travelStats.timeToVisitAgain")}
                sx={{ background: "rgba(245, 138, 44, 0.14)", color: "text.primary" }}
              />
            </Box>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
              {summarizeStyles(points.flatMap((point) => point.memories).filter((memory) => memory.city === reminiscingMemory.city && memory.country === reminiscingMemory.country)).map((style) => (
                <StyleBadge key={style} style={style} />
              ))}
            </Box>
            {summarizeNotes(reminiscingMemory.notes) ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <RouteRoundedIcon sx={{ fontSize: 18, color: "primary.main" }} />
                <Typography variant="body2" color="text.secondary">
                  {formatMemoryWindow(reminiscingMemory)}
                </Typography>
              </Box>
            ) : null}
            {summarizeNotes(reminiscingMemory.notes) ? (
              <Typography variant="body2" color="text.secondary">
                {summarizeNotes(reminiscingMemory.notes)}
              </Typography>
            ) : null}
          </GlassPanel>
        ) : null}

        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            right: 16,
            bottom: 10,
            color: "rgba(232, 244, 241, 0.54)",
            textShadow: "0 1px 8px rgba(0,0,0,0.7)",
            zIndex: 3,
          }}
        >
          © OpenStreetMap contributors
        </Typography>
      </Box>

      {selectedPoint ? (
        <GlassPanel
          sx={{
            p: 1.25,
            display: "grid",
            gap: 0.8,
            border: "1px solid rgba(245, 138, 44, 0.26)",
            background: "rgba(245, 138, 44, 0.07)",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
              <CountryFlag country={selectedPoint.country} size="1rem" />
              <Typography variant="subtitle2">{selectedPoint.label}</Typography>
            </Box>
            <Chip
              size="small"
              label={selectedPoint.visitCount}
              sx={{
                fontWeight: 700,
                background: topVisitCount > 1 && selectedPoint.visitCount / topVisitCount >= 0.8
                  ? "rgba(245, 138, 44, 0.24)"
                  : "rgba(183, 237, 226, 0.16)",
              }}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap" }}>
            {summarizeStyles(selectedMemories).map((style) => <StyleBadge key={style} style={style} />)}
          </Box>
        </GlassPanel>
      ) : null}

      <GlassPanel sx={{ p: 1.25, display: "grid", gap: 1, maxHeight: 520 }}>
        <Typography variant="overline" color="primary.main">
          {t("travelStats.mapAtlas")}
        </Typography>
        <Box sx={{ overflowY: "auto", pr: 0.5, display: "grid", gap: 1 }}>
          {regionGroups.map((region) => {
            const regionExpanded = expandedRegions.includes(region.region);
            return (
              <Accordion
                key={region.region}
                expanded={regionExpanded}
                onChange={(_event, expanded) => {
                  setExpandedRegions((current) =>
                    expanded
                      ? [...new Set([...current, region.region])]
                      : current.filter((item) => item !== region.region),
                  );
                }}
                disableGutters
                elevation={0}
                sx={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(183, 237, 226, 0.1)",
                  borderRadius: "16px !important",
                  "&::before": { display: "none" },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: "text.secondary" }} />}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", pr: 1 }}>
                    <Typography variant="subtitle2">{region.region}</Typography>
                    <Chip size="small" label={region.totalVisits} />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ display: "grid", gap: 1 }}>
                  {region.countries.map((country) => {
                    const countryKey = `${region.region}::${country.country}`;
                    const countryExpanded = expandedCountries.includes(countryKey);
                    return (
                      <Accordion
                        key={countryKey}
                        expanded={countryExpanded}
                        onChange={(_event, expanded) => {
                          setExpandedCountries((current) =>
                            expanded
                              ? [...new Set([...current, countryKey])]
                              : current.filter((item) => item !== countryKey),
                          );
                        }}
                        disableGutters
                        elevation={0}
                        sx={{
                          background: "rgba(4, 14, 20, 0.56)",
                          border: "1px solid rgba(183, 237, 226, 0.08)",
                          borderRadius: "14px !important",
                          "&::before": { display: "none" },
                        }}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: "text.secondary" }} />}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", pr: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                              <CountryFlag country={country.country} size="1rem" />
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {country.country}
                              </Typography>
                            </Box>
                            <Chip size="small" label={country.totalVisits} />
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ display: "grid", gap: 0.75 }}>
                          {country.points.map((point) => {
                            const isSelected = point.id === selectedPointId;
                            const orderedMemories = [...point.memories].sort(
                              (left, right) => right.startDate.localeCompare(left.startDate),
                            );
                            return (
                              <GlassPanel
                                key={point.id}
                                sx={{
                                  display: "grid",
                                  gap: 0.8,
                                  px: 1.1,
                                  py: 1.05,
                                  borderRadius: 2,
                                  border: isSelected
                                    ? "1px solid rgba(245, 138, 44, 0.28)"
                                    : "1px solid rgba(183, 237, 226, 0.1)",
                                  background: isSelected
                                    ? "rgba(245, 138, 44, 0.08)"
                                    : "rgba(255,255,255,0.02)",
                                }}
                              >
                                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "baseline" }}>
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                                    <PlaceOutlinedIcon sx={{ fontSize: 16, color: isSelected ? "#F58A2C" : "#7D1836" }} />
                                    <Typography variant="subtitle2">{point.city}</Typography>
                                  </Box>
                                  <Typography variant="caption" color="primary.main">
                                    {point.visitCount}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: "grid", gap: 0.6 }}>
                                  {orderedMemories.map((memory) => (
                                    <Box
                                      key={memory.id}
                                      component="button"
                                      type="button"
                                      onClick={() => {
                                        setSelectedPointId(point.id);
                                        setFocusedPointId(point.id);
                                      }}
                                      onMouseEnter={() => setHoveredPointId(point.id)}
                                      onMouseLeave={() =>
                                        setHoveredPointId((current) => (current === point.id ? null : current))
                                      }
                                      sx={{
                                        display: "grid",
                                        gap: 0.15,
                                        width: "100%",
                                        textAlign: "left",
                                        px: 1,
                                        py: 0.9,
                                        borderRadius: 1.75,
                                        border: "1px solid rgba(183, 237, 226, 0.08)",
                                        background: "rgba(255,255,255,0.02)",
                                        color: "inherit",
                                        cursor: "pointer",
                                        transition: "background 160ms ease, border-color 160ms ease",
                                        "&:hover": {
                                          background: "rgba(125, 24, 54, 0.12)",
                                          borderColor: "rgba(125, 24, 54, 0.26)",
                                        },
                                      }}
                                    >
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {formatMemoryWindow(memory)}
                                      </Typography>
                                      {summarizeNotes(memory.notes) ? (
                                        <Typography variant="caption" color="text.secondary">
                                          {summarizeNotes(memory.notes)}
                                        </Typography>
                                      ) : null}
                                    </Box>
                                  ))}
                                </Box>
                              </GlassPanel>
                            );
                          })}
                        </AccordionDetails>
                      </Accordion>
                    );
                  })}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      </GlassPanel>
    </GlassPanel>
  );
};
