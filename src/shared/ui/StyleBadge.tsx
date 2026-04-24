import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ForestRoundedIcon from "@mui/icons-material/ForestRounded";
import LocalDiningRoundedIcon from "@mui/icons-material/LocalDiningRounded";
import NightlifeRoundedIcon from "@mui/icons-material/NightlifeRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import SpaRoundedIcon from "@mui/icons-material/SpaRounded";
import { Chip } from "@mui/material";
import { useTranslation } from "react-i18next";

type StyleValue = "mixed" | "culture" | "food" | "nature" | "nightlife" | "rest" | string;

const stylePresentation = (style: StyleValue): { icon: JSX.Element; border: string; color: string; background: string } => {
  const normalized = style.trim().toLowerCase();

  if (normalized === "culture") {
    return {
      icon: <PaletteRoundedIcon fontSize="small" />,
      border: "rgba(126, 156, 255, 0.32)",
      color: "#A9B8FF",
      background: "rgba(126, 156, 255, 0.1)",
    };
  }

  if (normalized === "food") {
    return {
      icon: <LocalDiningRoundedIcon fontSize="small" />,
      border: "rgba(245, 138, 44, 0.34)",
      color: "#FFBE7C",
      background: "rgba(245, 138, 44, 0.1)",
    };
  }

  if (normalized === "nature") {
    return {
      icon: <ForestRoundedIcon fontSize="small" />,
      border: "rgba(88, 182, 135, 0.32)",
      color: "#8FE0B2",
      background: "rgba(88, 182, 135, 0.1)",
    };
  }

  if (normalized === "nightlife") {
    return {
      icon: <NightlifeRoundedIcon fontSize="small" />,
      border: "rgba(191, 108, 178, 0.32)",
      color: "#E2A8DA",
      background: "rgba(191, 108, 178, 0.1)",
    };
  }

  if (normalized === "rest") {
    return {
      icon: <SpaRoundedIcon fontSize="small" />,
      border: "rgba(117, 210, 211, 0.32)",
      color: "#9EE7E9",
      background: "rgba(117, 210, 211, 0.1)",
    };
  }

  return {
    icon: <AutoAwesomeRoundedIcon fontSize="small" />,
    border: "rgba(183, 237, 226, 0.18)",
    color: "var(--wm-color-text-primary)",
    background: "rgba(255,255,255,0.04)",
  };
};

export const StyleBadge = ({
  style,
  labelKeyPrefix = "travelStats.styles",
}: {
  style: StyleValue;
  labelKeyPrefix?: string;
}): JSX.Element => {
  const { t } = useTranslation();
  const presentation = stylePresentation(style);

  return (
    <Chip
      size="small"
      icon={presentation.icon}
      label={t(`${labelKeyPrefix}.${style}`)}
      variant="outlined"
      sx={{
        borderColor: presentation.border,
        color: presentation.color,
        background: presentation.background,
        "& .MuiChip-icon": {
          color: "inherit",
        },
      }}
    />
  );
};
