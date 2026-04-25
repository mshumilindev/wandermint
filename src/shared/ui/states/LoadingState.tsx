import { Box, CircularProgress, Skeleton, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { GlassPanel } from "../GlassPanel";

export interface LoadingStateProps {
  /** Short status line (pass translated copy from the route). */
  message?: string;
  /**
   * `panel` — glass card with skeletons (default full-region placeholder).
   * `embedded` — spinner + text for use inside an existing page shell (no blank screen).
   */
  layout?: "panel" | "embedded";
  /** Number of skeleton rows when `layout="panel"`. */
  skeletonRows?: number;
  sx?: SxProps<Theme>;
  /** Optional illustration or icon above the message. */
  adornment?: ReactNode;
  /** When `layout="embedded"`, hide the spinner (e.g. if the page already shows a linear progress bar). */
  showSpinner?: boolean;
}

/**
 * Use for every async view while data is in flight (Rule: no blank screens).
 */
export const LoadingState = ({
  message,
  layout = "panel",
  skeletonRows = 2,
  sx,
  adornment,
  showSpinner = true,
}: LoadingStateProps): JSX.Element => {
  if (layout === "embedded") {
    return (
      <Box
        role="status"
        aria-busy
        aria-live="polite"
        sx={{
          display: "grid",
          placeItems: "center",
          gap: 2,
          py: 4,
          px: 2,
          ...sx,
        }}
      >
        {adornment}
        {showSpinner ? <CircularProgress size={36} thickness={4} /> : null}
        {message ? (
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 420 }}>
            {message}
          </Typography>
        ) : null}
      </Box>
    );
  }

  return (
    <GlassPanel sx={{ p: 3, ...sx }} role="status" aria-busy aria-live="polite">
      <Box sx={{ display: "grid", gap: 2 }}>
        {adornment}
        <Skeleton variant="text" width="42%" height={34} />
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={84} />
        ))}
        {message ? (
          <Typography variant="body2" color="text.secondary">
            {message}
          </Typography>
        ) : null}
      </Box>
    </GlassPanel>
  );
};
