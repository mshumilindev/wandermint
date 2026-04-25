import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { Box, Button, Collapse, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { useState } from "react";
import { getErrorDevDetails, getErrorMessage } from "../../lib/errors";
import { GlassPanel } from "../GlassPanel";

export interface ErrorStateProps {
  /** Short heading (translated). */
  title?: string;
  /**
   * Safe user-facing explanation. When omitted, a friendly line is derived from `error`
   * via {@link getErrorMessage} — never the raw exception text in production UI.
   */
  message?: string;
  /** Original error for friendly mapping and optional dev-only details. */
  error?: unknown;
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  icon?: ReactNode;
  sx?: SxProps<Theme>;
}

const defaultTitle = "Something went wrong";

/**
 * Recoverable failures: friendly copy + optional retry. No raw stack traces for users.
 */
export const ErrorState = ({
  title = defaultTitle,
  message,
  error,
  onRetry,
  retryLabel = "Try again",
  icon,
  sx,
}: ErrorStateProps): JSX.Element => {
  const [devOpen, setDevOpen] = useState(false);
  const friendly = message ?? (error !== undefined ? getErrorMessage(error) : "We could not complete that just now. Please try again.");
  const devDetails = import.meta.env.DEV && error !== undefined ? getErrorDevDetails(error) : undefined;

  return (
    <GlassPanel sx={{ p: 3, ...sx }}>
      <Stack spacing={2} alignItems="flex-start" sx={{ maxWidth: 560, mx: "auto" }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {icon ?? <ErrorOutlineRoundedIcon color="error" sx={{ mt: 0.25 }} aria-hidden />}
          <Box>
            <Typography variant="h6" component="h2" gutterBottom>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {friendly}
            </Typography>
          </Box>
        </Stack>
        {onRetry ? (
          <Button variant="contained" color="primary" onClick={() => void onRetry()}>
            {retryLabel}
          </Button>
        ) : null}
        {devDetails ? (
          <Box sx={{ width: "100%" }}>
            <Button size="small" variant="text" onClick={() => setDevOpen((v) => !v)} sx={{ alignSelf: "flex-start" }}>
              {devOpen ? "Hide" : "Show"} technical details (dev only)
            </Button>
            <Collapse in={devOpen}>
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  mt: 1,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {devDetails}
              </Typography>
            </Collapse>
          </Box>
        ) : null}
      </Stack>
    </GlassPanel>
  );
};
