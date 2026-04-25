import { Box, Grid, MenuItem, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TripDraft } from "../../../../services/planning/tripGenerationService";
import { FlightPlanField } from "../FlightPlanField";
import { GlassPanel } from "../../../../shared/ui/GlassPanel";
import { WizardSectionHeader } from "./WizardSectionHeader";
import { WIZARD_BUDGET_CURRENCIES } from "./tripWizardCurrencies";

interface TripWizardBudgetSectionProps {
  draft: TripDraft;
  tripValidation: { budgetErrors: { amount?: string } };
  patchDraft: (patch: Partial<TripDraft>) => void;
}

export const TripWizardBudgetSection = ({ draft, tripValidation, patchDraft }: TripWizardBudgetSectionProps): JSX.Element => {
  const { t } = useTranslation();

  const budgetStyles = ["lean", "balanced", "premium"] as const;

  return (
    <GlassPanel elevated sx={{ p: { xs: 2.5, md: 3 }, display: "grid", gap: 2 }}>
      <WizardSectionHeader index={4} title={t("wizard.sections.budgetConstraints")} subtitle={t("wizard.sections.budgetConstraintsSubtitle")} />

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            type="number"
            label={t("wizard.budget")}
            value={draft.budget.amount}
            error={Boolean(tripValidation.budgetErrors.amount)}
            helperText={tripValidation.budgetErrors.amount ?? " "}
            onChange={(event) => patchDraft({ budget: { ...draft.budget, amount: Number(event.target.value) } })}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            label={t("wizard.budgetCurrency")}
            value={draft.budget.currency}
            onChange={(event) => patchDraft({ budget: { ...draft.budget, currency: event.target.value } })}
          >
            {WIZARD_BUDGET_CURRENCIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            label={t("wizard.budgetStyle")}
            value={draft.budget.style}
            onChange={(event) => patchDraft({ budget: { ...draft.budget, style: event.target.value as TripDraft["budget"]["style"] } })}
          >
            {budgetStyles.map((style) => (
              <MenuItem key={style} value={style}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t(`wizard.budgetStyles.${style}.title`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", whiteSpace: "normal", wordBreak: "break-word" }}>
                    {t(`wizard.budgetStyles.${style}.hint`)}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            type="number"
            label={t("wizard.dailySoftLimit")}
            placeholder={t("wizard.dailySoftLimitPlaceholder")}
            value={draft.budget.dailySoftLimit ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "" || raw === "-") {
                patchDraft({ budget: { ...draft.budget, dailySoftLimit: undefined } });
                return;
              }
              const n = Number(raw);
              patchDraft({ budget: { ...draft.budget, dailySoftLimit: Number.isFinite(n) && n > 0 ? n : undefined } });
            }}
            helperText={t("wizard.dailySoftLimitHelper")}
          />
        </Grid>
        <Grid item xs={12}>
          <FlightPlanField draft={draft} patchDraft={patchDraft} />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label={t("wizard.wishes")}
            value={draft.preferences.specialWishes}
            onChange={(event) => patchDraft({ preferences: { ...draft.preferences, specialWishes: event.target.value } })}
          />
        </Grid>
      </Grid>
    </GlassPanel>
  );
};
