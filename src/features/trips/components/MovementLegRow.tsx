import DirectionsWalkRoundedIcon from "@mui/icons-material/DirectionsWalkRounded";
import LocalTaxiRoundedIcon from "@mui/icons-material/LocalTaxiRounded";
import TramRoundedIcon from "@mui/icons-material/TramRounded";
import { Box, Typography } from "@mui/material";
import type { MovementLeg, MovementMode } from "../../../entities/activity/model";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { formatCostRangeLabel } from "../../../shared/lib/priceDisplay";
import { useTranslation } from "react-i18next";

interface MovementLegRowProps {
  leg: MovementLeg;
}

const iconForMode = (mode: MovementMode): JSX.Element => {
  if (mode === "walking") {
    return <DirectionsWalkRoundedIcon fontSize="small" />;
  }
  if (mode === "public_transport") {
    return <TramRoundedIcon fontSize="small" />;
  }
  return <LocalTaxiRoundedIcon fontSize="small" />;
};

export const MovementLegRow = ({ leg }: MovementLegRowProps): JSX.Element => {
  const { t } = useTranslation();
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const renderOptionLine = (
    mode: MovementMode,
    durationMinutes: number,
    costText: string,
    isPrimary = false,
    estimateConfidence?: "high" | "medium" | "low",
  ): string => {
    const approx = estimateConfidence === "low" ? ` (${t("trips.movement.approxTravel")})` : "";
    if (mode === "walking") {
      return `${isPrimary ? "Walk about" : "Walk"} ${durationMinutes} min${approx}${costText}`;
    }
    if (mode === "public_transport") {
      return `${isPrimary ? "Transit about" : "Transit"} ${durationMinutes} min${approx}${costText}`;
    }
    return `${isPrimary ? "Taxi about" : "Taxi"} ${durationMinutes} min${approx}${costText}`;
  };

  const primaryCostText = leg.primary.estimatedCost
    && leg.primary.estimatedCost.max > 0
    ? ` · ${formatCostRangeLabel(leg.primary.estimatedCost, {
        preferredCurrency: preferences?.currency,
        locale: preferences?.locale,
      })}`
    : "";
  const alternatives = leg.alternatives.slice(0, 2);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1.5,
        py: 1,
        ml: { xs: 0, md: 1 },
        borderLeft: "1px solid rgba(183, 237, 226, 0.14)",
        color: "text.secondary",
      }}
    >
      <Box sx={{ color: "primary.main", display: "grid", gap: 0.9, alignItems: "start", pt: 0.2 }}>
        <Box sx={{ display: "flex", alignItems: "center" }}>{iconForMode(leg.primary.mode)}</Box>
        {alternatives.map((option) => (
          <Box key={`${leg.id}-${option.mode}`} sx={{ display: "flex", alignItems: "center", color: "text.secondary" }}>
            {iconForMode(option.mode)}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: "grid", gap: 0.8 }}>
        <Typography
          variant="body2"
          color={leg.primary.estimateConfidence === "low" ? "warning.light" : "text.secondary"}
          sx={leg.primary.estimateConfidence === "low" ? { fontStyle: "italic" } : undefined}
        >
          {renderOptionLine(leg.primary.mode, leg.primary.durationMinutes, primaryCostText, true, leg.primary.estimateConfidence)}
        </Typography>
        {alternatives.map((option) => {
          const costText = option.estimatedCost
            && option.estimatedCost.max > 0
            ? ` · ${formatCostRangeLabel(option.estimatedCost, {
                preferredCurrency: preferences?.currency,
                locale: preferences?.locale,
              })}`
            : "";
          return (
            <Typography
              key={option.mode}
              variant="caption"
              color={option.estimateConfidence === "low" ? "warning.light" : "text.secondary"}
              sx={option.estimateConfidence === "low" ? { fontStyle: "italic" } : undefined}
            >
              {renderOptionLine(option.mode, option.durationMinutes, costText, false, option.estimateConfidence)}
            </Typography>
          );
        })}
      </Box>
    </Box>
  );
};
