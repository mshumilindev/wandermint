import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { NowLineProps } from "./DayTimeline.types";
import { computeTimelineNowLine } from "./timelinePositioning";

export type NowLineViewProps = NowLineProps & {
  windowStartMs: number;
  windowEndMs: number;
  trackHeightPx: number;
  /** When false, nothing is rendered (e.g. shared view without live status). */
  enabled: boolean;
};

/**
 * Horizontal “current time” marker on the day track, positioned from wall-clock time in `timezone`.
 */
export const NowLine = ({ enabled, ...rest }: NowLineViewProps): JSX.Element | null => {
  const { t } = useTranslation();
  if (!enabled) {
    return null;
  }
  const r = computeTimelineNowLine(rest);
  if (r.linePx == null) {
    return null;
  }
  return (
    <Box
      role="presentation"
      sx={{
        position: "absolute",
        left: 0,
        right: 0,
        top: r.linePx,
        height: 2,
        zIndex: 2,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
      }}
    >
      <Box sx={{ flex: 1, height: 2, bgcolor: "error.main", boxShadow: (th) => `0 0 0 1px ${alpha(th.palette.error.main, 0.35)}` }} />
      <Typography
        variant="caption"
        sx={{
          ml: 0.75,
          px: 0.75,
          py: 0.125,
          borderRadius: 1,
          fontWeight: 800,
          bgcolor: (th) => alpha(th.palette.error.main, 0.12),
          color: "error.main",
          flexShrink: 0,
        }}
      >
        {t("timelineVisual.now")}
      </Typography>
    </Box>
  );
};
