import { Box, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../../app/store/useUiStore";
import type { StoryTravelExperience } from "../../../services/storyTravel/storyTravelTypes";
import { StoryExperienceCard } from "./StoryExperienceCard";
import { StoryExperienceDetailsDrawer } from "./StoryExperienceDetailsDrawer";

export interface StoryExperienceStripProps {
  title?: string;
  subtitle?: string;
  experiences: StoryTravelExperience[];
  /** When set, each card can dismiss itself for this option id (trip wizard). */
  dismissScopeId?: string;
  onDismissExperience?: (experienceId: string, scopeId?: string) => void;
}

export const StoryExperienceStrip = ({
  title,
  subtitle,
  experiences,
  dismissScopeId,
  onDismissExperience,
}: StoryExperienceStripProps): JSX.Element | null => {
  const { t } = useTranslation();
  const pushToast = useUiStore((s) => s.pushToast);
  const [drawerExperience, setDrawerExperience] = useState<StoryTravelExperience | null>(null);

  if (!experiences.length) {
    return null;
  }

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      {title ? (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      ) : null}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          pb: 0.5,
          scrollSnapType: "x mandatory",
          "& > *": { scrollSnapAlign: "start", flex: "0 0 auto" },
        }}
      >
        {experiences.map((exp) => (
          <StoryExperienceCard
            key={exp.id}
            experience={exp}
            compact
            onViewDetails={() => setDrawerExperience(exp)}
            onAddToItinerary={() =>
              pushToast({
                tone: "info",
                message: t("storyTravel.addToItineraryHint"),
              })
            }
            onSaveForLater={() =>
              pushToast({
                tone: "info",
                message: t("storyTravel.saveForLaterHint"),
              })
            }
            onDismiss={
              onDismissExperience
                ? () => {
                    onDismissExperience(exp.id, dismissScopeId);
                  }
                : undefined
            }
          />
        ))}
      </Box>
      <StoryExperienceDetailsDrawer open={Boolean(drawerExperience)} experience={drawerExperience} onClose={() => setDrawerExperience(null)} />
    </Box>
  );
};
