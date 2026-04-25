import { Box, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TripDraft } from "../../../../services/planning/tripGenerationService";
import { GlassPanel } from "../../../../shared/ui/GlassPanel";
import { WizardSectionHeader } from "./WizardSectionHeader";

export type StoryInspirationLevel = "off" | "subtle" | "balanced" | "themed";

interface TripWizardStoryInspirationSectionProps {
  draft: TripDraft;
  patchDraft: (patch: Partial<TripDraft>) => void;
}

const levels: StoryInspirationLevel[] = ["off", "subtle", "balanced", "themed"];

const LEVEL_HINT: Record<StoryInspirationLevel, string> = {
  off: "wizard.storyInspiration.optionHintOff",
  subtle: "wizard.storyInspiration.optionHintSubtle",
  balanced: "wizard.storyInspiration.optionHintBalanced",
  themed: "wizard.storyInspiration.optionHintThemed",
};

export const TripWizardStoryInspirationSection = ({ draft, patchDraft }: TripWizardStoryInspirationSectionProps): JSX.Element => {
  const { t } = useTranslation();
  const value: StoryInspirationLevel = draft.preferences.storyInspirationLevel ?? "subtle";

  return (
    <GlassPanel sx={{ p: 2.5, display: "grid", gap: 2 }}>
      <WizardSectionHeader index={6} title={t("wizard.sections.storyInspiration")} subtitle={t("wizard.sections.storyInspirationSubtitle")} />
      <FormControl>
        <FormLabel sx={{ color: "text.secondary", mb: 1 }}>{t("wizard.storyInspiration.sectionTitle")}</FormLabel>
        <RadioGroup
          value={value}
          onChange={(e) => {
            const next = e.target.value as StoryInspirationLevel;
            patchDraft({
              preferences: {
                ...draft.preferences,
                storyInspirationLevel: next,
              },
            });
          }}
        >
          {levels.map((level) => (
            <FormControlLabel
              key={level}
              value={level}
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {t(`wizard.storyInspiration.${level}`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {t(LEVEL_HINT[level])}
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", ml: 0, mb: 1 }}
            />
          ))}
        </RadioGroup>
      </FormControl>
    </GlassPanel>
  );
};
