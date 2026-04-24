import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import WbTwilightOutlinedIcon from "@mui/icons-material/WbTwilightOutlined";
import { Box, Button, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { LocalScenario } from "../../../entities/local-scenario/model";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { formatCostRangeLabel } from "../../../shared/lib/priceDisplay";
import { sanitizeOptionalUserFacingDescription, sanitizeUserFacingLine } from "../../../shared/lib/userFacingText";
import { ActivityBlockCard } from "../../trips/components/ActivityBlockCard";
import { MovementLegRow } from "../../trips/components/MovementLegRow";

interface ScenarioCardProps {
  scenario: LocalScenario;
  saveLabel: string;
  doneLabel: string;
  skippedLabel: string;
  onSave?: () => void;
}

export const ScenarioCard = ({ scenario, saveLabel, doneLabel, skippedLabel, onSave }: ScenarioCardProps): JSX.Element => {
  const { t } = useTranslation();
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const heroPlace = scenario.blocks.find((block) => block.place)?.place;
  const cleanTheme = sanitizeUserFacingLine(scenario.theme);
  const cleanRouteLogic = sanitizeOptionalUserFacingDescription(scenario.routeLogic);
  const scenarioCostLabel = formatCostRangeLabel(scenario.estimatedCostRange, {
    preferredCurrency: preferences?.currency,
    locale: preferences?.locale,
  });

  return (
    <GlassPanel elevated sx={{ p: 2.5, display: "grid", gap: 2 }}>
      <EntityPreviewImage
        title={heroPlace?.name ?? cleanTheme}
        locationHint={scenario.locationLabel}
        categoryHint={scenario.blocks[0]?.category}
        alt={cleanTheme}
        height={{ xs: 180, md: 220 }}
      />
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ display: "grid", gap: 0.75 }}>
          <Typography variant="h5">{cleanTheme}</Typography>
          <Typography variant="body2" color="text.secondary">
            {scenario.locationLabel}
          </Typography>
          {cleanRouteLogic ? (
            <Typography variant="body2" color="text.secondary">
              {cleanRouteLogic}
            </Typography>
          ) : null}
        </Box>
        {onSave ? (
          <Button variant="contained" onClick={onSave}>
            {saveLabel}
          </Button>
        ) : null}
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <MetadataPill icon={<WbTwilightOutlinedIcon />} label={t("local.durationLabel", { count: scenario.estimatedDurationMinutes })} tone="amber" />
        <MetadataPill label={t(`local.weatherFit.${scenario.weatherFit}`)} tone="teal" />
        <MetadataPill label={scenarioCostLabel} />
        <MetadataPill icon={<RouteOutlinedIcon />} label={t("local.blocksLabel", { count: scenario.blocks.length })} />
      </Box>
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {scenario.blocks.map((block, index) => (
          <Box key={block.id} sx={{ display: "grid", gap: 1.25 }}>
            <ActivityBlockCard block={block} doneLabel={doneLabel} skippedLabel={skippedLabel} />
            {index < scenario.blocks.length - 1
              ? (() => {
                  const nextBlock = scenario.blocks[index + 1];
                  const leg = scenario.movementLegs?.find((item) => item.fromBlockId === block.id && item.toBlockId === nextBlock?.id);
                  return leg ? <MovementLegRow leg={leg} /> : null;
                })()
              : null}
          </Box>
        ))}
      </Box>
    </GlassPanel>
  );
};
