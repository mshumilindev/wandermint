import LocalBarOutlinedIcon from "@mui/icons-material/LocalBarOutlined";
import RestaurantOutlinedIcon from "@mui/icons-material/RestaurantOutlined";
import SetMealOutlinedIcon from "@mui/icons-material/SetMealOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { Chip, type ChipProps } from "@mui/material";
import type { FoodDrinkStrategy } from "../../../entities/food-culture/model";

export type FoodCultureBadgeVariant = "must_try" | "drink" | "local_tip" | "tourist_warn" | "strategy" | "seafood";

const iconFor = (variant: FoodCultureBadgeVariant) => {
  switch (variant) {
    case "drink":
      return <LocalBarOutlinedIcon sx={{ fontSize: 16 }} />;
    case "must_try":
    case "seafood":
      return <SetMealOutlinedIcon sx={{ fontSize: 16 }} />;
    case "tourist_warn":
      return <WarningAmberOutlinedIcon sx={{ fontSize: 16 }} />;
    case "strategy":
    case "local_tip":
    default:
      return <RestaurantOutlinedIcon sx={{ fontSize: 16 }} />;
  }
};

export interface FoodCultureBadgeProps {
  variant: FoodCultureBadgeVariant;
  label: string;
  size?: ChipProps["size"];
  color?: ChipProps["color"];
}

export const FoodCultureBadge = ({ variant, label, size = "small", color = "default" }: FoodCultureBadgeProps): JSX.Element => (
  <Chip
    size={size}
    color={color}
    icon={iconFor(variant)}
    label={label}
    variant="outlined"
    sx={{ fontWeight: 600, maxWidth: "100%" }}
  />
);

export const foodStrategyShortLabel = (strategy: FoodDrinkStrategy): string => {
  switch (strategy) {
    case "high_end":
      return "Fine dining";
    case "local_authentic":
      return "Local";
    case "not_tourist_trap":
      return "Anti-trap";
    case "street_food":
      return "Street";
    case "budget_local":
      return "Budget";
    case "seafood_focus":
      return "Seafood";
    case "comfort_safe":
      return "Comfort";
    case "experimental":
      return "Experimental";
    case "balanced":
    default:
      return "Balanced";
  }
};
