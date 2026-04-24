import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import { Box, Button, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { PlanWarning } from "../../../entities/warning/model";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";

interface TripHealthPanelProps {
  warnings: PlanWarning[];
  onRevalidate: () => void;
  validateLabel: string;
  title: string;
}

export const TripHealthPanel = ({ warnings, onRevalidate, validateLabel, title }: TripHealthPanelProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <GlassPanel elevated sx={{ p: 3, borderColor: warnings.length > 0 ? "var(--wm-color-border-strong)" : "var(--wm-color-border)" }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", flexDirection: { xs: "column", sm: "row" } }}>
        <Box sx={{ display: "grid", gap: 1 }}>
          <MetadataPill icon={<HealthAndSafetyOutlinedIcon />} label={title} tone={warnings.length > 0 ? "amber" : "teal"} />
          <Typography variant="h5">{warnings.length > 0 ? t("trips.healthSignals", { count: warnings.length }) : t("trips.healthCalm")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("trips.healthSubtitle")}
          </Typography>
        </Box>
        <Button variant="contained" onClick={onRevalidate}>
          {validateLabel}
        </Button>
      </Box>
    </GlassPanel>
  );
};
