import Box from "@mui/material/Box";
import type { ReactNode } from "react";

export const WIZARD_MAX_WIDTH_PX = 1040;

type WizardShellProps = {
  children: ReactNode;
};

/** Shared max-width + spacing wrapper for multi-step flows (trip wizard, local planner, etc.). */
export const WizardShell = ({ children }: WizardShellProps): JSX.Element => (
  <Box
    sx={{
      width: "100%",
      maxWidth: WIZARD_MAX_WIDTH_PX,
      mx: "auto",
      display: "grid",
      gap: 3,
      px: { xs: 0, sm: 1 },
      pb: { xs: 10, md: 5 },
    }}
  >
    {children}
  </Box>
);
