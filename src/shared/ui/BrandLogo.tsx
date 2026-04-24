import { Box, Typography } from "@mui/material";
import { brandAssets, productConfig } from "../config/product";

interface BrandLogoProps {
  compact?: boolean;
  markSize?: number;
}

export const BrandLogo = ({ compact = false, markSize = 42 }: BrandLogoProps): JSX.Element => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, minWidth: 0 }}>
    <Box
      component="img"
      src={brandAssets.logo}
      alt=""
      sx={{
        width: markSize,
        height: markSize,
        objectFit: "contain",
        filter: "drop-shadow(0 0 18px rgba(33, 220, 195, 0.26))",
        flexShrink: 0,
      }}
    />
    {!compact ? (
      <Typography
        variant="h6"
        sx={{
          lineHeight: 1,
          fontWeight: 800,
          color: "var(--wm-color-text-primary)",
          "& span": { color: "var(--wm-color-mint)" },
        }}
      >
        {productConfig.wordmarkPrefix}
        <span>{productConfig.wordmarkAccent}</span>
      </Typography>
    ) : (
      <Typography component="span" sx={{ display: "none" }}>
        {productConfig.appName}
      </Typography>
    )}
  </Box>
);
