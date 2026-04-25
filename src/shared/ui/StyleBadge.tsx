import { Chip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { getTravelStylePresentation, isTravelStyle } from "../../theme/travelStyleConfig";

type StyleValue = string;

export const StyleBadge = ({
  style,
  labelKeyPrefix = "travelStats.styles",
}: {
  style: StyleValue;
  labelKeyPrefix?: string;
}): JSX.Element => {
  const { t } = useTranslation();
  const normalized = style.trim().toLowerCase();
  const presentation = getTravelStylePresentation(normalized);
  const Icon = presentation.Icon;

  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: 18, color: presentation.iconColor }} />}
      label={isTravelStyle(normalized) ? t(`${labelKeyPrefix}.${normalized}`) : style}
      sx={{
        width: "fit-content",
        border: "1px solid rgba(255,255,255,0.1)",
        background: presentation.gradientChip,
        color: presentation.color,
        boxShadow: presentation.glow,
        backdropFilter: "blur(8px)",
        "& .MuiChip-icon": {
          color: presentation.iconColor,
        },
        "& .MuiChip-label": {
          color: presentation.color,
          fontWeight: 600,
        },
      }}
    />
  );
};
