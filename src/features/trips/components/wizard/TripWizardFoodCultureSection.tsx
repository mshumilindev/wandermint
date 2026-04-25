import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { Box, FormControlLabel, Grid, Switch, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { FoodDrinkStrategy } from "../../../../entities/food-culture/model";
import { FOOD_DRINK_STRATEGIES } from "../../../../entities/food-culture/model";
import type { TripDraft } from "../../../../services/planning/tripGenerationService";
import { mergeFoodDrinkPlannerSettings } from "../../../../services/foodCulture/foodCultureDefaults";
import { GlassPanel } from "../../../../shared/ui/GlassPanel";
import { WizardSectionHeader } from "./WizardSectionHeader";

interface TripWizardFoodCultureSectionProps {
  draft: TripDraft;
  patchDraft: (patch: Partial<TripDraft>) => void;
}

const strategyCard = (
  value: FoodDrinkStrategy,
  selected: FoodDrinkStrategy,
  secondary: FoodDrinkStrategy[],
  onPickPrimary: (v: FoodDrinkStrategy) => void,
  onToggleSecondary: (v: FoodDrinkStrategy) => void,
  title: string,
  hint: string,
): JSX.Element => {
  const isPrimary = selected === value;
  const isSecondary = secondary.includes(value);
  return (
    <Box
      key={value}
      onClick={() => onPickPrimary(value)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPickPrimary(value);
        }
      }}
      sx={{
        p: 1.75,
        borderRadius: 2,
        cursor: "pointer",
        border: "1px solid",
        borderColor: isPrimary ? "primary.main" : "rgba(255,255,255,0.08)",
        background: isPrimary ? "rgba(0, 180, 216, 0.1)" : "rgba(3, 15, 23, 0.35)",
        display: "grid",
        gap: 1,
        transition: "border-color 0.2s, background 0.2s",
        "&:hover": { borderColor: "primary.light" },
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={isSecondary}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSecondary(value);
              }}
            />
          }
          label=""
          sx={{ m: 0 }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
        {hint}
      </Typography>
      {isPrimary ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "primary.light" }}>
          <CheckRoundedIcon sx={{ fontSize: 18 }} />
          <Typography variant="caption">Primary</Typography>
        </Box>
      ) : isSecondary ? (
        <Typography variant="caption" color="primary.light">
          Secondary
        </Typography>
      ) : (
        <Typography variant="caption" color="text.disabled">
          Tap to set primary · toggle for secondary
        </Typography>
      )}
    </Box>
  );
};

export const TripWizardFoodCultureSection = ({ draft, patchDraft }: TripWizardFoodCultureSectionProps): JSX.Element => {
  const { t } = useTranslation();
  const planner = mergeFoodDrinkPlannerSettings(draft.preferences.foodDrinkPlanner);

  const setPlanner = (next: typeof planner): void => {
    patchDraft({ preferences: { ...draft.preferences, foodDrinkPlanner: next } });
  };

  const onPrimary = (value: FoodDrinkStrategy): void => {
    setPlanner({ ...planner, primaryFoodDrinkStrategy: value });
  };

  const onToggleSecondary = (value: FoodDrinkStrategy): void => {
    if (value === planner.primaryFoodDrinkStrategy) {
      return;
    }
    const has = planner.secondaryFoodDrinkStrategies.includes(value);
    const next = has
      ? planner.secondaryFoodDrinkStrategies.filter((s) => s !== value)
      : [...planner.secondaryFoodDrinkStrategies, value].slice(0, 4);
    setPlanner({ ...planner, secondaryFoodDrinkStrategies: next });
  };

  const cards: Array<{ value: FoodDrinkStrategy; titleKey: string; hintKey: string }> = FOOD_DRINK_STRATEGIES.map((value) => ({
    value,
    titleKey: `wizard.foodStrategy.${value}.title`,
    hintKey: `wizard.foodStrategy.${value}.hint`,
  }));

  return (
    <GlassPanel elevated sx={{ p: { xs: 2.5, md: 3 }, display: "grid", gap: 2 }}>
      <WizardSectionHeader index={5} title={t("wizard.sections.foodCulture")} subtitle={t("wizard.sections.foodCultureSubtitle")} />
      <Typography variant="body2" color="text.secondary">
        {t("wizard.foodStrategyIntro")}
      </Typography>
      <Typography variant="subtitle2" color="text.secondary">
        {t("wizard.foodStrategyCardPick")}
      </Typography>
      <Grid container spacing={1.5}>
        {cards.map((c) => (
          <Grid item xs={12} sm={6} md={4} key={c.value}>
            {strategyCard(
              c.value,
              planner.primaryFoodDrinkStrategy,
              planner.secondaryFoodDrinkStrategies,
              onPrimary,
              onToggleSecondary,
              t(c.titleKey),
              t(c.hintKey),
            )}
          </Grid>
        ))}
      </Grid>
      <Box sx={{ display: "grid", gap: 1, pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
        <FormControlLabel
          control={
            <Switch
              checked={planner.includeAlcoholRecommendations}
              onChange={(e) => setPlanner({ ...planner, includeAlcoholRecommendations: e.target.checked })}
            />
          }
          label={t("wizard.foodToggleAlcohol")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={planner.includeCoffeeTeaRecommendations}
              onChange={(e) => setPlanner({ ...planner, includeCoffeeTeaRecommendations: e.target.checked })}
            />
          }
          label={t("wizard.foodToggleCoffee")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={planner.includeSupermarketShopTips}
              onChange={(e) => setPlanner({ ...planner, includeSupermarketShopTips: e.target.checked })}
            />
          }
          label={t("wizard.foodToggleShops")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={planner.includePracticalWarnings}
              onChange={(e) => setPlanner({ ...planner, includePracticalWarnings: e.target.checked })}
            />
          }
          label={t("wizard.foodToggleWarnings")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={planner.avoidTouristTrapsAggressively}
              onChange={(e) => setPlanner({ ...planner, avoidTouristTrapsAggressively: e.target.checked })}
            />
          }
          label={t("wizard.foodToggleAggressiveTrap")}
        />
      </Box>
    </GlassPanel>
  );
};
