import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export const SectionHeader = ({ title, subtitle, action }: SectionHeaderProps): JSX.Element => (
  <Box sx={{ display: "flex", gap: 2, alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", flexDirection: { xs: "column", sm: "row" } }}>
    <Box>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      ) : null}
    </Box>
    {typeof action === "string" ? null : action}
  </Box>
);
