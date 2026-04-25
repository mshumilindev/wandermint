import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Alert, Button, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";

export interface PartialDataStateProps {
  /** Short heading e.g. “Showing saved plan”. */
  title: string;
  description: string;
  onRefresh?: () => void | Promise<void>;
  refreshLabel?: string;
  severity?: "info" | "warning";
  icon?: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Stale cache, degraded fetch, or mixed success — user always sees context, not a silent gap.
 */
export const PartialDataState = ({
  title,
  description,
  onRefresh,
  refreshLabel = "Refresh",
  severity = "info",
  icon,
  sx,
}: PartialDataStateProps): JSX.Element => (
  <Alert
    severity={severity}
    variant="outlined"
    icon={icon ?? <InfoOutlinedIcon fontSize="inherit" />}
    sx={{
      alignItems: "flex-start",
      borderRadius: "var(--wm-radius-md)",
      ...sx,
    }}
  >
    <Stack spacing={1}>
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
      {onRefresh ? (
        <Button size="small" variant="outlined" onClick={() => void onRefresh()}>
          {refreshLabel}
        </Button>
      ) : null}
    </Stack>
  </Alert>
);
