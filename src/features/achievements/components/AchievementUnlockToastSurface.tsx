import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import { Box, Button, IconButton, Paper, Typography } from "@mui/material";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { UiAchievementToast } from "../../../app/store/useUiStore";
import { getAchievementToastIconComponent } from "../achievementToastIcon";

const getCategoryGlow = (category: string): string => {
  switch (category) {
    case "travel":
      return "rgba(33, 220, 195, 0.45)";
    case "exploration":
      return "rgba(111, 195, 255, 0.5)";
    case "consistency":
      return "rgba(167, 139, 250, 0.45)";
    case "challenge":
      return "rgba(249, 115, 22, 0.45)";
    case "social":
      return "rgba(251, 113, 133, 0.45)";
    default:
      return "rgba(33, 220, 195, 0.4)";
  }
};

type Props = {
  achievement: UiAchievementToast;
  onClose: () => void;
};

export const AchievementUnlockToastSurface = ({ achievement, onClose }: Props) => {
  const { t } = useTranslation();

  const isSingle = achievement.kind === "single";
  const glow = isSingle ? getCategoryGlow(achievement.category) : "rgba(255, 183, 64, 0.42)";
  const IconComponent = isSingle ? getAchievementToastIconComponent(achievement.iconKey) : EmojiEventsRoundedIcon;
  const batchPreview = !isSingle ? [...(achievement.previewTitles ?? [])] : [];

  return (
    <Paper
      elevation={0}
      role="status"
      aria-live="polite"
      sx={{
        width: "100%",
        minWidth: { xs: 280, sm: 360 },
        maxWidth: 440,
        p: 2,
        pr: 1,
        display: "flex",
        gap: 1.75,
        alignItems: "flex-start",
        borderRadius: 2,
        border: "1px solid rgba(183, 237, 226, 0.22)",
        background:
          "linear-gradient(135deg, rgba(12, 28, 36, 0.94) 0%, rgba(8, 18, 28, 0.92) 55%, rgba(10, 22, 32, 0.96) 100%)",
        backdropFilter: "blur(18px)",
        boxShadow: `0 12px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          width: 52,
          height: 52,
          borderRadius: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `radial-gradient(circle at 30% 25%, ${glow}, rgba(3, 15, 23, 0.15) 70%)`,
          border: "1px solid rgba(255, 255, 255, 0.1)",
          color: "primary.light",
        }}
      >
        <IconComponent sx={{ fontSize: 28 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
        <Typography variant="caption" sx={{ color: "secondary.light", letterSpacing: 0.6, fontWeight: 700 }}>
          {t("achievements.toastBadgeLabel")}
        </Typography>
        {isSingle && achievement.tripLabel ? (
          <Typography variant="caption" component="p" sx={{ color: "text.secondary", mt: 0.25, mb: 0.25 }}>
            {t("achievements.toastTripContext", { trip: achievement.tripLabel })}
          </Typography>
        ) : null}
        {!isSingle && achievement.tripLabel ? (
          <Typography variant="caption" component="p" sx={{ color: "text.secondary", mt: 0.25, mb: 0.25 }}>
            {t("achievements.toastTripContext", { trip: achievement.tripLabel })}
          </Typography>
        ) : null}
        <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.25, mt: 0.25 }}>
          {isSingle ? achievement.title : t("achievements.toastBatchTitle", { count: achievement.count })}
        </Typography>
        {isSingle && achievement.description ? (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 0.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {achievement.description}
          </Typography>
        ) : null}
        {!isSingle && batchPreview.length > 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.75 }}>
            {batchPreview.join(" · ")}
            {achievement.count > batchPreview.length
              ? ` ${t("achievements.toastBatchMore", { count: achievement.count - batchPreview.length })}`
              : null}
          </Typography>
        ) : null}
        <Box sx={{ mt: 1.25, display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          <Button
            component={Link}
            to="/achievements"
            variant="contained"
            color="primary"
            size="small"
            onClick={onClose}
            sx={{ minHeight: 34, px: 1.5 }}
          >
            {t("achievements.toastViewCta")}
          </Button>
        </Box>
      </Box>
      <IconButton size="small" onClick={onClose} aria-label={t("common.close")} sx={{ color: "text.secondary", mt: -0.5 }}>
        <CloseRoundedIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
};
