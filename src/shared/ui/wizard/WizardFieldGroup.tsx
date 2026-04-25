import Grid from "@mui/material/Grid";
import type { ReactNode } from "react";

type WizardFieldGroupProps = {
  children: ReactNode;
};

/** Responsive field row with consistent gutters — use inside wizard cards. */
export const WizardFieldGroup = ({ children }: WizardFieldGroupProps): JSX.Element => (
  <Grid container spacing={2} sx={{ overflow: "visible" }}>
    {children}
  </Grid>
);
