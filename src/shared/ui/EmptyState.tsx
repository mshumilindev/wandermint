import { Box, Button, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { GlassPanel } from "./GlassPanel";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export const EmptyState = ({ title, description, actionLabel, onAction, icon }: EmptyStateProps): JSX.Element => (
  <GlassPanel sx={{ p: 3, textAlign: "center" }}>
    <Box sx={{ display: "grid", placeItems: "center", gap: 1.5, maxWidth: 520, mx: "auto" }}>
      {icon}
      <Typography variant="h6">{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
      {actionLabel && onAction ? (
        <Button variant="contained" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Box>
  </GlassPanel>
);
