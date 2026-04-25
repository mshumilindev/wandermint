import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Box, Button, Typography } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PlanWarning } from "../../../entities/warning/model";
import { effectivePlanWarningSeverity, isPlanWarningVisuallySoftened, userOverrideTypesForPlanWarning } from "../../user-overrides/userOverridePresentation";
import { useUserOverrideStore } from "../../user-overrides/userOverrideStore";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { sanitizeOptionalUserFacingDescription } from "../../../shared/lib/userFacingText";

interface WarningCardProps {
  warning: PlanWarning;
  /**
   * When true, matching stored user overrides soften severity and the card can record new explicit overrides.
   * Does not change persisted warning rows — display only.
   */
  softenPresentation?: boolean;
}

export const WarningCard = ({ warning, softenPresentation = false }: WarningCardProps): JSX.Element => {
  const { t } = useTranslation();
  const overrides = useUserOverrideStore((s) => s.overrides);
  const recordForWarning = useUserOverrideStore((s) => s.recordOverridesForPlanWarning);

  const applicableTypes = useMemo(() => (softenPresentation ? userOverrideTypesForPlanWarning(warning) : []), [softenPresentation, warning]);

  const displaySeverity = useMemo(() => {
    if (!softenPresentation) {
      return warning.severity;
    }
    return effectivePlanWarningSeverity(warning, overrides);
  }, [overrides, softenPresentation, warning]);

  const softened = softenPresentation && isPlanWarningVisuallySoftened(warning, overrides);
  const canRecordExplicit =
    softenPresentation && applicableTypes.length > 0 && !softened && (warning.severity === "warning" || warning.severity === "critical");

  const cleanMessage = sanitizeOptionalUserFacingDescription(warning.message) ?? warning.message;
  const cleanAction = sanitizeOptionalUserFacingDescription(warning.suggestedAction);

  const severityTone = displaySeverity === "critical" ? "danger" : displaySeverity === "warning" ? "amber" : "teal";
  const severityIcon =
    displaySeverity === "info" ? <InfoOutlinedIcon /> : <WarningAmberRoundedIcon />;

  const onAcceptRisk = (): void => {
    recordForWarning(warning);
  };

  return (
    <GlassPanel sx={{ p: 2, display: "grid", gap: 1 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <MetadataPill icon={severityIcon} label={displaySeverity} tone={severityTone} />
        <MetadataPill label={warning.type.replaceAll("_", " ")} />
      </Box>
      <Typography variant="subtitle1">{cleanMessage}</Typography>
      {cleanAction ? (
        <Typography variant="body2" color="text.secondary">
          {cleanAction}
        </Typography>
      ) : null}
      {softenPresentation && softened ? (
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
          {t("trips.overrides.softenedNotice")}
        </Typography>
      ) : null}
      {canRecordExplicit ? (
        <Box>
          <Button size="small" variant="outlined" onClick={onAcceptRisk}>
            {t("trips.overrides.acceptRisk")}
          </Button>
        </Box>
      ) : null}
    </GlassPanel>
  );
};
