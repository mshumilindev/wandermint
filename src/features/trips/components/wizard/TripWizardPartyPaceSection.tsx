import FamilyRestroomRoundedIcon from "@mui/icons-material/FamilyRestroomRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import { Box, Grid, Slider, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TripDraft } from "../../../../services/planning/tripGenerationService";
import { GlassPanel } from "../../../../shared/ui/GlassPanel";
import { FoodPreferencesField } from "../FoodPreferencesField";
import { WizardSectionHeader } from "./WizardSectionHeader";

const partyValues: TripDraft["preferences"]["partyComposition"][] = ["solo", "couple", "friends", "family"];

const paceOrder: TripDraft["preferences"]["pace"][] = ["slow", "balanced", "dense"];
const walkingOrder: TripDraft["preferences"]["walkingTolerance"][] = ["low", "medium", "high"];

const partyIcon = (value: TripDraft["preferences"]["partyComposition"]): JSX.Element => {
  switch (value) {
    case "solo":
      return <PersonRoundedIcon sx={{ fontSize: 32 }} />;
    case "couple":
      return <FavoriteRoundedIcon sx={{ fontSize: 32 }} />;
    case "friends":
      return <GroupsRoundedIcon sx={{ fontSize: 32 }} />;
    case "family":
      return <FamilyRestroomRoundedIcon sx={{ fontSize: 32 }} />;
    default:
      return <PersonRoundedIcon sx={{ fontSize: 32 }} />;
  }
};

interface TripWizardPartyPaceSectionProps {
  draft: TripDraft;
  patchDraft: (patch: Partial<TripDraft>) => void;
}

export const TripWizardPartyPaceSection = ({ draft, patchDraft }: TripWizardPartyPaceSectionProps): JSX.Element => {
  const { t } = useTranslation();

  const paceIndex = Math.max(0, paceOrder.indexOf(draft.preferences.pace));
  const walkIndex = Math.max(0, walkingOrder.indexOf(draft.preferences.walkingTolerance));

  return (
    <GlassPanel elevated sx={{ p: { xs: 2.5, md: 3 }, display: "grid", gap: 2.5 }}>
      <WizardSectionHeader index={3} title={t("wizard.sections.partyPace")} subtitle={t("wizard.sections.partyPaceSubtitle")} />

      <Typography variant="subtitle2" color="text.secondary">
        {t("wizard.party")}
      </Typography>
      <Grid container spacing={1.5}>
        {partyValues.map((value) => {
          const active = draft.preferences.partyComposition === value;
          return (
            <Grid item xs={12} sm={6} key={value}>
              <Box
                onClick={() => patchDraft({ preferences: { ...draft.preferences, partyComposition: value } })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    patchDraft({ preferences: { ...draft.preferences, partyComposition: value } });
                  }
                }}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 1.5,
                  alignItems: "center",
                  border: "1px solid",
                  borderColor: active ? "primary.main" : "rgba(255,255,255,0.08)",
                  background: active ? "rgba(0, 180, 216, 0.12)" : "rgba(3, 15, 23, 0.35)",
                  transition: "border-color 0.2s, background 0.2s",
                  "&:hover": { borderColor: "primary.light" },
                }}
              >
                <Box sx={{ color: active ? "primary.light" : "text.secondary" }}>{partyIcon(value)}</Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {t(`wizard.partyOptions.${value}`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.35 }}>
                    {t(`wizard.partyCardHints.${value}`)}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          );
        })}
      </Grid>

      <Box sx={{ mt: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t("wizard.pace")}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1 }}>
          {t("wizard.paceScaleHint")}
        </Typography>
        <Slider
          value={paceIndex}
          min={0}
          max={paceOrder.length - 1}
          step={1}
          marks={paceOrder.map((p, i) => ({ value: i, label: t(`wizard.paceMarks.${p}`) }))}
          onChange={(_, v) => {
            const idx = Array.isArray(v) ? v[0] : v;
            if (idx === undefined) {
              return;
            }
            const next = paceOrder[idx] ?? "balanced";
            patchDraft({ preferences: { ...draft.preferences, pace: next } });
          }}
          sx={{
            "& .MuiSlider-markLabel": { fontSize: "0.7rem", maxWidth: 72, whiteSpace: "normal", textAlign: "center", lineHeight: 1.2 },
          }}
        />
      </Box>

      <FoodPreferencesField
        preferences={draft.foodPreferences ?? []}
        destinationCity={draft.tripSegments[0]?.city ?? ""}
        destinationCountry={draft.tripSegments[0]?.country ?? ""}
        onChange={(next, derivedFoodInterests) =>
          patchDraft({
            foodPreferences: next,
            preferences: { ...draft.preferences, foodInterests: derivedFoodInterests },
          })
        }
      />

      <Box>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t("wizard.walking")}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1 }}>
          {t("wizard.walkingScaleHint")}
        </Typography>
        <Slider
          value={walkIndex}
          min={0}
          max={walkingOrder.length - 1}
          step={1}
          marks={walkingOrder.map((w, i) => ({ value: i, label: t(`wizard.walkingMarks.${w}`) }))}
          onChange={(_, v) => {
            const idx = Array.isArray(v) ? v[0] : v;
            if (idx === undefined) {
              return;
            }
            const next = walkingOrder[idx] ?? "medium";
            patchDraft({ preferences: { ...draft.preferences, walkingTolerance: next } });
          }}
          sx={{
            "& .MuiSlider-markLabel": { fontSize: "0.7rem", maxWidth: 80, whiteSpace: "normal", textAlign: "center", lineHeight: 1.2 },
          }}
        />
      </Box>
    </GlassPanel>
  );
};
