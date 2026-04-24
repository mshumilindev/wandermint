import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import LocalBarRoundedIcon from "@mui/icons-material/LocalBarRounded";
import MuseumRoundedIcon from "@mui/icons-material/MuseumRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import HikingRoundedIcon from "@mui/icons-material/HikingRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import HotelRoundedIcon from "@mui/icons-material/HotelRounded";
import CoffeeRoundedIcon from "@mui/icons-material/CoffeeRounded";
import BedRoundedIcon from "@mui/icons-material/BedRounded";
import DirectionsBusRoundedIcon from "@mui/icons-material/DirectionsBusRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import type { JSX } from "react";
import type { ActivityBlock } from "../../../entities/activity/model";

export interface StepPresentation {
  icon: JSX.Element;
  accent: string;
  accentSoft: string;
  accentGlow: string;
  label: string;
}

const containsWord = (value: string, needles: string[]): boolean => {
  const haystack = value.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
};

export const getStepPresentation = (block: ActivityBlock): StepPresentation => {
  const signature = [block.type, block.category, block.title, block.tags.join(" ")].join(" ").toLowerCase();

  if (containsWord(signature, ["hotel", "check-in", "check in", "stay"])) {
    return {
      icon: <HotelRoundedIcon fontSize="small" />,
      accent: "#8FB6FF",
      accentSoft: "rgba(143, 182, 255, 0.12)",
      accentGlow: "rgba(143, 182, 255, 0.24)",
      label: "hotel",
    };
  }

  if (containsWord(signature, ["concert", "festival", "event", "show", "nightlife", "live"])) {
    return {
      icon: <CelebrationRoundedIcon fontSize="small" />,
      accent: "#D98CFF",
      accentSoft: "rgba(217, 140, 255, 0.12)",
      accentGlow: "rgba(217, 140, 255, 0.22)",
      label: "event",
    };
  }

  if (containsWord(signature, ["transfer", "transit", "train", "station", "flight", "airport", "metro", "bus", "taxi"])) {
    return {
      icon: <DirectionsBusRoundedIcon fontSize="small" />,
      accent: "#8FB6FF",
      accentSoft: "rgba(143, 182, 255, 0.12)",
      accentGlow: "rgba(143, 182, 255, 0.22)",
      label: "transfer",
    };
  }

  if (containsWord(signature, ["museum", "exhibition"])) {
    return {
      icon: <MuseumRoundedIcon fontSize="small" />,
      accent: "#A6B7FF",
      accentSoft: "rgba(166, 183, 255, 0.12)",
      accentGlow: "rgba(166, 183, 255, 0.22)",
      label: "museum",
    };
  }

  if (containsWord(signature, ["gallery", "art", "atelier"])) {
    return {
      icon: <PaletteRoundedIcon fontSize="small" />,
      accent: "#9DE7FF",
      accentSoft: "rgba(157, 231, 255, 0.12)",
      accentGlow: "rgba(157, 231, 255, 0.22)",
      label: "gallery",
    };
  }

  if (containsWord(signature, ["drink", "bar", "cocktail", "sake", "wine", "pub"])) {
    return {
      icon: <LocalBarRoundedIcon fontSize="small" />,
      accent: "#FFB27A",
      accentSoft: "rgba(255, 178, 122, 0.12)",
      accentGlow: "rgba(255, 178, 122, 0.22)",
      label: "drink",
    };
  }

  if (containsWord(signature, ["food", "meal", "restaurant", "eat", "dinner", "lunch", "breakfast"])) {
    return {
      icon: containsWord(signature, ["coffee", "cafe"]) ? <CoffeeRoundedIcon fontSize="small" /> : <RestaurantRoundedIcon fontSize="small" />,
      accent: "#FFC97A",
      accentSoft: "rgba(255, 201, 122, 0.12)",
      accentGlow: "rgba(255, 201, 122, 0.22)",
      label: "food",
    };
  }

  if (containsWord(signature, ["walk", "stroll", "park", "promenade", "hike"])) {
    return {
      icon: <HikingRoundedIcon fontSize="small" />,
      accent: "#73E1B8",
      accentSoft: "rgba(115, 225, 184, 0.12)",
      accentGlow: "rgba(115, 225, 184, 0.22)",
      label: "walk",
    };
  }

  if (containsWord(signature, ["landmark", "viewpoint", "tower", "square", "temple", "shrine", "castle", "monument"])) {
    return {
      icon: <PlaceRoundedIcon fontSize="small" />,
      accent: "#7FDCCB",
      accentSoft: "rgba(127, 220, 203, 0.12)",
      accentGlow: "rgba(127, 220, 203, 0.22)",
      label: "landmark",
    };
  }

  if (containsWord(signature, ["rest", "reset", "pause"])) {
    return {
      icon: <BedRoundedIcon fontSize="small" />,
      accent: "#97A6C7",
      accentSoft: "rgba(151, 166, 199, 0.12)",
      accentGlow: "rgba(151, 166, 199, 0.2)",
      label: "rest",
    };
  }

  if (block.type === "transfer") {
    return {
      icon: <SwapHorizRoundedIcon fontSize="small" />,
      accent: "#8FB6FF",
      accentSoft: "rgba(143, 182, 255, 0.12)",
      accentGlow: "rgba(143, 182, 255, 0.22)",
      label: "transfer",
    };
  }

  return {
    icon: <ExploreRoundedIcon fontSize="small" />,
    accent: "#7FDCCB",
    accentSoft: "rgba(127, 220, 203, 0.1)",
    accentGlow: "rgba(127, 220, 203, 0.18)",
    label: block.category || block.type,
  };
};
