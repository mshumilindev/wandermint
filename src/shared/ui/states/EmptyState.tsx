import { Box, Button, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { GlassPanel } from "../GlassPanel";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon?: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Empty result or “nothing here yet” — always pair copy with a next step when possible.
 */
export const EmptyState = ({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  icon,
  sx,
}: EmptyStateProps): JSX.Element => (
  <GlassPanel sx={{ p: 3, textAlign: "center", ...sx }}>
    <Box sx={{ display: "grid", placeItems: "center", gap: 1.5, maxWidth: 520, mx: "auto" }}>
      {icon}
      <Typography variant="h6" component="h2">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center" sx={{ mt: 0.5 }}>
          {actionLabel && onAction ? (
            <Button variant="contained" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {secondaryActionLabel && onSecondaryAction ? (
            <Button variant="outlined" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  </GlassPanel>
);
