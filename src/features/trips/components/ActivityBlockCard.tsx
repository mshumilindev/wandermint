import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Box, Button, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ActivityBlock, ActivityCompletionStatus } from "../../../entities/activity/model";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { formatCostRangeLabel } from "../../../shared/lib/priceDisplay";
import { sanitizeOptionalUserFacingDescription, sanitizeUserFacingLine } from "../../../shared/lib/userFacingText";
import { getStepPresentation } from "../lib/stepPresentation";

interface ActivityBlockCardProps {
  block: ActivityBlock;
  doneLabel: string;
  skippedLabel: string;
  onStatusChange?: (status: ActivityCompletionStatus) => void;
}

export const ActivityBlockCard = ({ block, doneLabel, skippedLabel, onStatusChange }: ActivityBlockCardProps): JSX.Element => {
  const { t } = useTranslation();
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const cleanTitle = sanitizeUserFacingLine(block.title);
  const cleanDescription = sanitizeOptionalUserFacingDescription(block.description);
  const presentation = getStepPresentation(block);
  const costLabel = formatCostRangeLabel(block.estimatedCost, {
    preferredCurrency: preferences?.currency,
    locale: preferences?.locale,
  });

  return (
    <GlassPanel
      sx={{
        p: 2,
        display: "grid",
        gap: 1.5,
        background: `linear-gradient(135deg, ${presentation.accentSoft} 0%, rgba(4, 11, 19, 0.82) 22%, rgba(4, 11, 19, 0.88) 100%)`,
        borderColor: presentation.accentGlow,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 14px 34px rgba(0,0,0,0.28), 0 0 0 1px ${presentation.accentGlow}`,
      }}
    >
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: block.place ? "120px minmax(0, 1fr)" : "1fr" }, gap: 1.5, alignItems: "start" }}>
      {block.place ? (
        <EntityPreviewImage
          title={block.place.name}
          locationHint={[block.place.city, block.place.country].filter(Boolean).join(", ") || block.place.address}
          categoryHint={block.category}
          alt={block.place.name}
          compact
          height={{ xs: 140, sm: 96 }}
        />
      ) : null}
      <Box sx={{ display: "grid", gap: 1.25, minWidth: 0 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box sx={{ display: "grid", gap: 0.75 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  color: presentation.accent,
                  background: presentation.accentSoft,
                  boxShadow: `0 0 0 1px ${presentation.accentGlow}`,
                  flexShrink: 0,
                }}
              >
                {presentation.icon}
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {block.startTime} - {block.endTime}
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ lineHeight: 1.15 }}>
              {cleanTitle}
            </Typography>
            {block.place?.name && block.place.name !== cleanTitle ? (
              <Typography variant="body2" color="text.secondary">
                {block.place.name}
              </Typography>
            ) : null}
          </Box>
          <StatusBadge status={block.completionStatus} />
        </Box>
        {cleanDescription ? (
          <Typography variant="body2" color="text.secondary">
            {cleanDescription}
          </Typography>
        ) : null}
      </Box>
    </Box>
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <MetadataPill icon={presentation.icon} label={presentation.label} tone="teal" />
      <MetadataPill label={block.type} tone="teal" />
      <MetadataPill label={block.priority} tone={block.priority === "must" ? "amber" : "default"} />
      <MetadataPill label={costLabel} />
      {block.locked ? <MetadataPill icon={<LockOutlinedIcon />} label={t("trips.locked")} tone="amber" /> : null}
    </Box>
    {onStatusChange ? (
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button startIcon={<CheckCircleOutlineRoundedIcon />} variant="outlined" onClick={() => onStatusChange("done")}>
          {doneLabel}
        </Button>
        <Button variant="text" onClick={() => onStatusChange("skipped")}>
          {skippedLabel}
        </Button>
      </Box>
    ) : null}
    </GlassPanel>
  );
};
