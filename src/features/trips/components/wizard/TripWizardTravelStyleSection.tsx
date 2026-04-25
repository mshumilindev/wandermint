import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { Box, Grid, MenuItem, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TripDraft } from "../../../../services/planning/tripGenerationService";
import { GlassPanel } from "../../../../shared/ui/GlassPanel";
import { MustSeePlacesField } from "../MustSeePlacesField";
import { WizardSectionHeader } from "./WizardSectionHeader";
import { tripWizardVibeOptions } from "./tripWizardChipOptions";

interface TripWizardTravelStyleSectionProps {
  draft: TripDraft;
  patchDraft: (patch: Partial<TripDraft>) => void;
  toggleVibe: (value: string) => void;
}

export const TripWizardTravelStyleSection = ({ draft, patchDraft, toggleVibe }: TripWizardTravelStyleSectionProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <GlassPanel elevated sx={{ p: { xs: 2.5, md: 3 }, display: "grid", gap: 2 }}>
      <WizardSectionHeader index={2} title={t("wizard.sections.travelStyle")} subtitle={t("wizard.sections.travelStyleSubtitle")} />

      <Typography variant="subtitle2" color="text.secondary">
        {t("wizard.vibe")}
      </Typography>
      <Box sx={{ display: "grid", gap: 1.25 }}>
        {tripWizardVibeOptions.map((option) => {
          const selected = draft.preferences.vibe.includes(option.value);
          return (
            <Box
              key={option.value}
              onClick={() => toggleVibe(option.value)}
              role="checkbox"
              aria-checked={selected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleVibe(option.value);
                }
              }}
              sx={{
                p: 2,
                borderRadius: 2,
                cursor: "pointer",
                border: "1px solid",
                borderColor: selected ? "primary.main" : "rgba(255,255,255,0.08)",
                background: selected ? "rgba(0, 180, 216, 0.1)" : "rgba(3, 15, 23, 0.35)",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: 1.5,
                alignItems: "start",
                transition: "border-color 0.2s, background 0.2s",
                "&:hover": { borderColor: "primary.light" },
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1,
                  border: "2px solid",
                  borderColor: selected ? "primary.main" : "rgba(255,255,255,0.25)",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: selected ? "primary.main" : "transparent",
                  color: selected ? "primary.contrastText" : "transparent",
                }}
              >
                {selected ? <CheckRoundedIcon sx={{ fontSize: 18 }} /> : null}
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t(option.labelKey)}
                </Typography>
                {selected ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.5 }}>
                    {t(option.hintKey)}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
                    {t("wizard.vibeTapToExplain")}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <MustSeePlacesField
        places={draft.mustSeePlaces ?? []}
        destinationCity={draft.tripSegments[0]?.city ?? ""}
        destinationCountry={draft.tripSegments[0]?.country ?? ""}
        dateRange={draft.dateRange}
        onChange={(next, derivedMustSeeNotes) =>
          patchDraft({
            mustSeePlaces: next,
            preferences: { ...draft.preferences, mustSeeNotes: derivedMustSeeNotes },
          })
        }
      />

      <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
        {t("wizard.schedulingStyle")}
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            label={t("wizard.explorationSpeed")}
            value={draft.executionProfile.explorationSpeed}
            onChange={(event) =>
              patchDraft({
                executionProfile: { ...draft.executionProfile, explorationSpeed: event.target.value as TripDraft["executionProfile"]["explorationSpeed"] },
              })
            }
          >
            {["slow", "standard", "fast", "very_fast"].map((value) => (
              <MenuItem key={value} value={value}>
                {t(`wizard.speed.${value}`)}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            label={t("wizard.scheduleDensity")}
            value={draft.executionProfile.scheduleDensity}
            onChange={(event) =>
              patchDraft({
                executionProfile: { ...draft.executionProfile, scheduleDensity: event.target.value as TripDraft["executionProfile"]["scheduleDensity"] },
              })
            }
          >
            {["relaxed", "balanced", "dense", "extreme"].map((value) => (
              <MenuItem key={value} value={value}>
                {t(`wizard.density.${value}`)}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            label={t("wizard.eventCentricity")}
            value={draft.executionProfile.eventCentricity}
            onChange={(event) =>
              patchDraft({
                executionProfile: { ...draft.executionProfile, eventCentricity: event.target.value as TripDraft["executionProfile"]["eventCentricity"] },
              })
            }
          >
            {["low", "medium", "high"].map((value) => (
              <MenuItem key={value} value={value}>
                {t(`common.level.${value}`)}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>
    </GlassPanel>
  );
};
