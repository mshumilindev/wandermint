import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { LocalScenario } from "../../../entities/local-scenario/model";
import { formatCostRangeLabel } from "../../../shared/lib/priceDisplay";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { sanitizeUserFacingLine } from "../../../shared/lib/userFacingText";
import WbTwilightOutlinedIcon from "@mui/icons-material/WbTwilightOutlined";

interface ScenarioSummaryCardProps {
  scenario: LocalScenario;
  saveLabel: string;
  onSave?: () => void;
}

export const ScenarioSummaryCard = ({ scenario, saveLabel, onSave }: ScenarioSummaryCardProps): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const cleanTheme = sanitizeUserFacingLine(scenario.theme);
  const heroPlace = scenario.blocks.find((block) => block.place)?.place;
  const scenarioCostLabel = formatCostRangeLabel(scenario.estimatedCostRange, {
    preferredCurrency: preferences?.currency,
    locale: preferences?.locale,
  });

  return (
    <GlassPanel elevated sx={{ p: 2, display: "grid", gap: 1.5, height: "100%" }}>
      <EntityPreviewImage
        entityId={`scenario:${scenario.id}`}
        variant="scenarioCard"
        title={heroPlace?.name ?? cleanTheme}
        locationHint={scenario.locationLabel}
        categoryHint={scenario.blocks[0]?.category}
        latitude={heroPlace?.latitude}
        longitude={heroPlace?.longitude}
        alt={`${cleanTheme} · ${scenario.locationLabel}`}
      />
      <Box sx={{ display: "grid", gap: 0.5 }}>
        <Typography variant="h6" sx={{ lineHeight: 1.25 }}>
          {cleanTheme}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap title={scenario.locationLabel}>
          {scenario.locationLabel}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
        <MetadataPill icon={<WbTwilightOutlinedIcon />} label={t("local.durationLabel", { count: scenario.estimatedDurationMinutes })} tone="amber" />
        <MetadataPill label={t(`local.weatherFit.${scenario.weatherFit}`)} tone="teal" />
        <MetadataPill label={scenarioCostLabel} />
        <MetadataPill label={t("local.blocksLabel", { count: scenario.blocks.length })} />
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Button
          variant="contained"
          endIcon={<ChevronRightRoundedIcon />}
          sx={{ textTransform: "none" }}
          onClick={() => void navigate({ to: "/local/scenario/$scenarioId", params: { scenarioId: scenario.id } })}
        >
          {t("local.openDetails")}
        </Button>
        {onSave ? (
          <Button variant="outlined" onClick={onSave}>
            {saveLabel}
          </Button>
        ) : null}
      </Box>
    </GlassPanel>
  );
};
