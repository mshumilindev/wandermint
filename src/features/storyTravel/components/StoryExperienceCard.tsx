import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Box, Button, Card, CardActions, CardContent, Chip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { StoryTravelExperience } from "../../../services/storyTravel/storyTravelTypes";
import { resolveStoryExperienceImage } from "../../../services/storyTravel/storyTravelImageResolver";

export interface StoryExperienceCardProps {
  experience: StoryTravelExperience;
  onViewDetails: () => void;
  onAddToItinerary?: () => void;
  onSaveForLater?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

export const StoryExperienceCard = ({
  experience,
  onViewDetails,
  onAddToItinerary,
  onSaveForLater,
  onDismiss,
  compact = false,
}: StoryExperienceCardProps): JSX.Element => {
  const { t } = useTranslation();
  const img = resolveStoryExperienceImage(experience);

  return (
    <Card
      elevation={0}
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--wm-radius-md)",
        border: "1px solid var(--wm-glass-border)",
        background: "var(--wm-glass-panel)",
        display: "flex",
        flexDirection: "column",
        minHeight: compact ? 200 : 320,
        maxWidth: compact ? 280 : "100%",
      }}
    >
      <Box
        role="img"
        aria-label={img.alt}
        sx={{
          height: compact ? 120 : 168,
          position: "relative",
          backgroundColor: "rgba(4, 11, 19, 0.9)",
          backgroundImage: img.url ? `url(${img.url})` : img.background,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, transparent 0%, rgba(4, 11, 19, 0.92) 100%)",
          }}
        />
        <Box sx={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", gap: 1 }}>
          <Chip
            icon={<AutoStoriesRoundedIcon sx={{ "&&": { fontSize: 16 } }} />}
            label={t("storyTravel.badge")}
            size="small"
            sx={{
              fontWeight: 800,
              backdropFilter: "blur(8px)",
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          />
          {onDismiss ? (
            <Button size="small" color="inherit" onClick={onDismiss} sx={{ minWidth: 0, px: 1, color: "common.white" }}>
              {t("storyTravel.dismiss")}
            </Button>
          ) : null}
        </Box>
        <Box sx={{ position: "absolute", bottom: 12, left: 14, right: 14 }}>
          <Typography variant="caption" color="primary.light" sx={{ fontWeight: 700, display: "block" }}>
            {experience.sourceTitle}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2, textShadow: "0 2px 12px rgba(0,0,0,0.65)" }}>
            {experience.title}
          </Typography>
        </Box>
      </Box>
      <CardContent sx={{ flex: 1, display: "grid", gap: 1, pt: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: compact ? 2 : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {experience.explanation}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          <Chip size="small" variant="outlined" label={t(`storyTravel.destinationFit.${experience.destinationFit}`)} />
          <Chip size="small" variant="outlined" label={t(`storyTravel.duration.${experience.recommendedDuration}`)} />
          <Chip size="small" variant="outlined" label={t("storyTravel.locationsCount", { count: experience.locations.length })} />
        </Box>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, pt: 0, display: "flex", flexWrap: "wrap", gap: 1 }}>
        <Button size="small" variant="contained" startIcon={<VisibilityOutlinedIcon />} onClick={onViewDetails}>
          {t("storyTravel.viewDetails")}
        </Button>
        {onAddToItinerary ? (
          <Button size="small" variant="outlined" startIcon={<PlaylistAddOutlinedIcon />} onClick={onAddToItinerary}>
            {t("storyTravel.addToItinerary")}
          </Button>
        ) : null}
        {onSaveForLater ? (
          <Button size="small" variant="text" startIcon={<BookmarkAddOutlinedIcon />} onClick={onSaveForLater}>
            {t("storyTravel.saveForLater")}
          </Button>
        ) : null}
      </CardActions>
    </Card>
  );
};
