import { Box, Typography, type SxProps, type Theme } from "@mui/material";
import { useTranslation } from "react-i18next";
import { brandAssets } from "../config/product";

interface BrandExperienceHeroProps {
  variant?: "auth" | "standard";
  sx?: SxProps<Theme>;
}

export const BrandExperienceHero = ({ variant = "standard", sx }: BrandExperienceHeroProps): JSX.Element => {
  const { t } = useTranslation();
  const isAuth = variant === "auth";

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        borderRadius: { xs: "var(--wm-radius-md)", md: "var(--wm-radius-lg)" },
        border: "1px solid rgba(183, 237, 226, 0.2)",
        boxShadow: "0 34px 110px rgba(0, 0, 0, 0.7), 0 0 70px rgba(33, 220, 195, 0.12)",
        background: "var(--wm-color-night)",
        aspectRatio: "1920 / 819",
        minHeight: isAuth ? { xs: 240, sm: 420, md: 560 } : { xs: 220, sm: 320, md: 440 },
        maxHeight: isAuth ? { lg: 660 } : undefined,
        display: "grid",
        placeItems: "center",
        ...sx,
      }}
    >
      <Box
        component="img"
        src={brandAssets.banner}
        alt={t("brand.heroAlt")}
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: { xs: "contain", md: "cover" },
          objectPosition: "center",
        }}
      />
      <Box
        sx={{
          position: "absolute",
        inset: 0,
        background:
            "linear-gradient(180deg, rgba(3, 15, 23, 0.1), rgba(3, 15, 23, 0.18) 44%, rgba(3, 15, 23, 0.38)), radial-gradient(circle at center, rgba(3, 15, 23, 0.05), rgba(3, 15, 23, 0.42) 76%)",
        }}
      />
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: isAuth ? { xs: 1.75, sm: 3.5, md: 4.5 } : { xs: 1.5, sm: 2.4, md: 3.4 },
          textAlign: { xs: "center", sm: "left" },
          flexDirection: { xs: "column", sm: "row" },
          px: { xs: 2, md: 5 },
          transform: isAuth ? { xs: "translateY(-2%)", md: "translateY(-4%)" } : { xs: "translateY(-1%)", md: "translateY(-3%)" },
          width: "100%",
        }}
      >
        <Box
          component="img"
          src={brandAssets.logo}
          alt=""
          sx={{
            width: isAuth ? { xs: 92, sm: 150, md: 188 } : { xs: 78, sm: 112, md: 142 },
            height: isAuth ? { xs: 92, sm: 150, md: 188 } : { xs: 78, sm: 112, md: 142 },
            objectFit: "contain",
            filter: "drop-shadow(0 0 24px rgba(33, 220, 195, 0.24))",
            flexShrink: 0,
          }}
        />
        <Box sx={{ display: "grid", gap: isAuth ? { xs: 1, md: 1.1 } : { xs: 0.8, md: 1 }, maxWidth: isAuth ? { xs: 560, md: 860 } : { xs: 500, md: 680 } }}>
          <Typography
            aria-hidden="true"
            sx={{
              fontSize: isAuth ? { xs: 44, sm: 78, md: 112 } : { xs: 36, sm: 58, md: 76 },
              lineHeight: 0.92,
              fontWeight: 800,
              color: "var(--wm-color-text-primary)",
              textShadow: "0 14px 32px rgba(0, 0, 0, 0.5)",
              "& span": { color: "var(--wm-color-mint)" },
            }}
          >
            Wander<span>Mint</span>
          </Typography>
          <Typography
            aria-hidden="true"
            sx={{
              fontSize: isAuth ? { xs: 10, sm: 11, md: 14 } : { xs: 8, sm: 8, md: 8 },
              lineHeight: 1.45,
              fontWeight: 800,
              letterSpacing: isAuth ? { xs: 1.7, sm: 4.2, md: 6.2 } : { xs: 1.2, sm: 3, md: 4.8 },
              textTransform: "uppercase",
              color: "rgba(243, 239, 231, 0.92)",
              maxWidth: "100%",
              whiteSpace: { xs: "normal", md: "nowrap" },
              "& .explore": { color: "#8b85fc" },
              "& .more": { color: "var(--wm-color-text-primary)" },
              "& .plan": { color: "var(--wm-color-mint)" },
              "& .experience": { color: "var(--wm-color-accent-amber)" },
            }}
          >
            <Box component="span" className="explore">Explore</Box>{" "}
            <Box component="span" className="more">more.</Box>{" "}
            <Box component="span" className="plan">Plan</Box> smarter.{" "}
            <Box component="span" className="experience">Experience</Box> better.
          </Typography>
        </Box>
      </Box>
      <Typography
        component="h1"
        sx={{
          position: "absolute",
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {t("brand.heroAccessible")}
      </Typography>
    </Box>
  );
};
