import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import ForestRoundedIcon from "@mui/icons-material/ForestRounded";
import LocalDiningRoundedIcon from "@mui/icons-material/LocalDiningRounded";
import NightlifeRoundedIcon from "@mui/icons-material/NightlifeRounded";
import SpaRoundedIcon from "@mui/icons-material/SpaRounded";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import type { ElementType } from "react";

export type TravelStyle = "mixed" | "culture" | "food" | "nature" | "nightlife" | "rest";

export type TravelStyleIconComponent = ElementType<SvgIconProps>;

export interface TravelStylePresentation {
  labelKey: string;
  Icon: TravelStyleIconComponent;
  /** Select / pill / selected row */
  gradientPill: string;
  /** Chips and compact tags */
  gradientChip: string;
  /** Dropdown row hover */
  gradientMenuHover: string;
  /** Dropdown selected row */
  gradientMenuSelected: string;
  color: string;
  iconColor: string;
  glow: string;
  glowSelected: string;
}

export const travelStyleConfig: Record<TravelStyle, TravelStylePresentation> = {
  mixed: {
    labelKey: "travelStats.styles.mixed",
    Icon: AutoAwesomeRoundedIcon,
    gradientPill: "linear-gradient(135deg, rgba(0, 255, 200, 0.25), rgba(124, 70, 255, 0.25))",
    gradientChip: "linear-gradient(135deg, rgba(0, 255, 200, 0.14), rgba(124, 70, 255, 0.14))",
    gradientMenuHover: "linear-gradient(135deg, rgba(0, 255, 200, 0.32), rgba(124, 70, 255, 0.28))",
    gradientMenuSelected: "linear-gradient(135deg, rgba(0, 255, 200, 0.4), rgba(124, 70, 255, 0.36))",
    color: "var(--wm-deep-purple)",
    iconColor: "var(--wm-travel-style-icon)",
    glow: "0 0 12px rgba(124, 70, 255, 0.22)",
    glowSelected: "0 0 16px rgba(33, 220, 195, 0.28)",
  },
  culture: {
    labelKey: "travelStats.styles.culture",
    Icon: AutoStoriesRoundedIcon,
    gradientPill: "linear-gradient(135deg, rgba(124, 70, 255, 0.3), rgba(170, 59, 255, 0.2))",
    gradientChip: "linear-gradient(135deg, rgba(124, 70, 255, 0.16), rgba(170, 59, 255, 0.12))",
    gradientMenuHover: "linear-gradient(135deg, rgba(124, 70, 255, 0.38), rgba(170, 59, 255, 0.28))",
    gradientMenuSelected: "linear-gradient(135deg, rgba(124, 70, 255, 0.48), rgba(170, 59, 255, 0.34))",
    color: "var(--wm-deep-purple)",
    iconColor: "var(--wm-travel-style-icon)",
    glow: "0 0 12px rgba(170, 59, 255, 0.22)",
    glowSelected: "0 0 18px rgba(170, 59, 255, 0.32)",
  },
  food: {
    labelKey: "travelStats.styles.food",
    Icon: LocalDiningRoundedIcon,
    gradientPill: "linear-gradient(135deg, rgba(var(--wm-space-orange-rgb), 0.35), rgba(255, 180, 80, 0.2))",
    gradientChip: "linear-gradient(135deg, rgba(var(--wm-space-orange-rgb), 0.2), rgba(255, 180, 80, 0.12))",
    gradientMenuHover: "linear-gradient(135deg, rgba(var(--wm-space-orange-rgb), 0.45), rgba(255, 180, 80, 0.28))",
    gradientMenuSelected: "linear-gradient(135deg, rgba(var(--wm-space-orange-rgb), 0.52), rgba(255, 200, 120, 0.32))",
    color: "var(--wm-color-accent-amber)",
    iconColor: "var(--wm-travel-style-icon)",
    glow: "0 0 12px rgba(var(--wm-space-orange-rgb), 0.28)",
    glowSelected: "0 0 18px rgba(var(--wm-space-orange-rgb), 0.38)",
  },
  nature: {
    labelKey: "travelStats.styles.nature",
    Icon: ForestRoundedIcon,
    gradientPill: "linear-gradient(135deg, rgba(0, 255, 180, 0.25), rgba(0, 180, 120, 0.2))",
    gradientChip: "linear-gradient(135deg, rgba(0, 255, 180, 0.14), rgba(0, 180, 120, 0.12))",
    gradientMenuHover: "linear-gradient(135deg, rgba(0, 255, 180, 0.34), rgba(0, 180, 120, 0.26))",
    gradientMenuSelected: "linear-gradient(135deg, rgba(0, 255, 180, 0.42), rgba(0, 200, 140, 0.32))",
    color: "var(--wm-travel-nature-mint)",
    iconColor: "var(--wm-travel-style-icon)",
    glow: "0 0 12px rgba(33, 220, 195, 0.22)",
    glowSelected: "0 0 18px rgba(0, 255, 180, 0.28)",
  },
  nightlife: {
    labelKey: "travelStats.styles.nightlife",
    Icon: NightlifeRoundedIcon,
    gradientPill: "linear-gradient(135deg, rgba(255, 0, 200, 0.25), rgba(124, 70, 255, 0.25))",
    gradientChip: "linear-gradient(135deg, rgba(255, 0, 200, 0.14), rgba(124, 70, 255, 0.14))",
    gradientMenuHover: "linear-gradient(135deg, rgba(255, 0, 200, 0.34), rgba(124, 70, 255, 0.3))",
    gradientMenuSelected: "linear-gradient(135deg, rgba(255, 0, 200, 0.42), rgba(124, 70, 255, 0.36))",
    color: "var(--wm-travel-nightlife-pink)",
    iconColor: "var(--wm-travel-style-icon)",
    glow: "0 0 12px rgba(255, 80, 200, 0.24)",
    glowSelected: "0 0 18px rgba(255, 80, 200, 0.32)",
  },
  rest: {
    labelKey: "travelStats.styles.rest",
    Icon: SpaRoundedIcon,
    gradientPill: "linear-gradient(135deg, rgba(120, 200, 255, 0.25), rgba(80, 140, 255, 0.2))",
    gradientChip: "linear-gradient(135deg, rgba(120, 200, 255, 0.14), rgba(80, 140, 255, 0.12))",
    gradientMenuHover: "linear-gradient(135deg, rgba(120, 200, 255, 0.34), rgba(80, 140, 255, 0.28))",
    gradientMenuSelected: "linear-gradient(135deg, rgba(120, 200, 255, 0.42), rgba(100, 160, 255, 0.32))",
    color: "var(--wm-travel-rest-blue)",
    iconColor: "var(--wm-travel-style-icon)",
    glow: "0 0 12px rgba(120, 200, 255, 0.22)",
    glowSelected: "0 0 18px rgba(120, 200, 255, 0.3)",
  },
};

export const TRAVEL_STYLE_ORDER: TravelStyle[] = ["mixed", "culture", "food", "nature", "nightlife", "rest"];

export const isTravelStyle = (value: string): value is TravelStyle =>
  Object.prototype.hasOwnProperty.call(travelStyleConfig, value);

export const getTravelStylePresentation = (value: string): TravelStylePresentation => {
  const key = isTravelStyle(value) ? value : "mixed";
  return travelStyleConfig[key];
};
