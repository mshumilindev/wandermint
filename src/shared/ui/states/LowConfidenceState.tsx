import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import { Box, Chip, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";

export interface LowConfidenceStateProps {
  title: string;
  description?: string;
  children?: ReactNode;
  /** Optional short label shown as a chip (translated). */
  chipLabel?: string;
  sx?: SxProps<Theme>;
}

/**
 * Wrap AI- or data-backed content so low-trust output is visibly flagged (not identical to “sure” data).
 */
export const LowConfidenceState = ({ title, description, children, chipLabel, sx }: LowConfidenceStateProps): JSX.Element => (
  <Box
    sx={{
      position: "relative",
      borderRadius: "var(--wm-radius-md)",
      border: "1px dashed rgba(255, 183, 77, 0.55)",
      background: "linear-gradient(135deg, rgba(255, 183, 77, 0.08), transparent 42%)",
      p: 2,
      ...sx,
    }}
  >
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: description || children ? 1.5 : 0 }}>
      <PsychologyOutlinedIcon sx={{ color: "warning.light", mt: 0.15 }} fontSize="small" aria-hidden />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" fontWeight={800} component="h3">
            {title}
          </Typography>
          {chipLabel ? <Chip size="small" color="warning" variant="outlined" label={chipLabel} /> : null}
        </Stack>
        {description ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {description}
          </Typography>
        ) : null}
      </Box>
    </Stack>
    {children}
  </Box>
);
