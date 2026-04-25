import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import TrainOutlinedIcon from "@mui/icons-material/TrainOutlined";
import FlightTakeoffOutlinedIcon from "@mui/icons-material/FlightTakeoffOutlined";
import DirectionsBusOutlinedIcon from "@mui/icons-material/DirectionsBusOutlined";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { IntercityMove, TripSegment } from "../../../entities/trip/model";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { formatEstimatedCostLabel } from "../../../shared/lib/priceDisplay";
import { CountryFlag } from "../../../shared/ui/CountryFlag";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";

interface IntercityMovesPanelProps {
  moves: IntercityMove[];
  segments: TripSegment[];
  hideCosts?: boolean;
  /** Hide free-text source lines (shared view without documents). */
  hideDocumentHints?: boolean;
}

const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}m`;
  }
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
};

const transportIcon = (type: IntercityMove["transportCandidates"][number]["type"]): JSX.Element => {
  if (type === "flight") {
    return <FlightTakeoffOutlinedIcon />;
  }
  if (type === "bus") {
    return <DirectionsBusOutlinedIcon />;
  }
  if (type === "ferry") {
    return <DirectionsBoatOutlinedIcon />;
  }
  return <TrainOutlinedIcon />;
};

const formatCost = (
  move: IntercityMove["transportCandidates"][number]["estimatedCost"],
  preferredCurrency?: string | null,
  locale?: string | null,
): string | null => {
  if (!move) {
    return null;
  }

  return formatEstimatedCostLabel(move, { preferredCurrency, locale });
};

export const IntercityMovesPanel = ({ moves, segments, hideCosts = false, hideDocumentHints = false }: IntercityMovesPanelProps): JSX.Element | null => {
  const { t } = useTranslation();
  const preferences = useUserPreferencesStore((state) => state.preferences);
  if (moves.length === 0) {
    return null;
  }

  const segmentById = Object.fromEntries(segments.map((segment) => [segment.id, segment]));

  return (
    <GlassPanel sx={{ p: 2.5, display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <RouteOutlinedIcon color="primary" />
        <Typography variant="h6">{t("trips.intercityMoves")}</Typography>
      </Box>
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {moves.map((move) => {
          const candidate = move.transportCandidates[0];
          const from = segmentById[move.fromSegmentId];
          const to = segmentById[move.toSegmentId];
          if (!candidate || !from || !to) {
            return null;
          }

          const totalMinutes = candidate.estimatedDurationMinutes + candidate.stationOrAirportTransferMinutes + candidate.bufferMinutes;
          const costLabel = formatCost(candidate.estimatedCost, preferences?.currency, preferences?.locale);
          const fromLabel = `${from.city}${from.country ? `, ${from.country}` : ""}`;
          const toLabel = `${to.city}${to.country ? `, ${to.country}` : ""}`;

          return (
            <GlassPanel key={move.id} sx={{ p: 2, display: "grid", gap: 1, background: "rgba(3, 15, 23, 0.34)" }}>
              <Typography variant="subtitle1" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}>
                  <CountryFlag country={from.country} size="1rem" />
                  <Box component="span">{fromLabel}</Box>
                </Box>
                <Box component="span" sx={{ color: "text.secondary" }}>→</Box>
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}>
                  <CountryFlag country={to.country} size="1rem" />
                  <Box component="span">{toLabel}</Box>
                </Box>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("trips.intercityMoveSummary", {
                  type: t(`transport.type.${candidate.type}`),
                  duration: formatMinutes(totalMinutes),
                  transfer: formatMinutes(candidate.stationOrAirportTransferMinutes),
                  buffer: formatMinutes(candidate.bufferMinutes),
                })}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <MetadataPill icon={transportIcon(candidate.type)} label={t(`transport.type.${candidate.type}`)} tone="teal" />
                <MetadataPill label={t("transport.totalWindow", { duration: formatMinutes(totalMinutes) })} />
                <MetadataPill label={t("transport.buffer", { duration: formatMinutes(candidate.bufferMinutes) })} />
                {!hideCosts && costLabel ? <MetadataPill label={costLabel} tone="amber" /> : null}
                <MetadataPill label={t(`transport.feasibility.${candidate.feasibility}`)} tone={candidate.feasibility === "easy" || candidate.feasibility === "possible" ? "teal" : "amber"} />
              </Box>
              {!hideDocumentHints && candidate.sourceSnapshot ? (
                <Typography variant="caption" color="text.secondary">
                  {candidate.sourceSnapshot}
                </Typography>
              ) : null}
            </GlassPanel>
          );
        })}
      </Box>
    </GlassPanel>
  );
};
