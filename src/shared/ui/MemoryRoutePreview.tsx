import { Box, Typography } from "@mui/material";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { TravelMemory } from "../../entities/travel-memory/model";

interface MemoryRoutePreviewProps {
  memories: TravelMemory[];
}

const toNumber = (value: number | undefined): number | null =>
  value === undefined || Number.isNaN(value) ? null : value;

const toCoordinateBucket = (lat: number, lon: number): string => `${lat.toFixed(4)}:${lon.toFixed(4)}`;

export const MemoryRoutePreview = ({ memories }: MemoryRoutePreviewProps): JSX.Element | null => {
  const { t } = useTranslation();
  const gradientId = useId().replace(/:/g, "");
  const withCoords = memories
    .map((memory) => ({
      memory,
      lat: toNumber(memory.latitude),
      lon: toNumber(memory.longitude),
    }))
    .filter((item): item is { memory: TravelMemory; lat: number; lon: number } => item.lat !== null && item.lon !== null)
    .sort(
      (left, right) =>
        left.memory.startDate.localeCompare(right.memory.startDate) ||
        left.memory.endDate.localeCompare(right.memory.endDate) ||
        left.memory.id.localeCompare(right.memory.id),
    );

  if (withCoords.length < 2) {
    return null;
  }

  const distinctCoordinateCount = new Set(withCoords.map((item) => toCoordinateBucket(item.lat, item.lon))).size;
  if (distinctCoordinateCount < 2) {
    return null;
  }

  const lats = withCoords.map((item) => item.lat);
  const lons = withCoords.map((item) => item.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lonSpan = Math.max(maxLon - minLon, 0.0001);
  const w = 280;
  const h = 140;
  const pad = 14;

  const project = (lat: number, lon: number): { x: number; y: number } => ({
    x: pad + ((lon - minLon) / lonSpan) * (w - pad * 2),
    y: pad + (1 - (lat - minLat) / latSpan) * (h - pad * 2),
  });

  const pointsAttr = withCoords
    .map((item) => {
      const { x, y } = project(item.lat, item.lon);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {t("travelStats.routePreviewCaption")}
      </Typography>
      <Box
        component="svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("travelStats.routePreviewAria")}
        sx={{
          width: "100%",
          maxWidth: w,
          height: h,
          borderRadius: 2,
          border: "1px solid rgba(183, 237, 226, 0.14)",
          background: "rgba(4, 14, 20, 0.45)",
        }}
      >
        <defs>
          <linearGradient id={`wmRouteStroke-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(245, 138, 44, 0.35)" />
            <stop offset="100%" stopColor="rgba(33, 220, 195, 0.45)" />
          </linearGradient>
        </defs>
        <polyline
          points={pointsAttr}
          fill="none"
          stroke={`url(#wmRouteStroke-${gradientId})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="6 8"
        />
        {withCoords.map((item, index) => {
          const { x, y } = project(item.lat, item.lon);
          return (
            <circle key={item.memory.id} cx={x} cy={y} r={index === 0 || index === withCoords.length - 1 ? 5 : 4} fill={index === 0 ? "#F58A2C" : index === withCoords.length - 1 ? "#21dcc3" : "rgba(255,255,255,0.85)"} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
          );
        })}
      </Box>
    </Box>
  );
};
