import { Chip } from "@mui/material";
import type { ReactElement } from "react";

interface MetadataPillProps {
  label: string;
  icon?: ReactElement;
  tone?: "default" | "amber" | "teal" | "danger";
}

const toneStyles = {
  default: { borderColor: "var(--wm-color-border)", color: "var(--wm-color-text-secondary)", background: "rgba(255,255,255,0.03)" },
  amber: { borderColor: "var(--wm-color-border-strong)", color: "var(--wm-color-accent-amber)", background: "var(--wm-color-accent-amber-soft)" },
  teal: { borderColor: "rgba(76, 156, 149, 0.34)", color: "var(--wm-color-accent-teal)", background: "rgba(76, 156, 149, 0.12)" },
  danger: { borderColor: "rgba(214, 111, 106, 0.38)", color: "var(--wm-color-error)", background: "rgba(214, 111, 106, 0.12)" },
} as const;

export const MetadataPill = ({ label, icon, tone = "default" }: MetadataPillProps): JSX.Element => (
  <Chip
    size="small"
    icon={icon}
    label={label}
    variant="outlined"
    sx={{
      ...toneStyles[tone],
      "& .MuiChip-icon": {
        color: "inherit",
      },
    }}
  />
);
