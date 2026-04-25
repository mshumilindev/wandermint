import Box from "@mui/material/Box";
import type { ReactNode } from "react";

type WizardActionsProps = {
  children: ReactNode;
  /** When true, pins actions on small screens so they stay reachable above iOS home indicator. */
  stickyOnMobile?: boolean;
};

export const WizardActions = ({ children, stickyOnMobile = true }: WizardActionsProps): JSX.Element => (
  <Box
    sx={{
      display: "flex",
      flexWrap: "wrap",
      gap: 1.5,
      justifyContent: "space-between",
      alignItems: "center",
      pt: 1,
      ...(stickyOnMobile
        ? {
            position: { xs: "sticky", md: "static" },
            bottom: { xs: 12, md: "auto" },
            zIndex: { xs: 5, md: "auto" },
            bgcolor: { xs: "rgba(3, 15, 23, 0.92)", md: "transparent" },
            backdropFilter: { xs: "blur(10px)", md: "none" },
            borderRadius: { xs: 2, md: 0 },
            px: { xs: 1, md: 0 },
            py: { xs: 1, md: 0 },
          }
        : {}),
    }}
  >
    {children}
  </Box>
);
