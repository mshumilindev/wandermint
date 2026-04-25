import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { StoryTravelExperience, StoryTravelLocationRelationship } from "../../../services/storyTravel/storyTravelTypes";

const relationshipLabel = (
  t: (k: string) => string,
  r: StoryTravelLocationRelationship,
): string => {
  const map: Record<StoryTravelLocationRelationship, string> = {
    confirmed_location: t("storyTravel.relationship.confirmed"),
    filming_location: t("storyTravel.relationship.filming"),
    author_biographical: t("storyTravel.relationship.author"),
    inspiration: t("storyTravel.relationship.inspiration"),
    vibe_match: t("storyTravel.relationship.vibe"),
    adaptation_related: t("storyTravel.relationship.adaptation"),
  };
  return map[r] ?? r;
};

interface StoryExperienceDetailsDrawerProps {
  open: boolean;
  experience: StoryTravelExperience | null;
  onClose: () => void;
}

export const StoryExperienceDetailsDrawer = ({ open, experience, onClose }: StoryExperienceDetailsDrawerProps): JSX.Element => {
  const { t } = useTranslation();
  const vibeOnly = experience?.locations.every((l) => l.relationship === "vibe_match") ?? false;

  return (
    <Drawer anchor="right" open={open && Boolean(experience)} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, p: 0 } }}>
      {experience ? (
        <Box sx={{ display: "grid", height: "100%", gridTemplateRows: "auto 1fr auto", minHeight: 0 }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, p: 2, pb: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="primary.light" sx={{ display: "block" }}>
                {experience.sourceTitle}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {experience.title}
              </Typography>
              {experience.subtitle ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {experience.subtitle}
                </Typography>
              ) : null}
            </Box>
            <IconButton edge="end" onClick={onClose} aria-label={t("common.cancel")}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Box sx={{ overflowY: "auto", px: 2, pb: 2, display: "grid", gap: 2 }}>
            {vibeOnly ? (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid rgba(255, 193, 7, 0.35)",
                  background: "rgba(255, 193, 7, 0.06)",
                }}
              >
                <Typography variant="body2" color="warning.light">
                  {t("storyTravel.vibeWarning")}
                </Typography>
              </Box>
            ) : null}
            <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
              {experience.explanation}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("storyTravel.destinationFitLabel")}: {t(`storyTravel.destinationFit.${experience.destinationFit}`)} ·{" "}
              {t("storyTravel.durationLabel")}: {t(`storyTravel.duration.${experience.recommendedDuration}`)} ·{" "}
              {t("storyTravel.confidenceLabel")}: {t(`common.level.${experience.confidence}`)}
            </Typography>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {t("storyTravel.locationsHeading")}
            </Typography>
            <List dense disablePadding sx={{ display: "grid", gap: 1.25 }}>
              {experience.locations.map((loc) => (
                <ListItem
                  key={loc.id}
                  disableGutters
                  sx={{
                    alignItems: "flex-start",
                    flexDirection: "column",
                    borderRadius: 2,
                    border: "1px solid rgba(255,255,255,0.08)",
                    p: 1.25,
                    background: "rgba(3, 15, 23, 0.45)",
                  }}
                >
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {loc.name}
                    </Typography>
                    <Chip size="small" label={relationshipLabel(t, loc.relationship)} variant="outlined" sx={{ height: 22 }} />
                  </Box>
                  <ListItemText
                    primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                    primary={loc.description}
                    secondary={[loc.city, loc.country].filter(Boolean).join(", ") || undefined}
                    secondaryTypographyProps={{ variant: "caption", color: "text.secondary" }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
          <Box sx={{ p: 2, pt: 0, display: "flex", justifyContent: "flex-end" }}>
            <Button variant="contained" onClick={onClose}>
              {t("storyTravel.close")}
            </Button>
          </Box>
        </Box>
      ) : (
        <Box />
      )}
    </Drawer>
  );
};
