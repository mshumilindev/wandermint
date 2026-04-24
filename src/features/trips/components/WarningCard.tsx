import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Box, Typography } from "@mui/material";
import type { PlanWarning } from "../../../entities/warning/model";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { sanitizeOptionalUserFacingDescription } from "../../../shared/lib/userFacingText";

export const WarningCard = ({ warning }: { warning: PlanWarning }): JSX.Element => {
  const cleanMessage = sanitizeOptionalUserFacingDescription(warning.message) ?? warning.message;
  const cleanAction = sanitizeOptionalUserFacingDescription(warning.suggestedAction);

  return (
    <GlassPanel sx={{ p: 2, display: "grid", gap: 1 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <MetadataPill icon={<WarningAmberRoundedIcon />} label={warning.severity} tone={warning.severity === "critical" ? "danger" : "amber"} />
        <MetadataPill label={warning.type.replaceAll("_", " ")} />
      </Box>
      <Typography variant="subtitle1">{cleanMessage}</Typography>
      {cleanAction ? (
        <Typography variant="body2" color="text.secondary">
          {cleanAction}
        </Typography>
      ) : null}
    </GlassPanel>
  );
};
