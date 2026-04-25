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
  const capabilityHints = [
    t("brand.capabilities.adaptiveSuggestions"),
    t("brand.capabilities.liveContext"),
    t("brand.capabilities.costAware"),
    t("brand.capabilities.builtAroundYou"),
  ];

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
        isolation: "isolate",
        transition: "background 260ms ease, box-shadow 260ms ease",
        "&:hover .wm-hero-light-shift": {
          opacity: 0.92,
        },
        "&:hover .wm-hero-logo-glow": {
          opacity: 1,
        },
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
          objectFit: "cover",
          objectPosition: "center",
          filter: "saturate(1.04) contrast(1.06) brightness(0.94)",
          transform: "scale(1.015)",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.06) 42%, rgba(0, 0, 0, 0.6) 100%)",
          zIndex: 0,
        }}
      />
      <Box
        className="wm-hero-light-shift"
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.7,
          transition: "opacity 340ms ease",
          background:
            "radial-gradient(circle at 78% 14%, rgba(33, 220, 195, 0.18), transparent 36%), radial-gradient(circle at 20% 84%, rgba(245, 138, 44, 0.12), transparent 34%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <Box
        component="svg"
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        aria-hidden
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          top: { xs: "22%", md: "18%" },
          width: "100%",
          height: { xs: 72, sm: 84, md: 96 },
          opacity: 0.5,
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <path d="M 0 18 C 16 4, 30 6, 44 17 S 72 27, 100 10" fill="none" stroke="rgba(183, 237, 226, 0.35)" strokeWidth="0.26" />
        <path
          d="M 0 18 C 16 4, 30 6, 44 17 S 72 27, 100 10"
          fill="none"
          stroke="rgba(183, 237, 226, 0.7)"
          strokeWidth="0.22"
          strokeDasharray="1.2 1.5"
          sx={{
            animation: "wmHeroPathFlow 14s linear infinite",
            "@keyframes wmHeroPathFlow": {
              "0%": { strokeDashoffset: 0 },
              "100%": { strokeDashoffset: -18 },
            },
          }}
        />
      </Box>
      <Box
        sx={{
          position: "absolute",
          top: { xs: 12, sm: 14, md: 16 },
          left: { xs: 16, sm: 18, md: 24 },
          display: "flex",
          gap: 1.25,
          zIndex: 2,
          opacity: 0.52,
          pointerEvents: "none",
        }}
      >
        <Typography variant="caption" sx={{ letterSpacing: 2.6, textTransform: "uppercase", color: "rgba(228, 241, 237, 0.88)" }}>
          {t("brand.subtleLabelExplore")}
        </Typography>
        <Typography variant="caption" sx={{ letterSpacing: 2.6, textTransform: "uppercase", color: "rgba(228, 241, 237, 0.88)" }}>
          {t("brand.subtleLabelExperience")}
        </Typography>
      </Box>
      <Box
        sx={{
          position: "relative",
          zIndex: 2,
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
          sx={{
            position: "relative",
            width: isAuth ? { xs: 92, sm: 150, md: 188 } : { xs: 78, sm: 112, md: 142 },
            height: isAuth ? { xs: 92, sm: 150, md: 188 } : { xs: 78, sm: 112, md: 142 },
            flexShrink: 0,
          }}
        >
          <Box
            className="wm-hero-logo-glow"
            sx={{
              position: "absolute",
              inset: "-12%",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(33, 220, 195, 0.34) 0%, rgba(33, 220, 195, 0.08) 52%, transparent 78%)",
              opacity: 0.78,
              filter: "blur(10px)",
              transition: "opacity 320ms ease",
              animation: "wmHeroLogoGlow 6.2s ease-in-out infinite",
              "@keyframes wmHeroLogoGlow": {
                "0%, 100%": { transform: "scale(0.95)", opacity: 0.7 },
                "50%": { transform: "scale(1.05)", opacity: 1 },
              },
            }}
          />
          <Box
            component="img"
            src={brandAssets.logo}
            alt=""
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              position: "relative",
              filter: "drop-shadow(0 0 24px rgba(33, 220, 195, 0.26))",
            }}
          />
        </Box>
        <Box sx={{ display: "grid", gap: isAuth ? { xs: 1, md: 1.1 } : { xs: 0.8, md: 1 }, maxWidth: isAuth ? { xs: 560, md: 860 } : { xs: 500, md: 680 } }}>
          <Typography
            aria-hidden="true"
            sx={{
              fontSize: isAuth ? { xs: 44, sm: 78, md: 112 } : { xs: 36, sm: 58, md: 76 },
              lineHeight: 0.92,
              fontWeight: 800,
              color: "var(--wm-color-text-primary)",
              textShadow: "0 14px 32px rgba(0, 0, 0, 0.58)",
              "& .mint": {
                background: "linear-gradient(90deg, #8ff1e1 0%, #4ee5ce 52%, #27cbb7 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              },
            }}
          >
            Wander<span className="mint">Mint</span>
          </Typography>
          <Typography
            sx={{
              fontSize: isAuth ? { xs: 15, sm: 22, md: 30 } : { xs: 14, sm: 20, md: 28 },
              lineHeight: 1.2,
              fontWeight: 600,
              color: "rgba(242, 248, 246, 0.96)",
              textShadow: "0 8px 24px rgba(0, 0, 0, 0.48)",
            }}
          >
            {t("brand.heroPositioning")}
          </Typography>
          <Typography
            sx={{
              fontSize: isAuth ? { xs: 11, sm: 12, md: 13 } : { xs: 10, sm: 11, md: 12 },
              lineHeight: 1.45,
              fontWeight: 500,
              letterSpacing: { xs: 1.2, sm: 1.8, md: 2.4 },
              textTransform: "uppercase",
              color: "rgba(233, 241, 238, 0.82)",
              maxWidth: "100%",
              whiteSpace: { xs: "normal", md: "nowrap" },
            }}
          >
            {t("brand.heroSubline")}
          </Typography>
        </Box>
      </Box>
      {!isAuth ? (
        <Box
          sx={{
            position: "absolute",
            left: { xs: 14, sm: 20, md: 26 },
            right: { xs: 14, sm: 20, md: 26 },
            bottom: { xs: 12, sm: 14, md: 18 },
            zIndex: 2,
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
            gap: { xs: 0.6, sm: 1, md: 1.2 },
          }}
        >
          {capabilityHints.map((label) => (
            <Box
              key={label}
              sx={{
                borderRadius: 999,
                border: "1px solid rgba(183, 237, 226, 0.14)",
                background: "rgba(7, 16, 23, 0.34)",
                px: { xs: 1, sm: 1.25, md: 1.5 },
                py: { xs: 0.5, sm: 0.65, md: 0.75 },
                minWidth: 0,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "rgba(228, 240, 236, 0.72)",
                  fontWeight: 500,
                  letterSpacing: 0.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : null}
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
