import type { PaperProps } from "@mui/material";
import type { ReactNode } from "react";
import { GlassPanel } from "../GlassPanel";

type WizardStepCardProps = PaperProps & {
  children: ReactNode;
  elevated?: boolean;
};

/** Primary glass panel for a wizard step — overflow visible so popovers escape. */
export const WizardStepCard = ({ children, elevated = true, sx, ...rest }: WizardStepCardProps): JSX.Element => (
  <GlassPanel elevated={elevated} {...rest} sx={{ overflow: "visible", p: { xs: 2.5, md: 3 }, display: "grid", gap: 2, ...sx }}>
    {children}
  </GlassPanel>
);
