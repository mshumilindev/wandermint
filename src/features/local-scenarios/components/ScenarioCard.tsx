import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import WbTwilightOutlinedIcon from "@mui/icons-material/WbTwilightOutlined";
import { Box, Button, Typography } from "@mui/material";
import { useMemo } from "react";
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
import { buildGoogleMapsDirectionsUrl } from "../../../shared/lib/googleMapsDirectionsUrl";

interface ScenarioCardProps {
  scenario: LocalScenario;
  saveLabel: string;
  doneLabel: string;
  skippedLabel: string;
  onSave?: () => void;
  previewVariant?: "scenarioCard" | "savedItem";
}

export const ScenarioCard = ({ scenario, saveLabel, doneLabel, skippedLabel, onSave, previewVariant = "scenarioCard" }: ScenarioCardProps): JSX.Element => {
  const { t } = useTranslation();
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const mapsUrl = useMemo(
    () =>
      buildGoogleMapsDirectionsUrl(
        scenario.blocks
          .map((block) => block.place)
          .filter((place): place is NonNullable<(typeof scenario.blocks)[number]["place"]> =>
            Boolean(place && place.latitude !== undefined && place.longitude !== undefined),
          ),
      ),
    [scenario.blocks],
  );
  const heroPlace = scenario.blocks.find((block) => block.place)?.place;
  const cleanTheme = sanitizeUserFacingLine(scenario.theme);
  const cleanRouteLogic = sanitizeOptionalUserFacingDescription(scenario.routeLogic);
  const scenarioCostLabel = formatCostRangeLabel(scenario.estimatedCostRange, {
    preferredCurrency: preferences?.currency,
    locale: preferences?.locale,
  });

  return (
    <GlassPanel elevated sx={{ p: 2.5, display: "grid", gap: 2, height: "100%" }}>
      <EntityPreviewImage
        entityId={`scenario:${scenario.id}`}
        variant={previewVariant}
        title={heroPlace?.name ?? cleanTheme}
        locationHint={scenario.locationLabel}
        categoryHint={scenario.blocks[0]?.category}
        latitude={heroPlace?.latitude}
        longitude={heroPlace?.longitude}
        alt={`${cleanTheme} · ${scenario.locationLabel}`}
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
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <MetadataPill icon={<WbTwilightOutlinedIcon />} label={t("local.durationLabel", { count: scenario.estimatedDurationMinutes })} tone="amber" />
        <MetadataPill label={t(`local.weatherFit.${scenario.weatherFit}`)} tone="teal" />
        <MetadataPill label={scenarioCostLabel} />
        <MetadataPill icon={<RouteOutlinedIcon />} label={t("local.blocksLabel", { count: scenario.blocks.length })} />
        {mapsUrl ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<MapOutlinedIcon />}
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ textTransform: "none" }}
          >
            {t("common.openInGoogleMaps")}
          </Button>
        ) : null}
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
