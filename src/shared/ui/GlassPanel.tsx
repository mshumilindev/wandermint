import { Paper, type PaperProps } from "@mui/material";
import type { ReactNode } from "react";

interface GlassPanelProps extends PaperProps {
  children: ReactNode;
  elevated?: boolean;
}

export const GlassPanel = ({ children, elevated = false, sx, ...paperProps }: GlassPanelProps): JSX.Element => (
  <Paper
    {...paperProps}
    sx={{
      borderRadius: "var(--wm-radius-md)",
      background: elevated ? "var(--wm-glass-panel-strong)" : "var(--wm-glass-panel)",
      backdropFilter: "var(--wm-blur-panel)",
      boxShadow: elevated ? "var(--wm-shadow-panel)" : "var(--wm-shadow-soft)",
      border: "1px solid var(--wm-glass-border)",
      position: "relative",
      overflow: "hidden",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        boxShadow: "var(--wm-glass-highlight)",
      },
      ...sx,
    }}
  >
    {children}
  </Paper>
);
