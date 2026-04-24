import { Box, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";
import { brandAssets } from "../config/product";

interface BrandBannerPanelProps {
  children: ReactNode;
  minHeight?: number;
  sx?: SxProps<Theme>;
}

export const BrandBannerPanel = ({ children, minHeight = 320, sx }: BrandBannerPanelProps): JSX.Element => (
  <Box
    sx={{
      position: "relative",
      overflow: "hidden",
      borderRadius: "var(--wm-radius-lg)",
      minHeight,
      p: { xs: 2.5, md: 3.5 },
      display: "grid",
      alignContent: "space-between",
      border: "1px solid var(--wm-color-border)",
      boxShadow: "var(--wm-shadow-panel)",
      backgroundImage: `linear-gradient(90deg, rgba(5, 9, 13, 0.94) 0%, rgba(5, 9, 13, 0.76) 45%, rgba(5, 9, 13, 0.28) 100%), url(${brandAssets.banner})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      "&::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background:
          "radial-gradient(circle at 16% 22%, rgba(33, 220, 195, 0.18), transparent 22%), radial-gradient(circle at 76% 10%, rgba(255, 183, 64, 0.16), transparent 18%)",
      },
      ...sx,
    }}
  >
    <Box sx={{ position: "relative", zIndex: 1, display: "grid", gap: 2 }}>{children}</Box>
  </Box>
);
