import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import { Alert, Button, Stack, Typography } from "@mui/material";
import type { AlertProps } from "@mui/material/Alert";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";

export interface OfflineStateProps {
  message: string;
  /**
   * `banner` — full-width emphasis for top of screen.
   * `inline` — compact row inside a section.
   */
  variant?: "banner" | "inline";
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  icon?: ReactNode;
  severity?: AlertProps["severity"];
  sx?: SxProps<Theme>;
}

/**
 * Always-visible offline notice so restricted / queued behavior is never ambiguous.
 */
export const OfflineState = ({
  message,
  variant = "banner",
  actionLabel,
  onAction,
  icon,
  severity = "warning",
  sx,
}: OfflineStateProps): JSX.Element => (
  <Alert
    severity={severity}
    variant={variant === "banner" ? "filled" : "standard"}
    icon={icon ?? <CloudOffOutlinedIcon fontSize="inherit" />}
    role="status"
    sx={{
      width: "100%",
      maxWidth: variant === "banner" ? 960 : undefined,
      alignItems: "flex-start",
      ...(variant === "inline"
        ? {
            py: 0.75,
            "& .MuiAlert-message": { py: 0.5 },
          }
        : {}),
      ...sx,
    }}
  >
    <Stack spacing={1} alignItems="flex-start" sx={{ width: "100%" }}>
      <Typography variant="body2" component="div" sx={{ fontWeight: variant === "banner" ? 600 : 500 }}>
        {message}
      </Typography>
      {actionLabel && onAction ? (
        <Button size="small" color="inherit" variant="outlined" onClick={() => void onAction()}>
          {actionLabel}
        </Button>
      ) : null}
    </Stack>
  </Alert>
);
