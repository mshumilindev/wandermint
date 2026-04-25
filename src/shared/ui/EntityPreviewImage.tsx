import LandscapeRoundedIcon from "@mui/icons-material/LandscapeRounded";
import { Box, Typography, type SxProps, type Theme } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import {
  buildEntityImageAlt,
  ENTITY_IMAGE_VARIANT_LAYOUT,
  getEntityImagePlaceholderCss,
  resolveEntityImage,
  type EntityImageVariant,
  type ResolvedEntityImage,
} from "../../services/media/entityImageResolver";

interface EntityPreviewImageProps {
  /** Visual preset: aspect ratio, thumb sizes, layout reserve */
  variant?: EntityImageVariant;
  /** Stable id for universal image cache (trip, activity, event, etc.). */
  entityId?: string;
  title: string;
  locationHint?: string;
  categoryHint?: string;
  alt?: string;
  existingImageUrl?: string | null;
  apiImageUrl?: string | null;
  providerImageUrl?: string | null;
  googlePlacesPhotoUrl?: string | null;
  latitude?: number;
  longitude?: number;
  sx?: SxProps<Theme>;
  /** @deprecated Use variant="compact" instead */
  compact?: boolean;
}

export const EntityPreviewImage = ({
  variant: variantProp = "tripCard",
  entityId,
  title,
  locationHint,
  categoryHint,
  alt,
  existingImageUrl,
  apiImageUrl,
  providerImageUrl,
  googlePlacesPhotoUrl,
  latitude,
  longitude,
  sx,
  compact = false,
}: EntityPreviewImageProps): JSX.Element => {
  const variant: EntityImageVariant = compact ? "compact" : variantProp;
  const layout = ENTITY_IMAGE_VARIANT_LAYOUT[variant];
  const [resolved, setResolved] = useState<ResolvedEntityImage | null>(null);
  const [broken, setBroken] = useState(false);

  const resolvedAlt = useMemo(
    () => alt ?? buildEntityImageAlt(title, locationHint, categoryHint),
    [alt, title, locationHint, categoryHint],
  );

  const fallbackLabel = useMemo(() => title.split(/[,\s]+/).slice(0, 2).join(" "), [title]);

  const placeholderCss = useMemo(() => getEntityImagePlaceholderCss(title, categoryHint), [title, categoryHint]);

  useEffect(() => {
    setBroken(false);
    setResolved(null);
  }, [
    entityId,
    title,
    locationHint,
    categoryHint,
    existingImageUrl,
    apiImageUrl,
    providerImageUrl,
    googlePlacesPhotoUrl,
    latitude,
    longitude,
    variant,
  ]);

  useEffect(() => {
    let active = true;
    void resolveEntityImage({
      entityId,
      title,
      locationHint,
      categoryHint,
      existingImageUrl: existingImageUrl ?? undefined,
      apiImageUrl: apiImageUrl ?? undefined,
      providerImageUrl: providerImageUrl ?? undefined,
      googlePlacesPhotoUrl: googlePlacesPhotoUrl ?? undefined,
      latitude,
      longitude,
      variant,
    }).then((next) => {
      if (active) {
        setResolved(next);
      }
    });
    return () => {
      active = false;
    };
  }, [
    entityId,
    categoryHint,
    existingImageUrl,
    apiImageUrl,
    providerImageUrl,
    googlePlacesPhotoUrl,
    latitude,
    longitude,
    locationHint,
    title,
    variant,
  ]);

  const showImage = Boolean(resolved?.primaryUrl) && !broken;
  const underlayCss = resolved?.fallbackCss ?? placeholderCss;
  const loading = resolved === null;

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: variant === "compact" ? 2.25 : 2.75,
        border: "1px solid rgba(183, 237, 226, 0.12)",
        background: underlayCss,
        width: "100%",
        aspectRatio: layout.aspectRatio,
        minHeight: layout.minHeight,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
        ...sx,
      }}
    >
      {loading ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(110deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0) 78%)",
            backgroundSize: "200% 100%",
            animation: "wmEntityImgShimmer 1.1s ease-in-out infinite",
            "@keyframes wmEntityImgShimmer": {
              "0%": { backgroundPosition: "200% 0" },
              "100%": { backgroundPosition: "-200% 0" },
            },
          }}
        />
      ) : null}

      {showImage ? (
        <Box
          component="img"
          src={resolved?.primaryUrl ?? undefined}
          srcSet={resolved?.srcSet}
          sizes={resolved?.sizes}
          alt={resolvedAlt}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            filter: "saturate(0.96) contrast(1.02) brightness(0.96)",
          }}
        />
      ) : null}

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            showImage
              ? "linear-gradient(180deg, rgba(4, 9, 14, 0.08), rgba(4, 9, 14, 0.28) 48%, rgba(4, 9, 14, 0.72))"
              : "linear-gradient(180deg, rgba(4, 9, 14, 0.14), rgba(4, 9, 14, 0.46) 54%, rgba(4, 9, 14, 0.84))",
        }}
      />

      {!showImage ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "rgba(240, 248, 246, 0.84)",
            gap: 0.5,
            px: 1,
          }}
        >
          <LandscapeRoundedIcon sx={{ fontSize: variant === "compact" || variant === "activityThumb" ? 26 : 34, opacity: loading ? 0.5 : 0.62 }} />
          <Typography
            variant={variant === "compact" || variant === "activityThumb" ? "caption" : "body2"}
            sx={{ letterSpacing: 0.4, opacity: 0.82, textAlign: "center", maxWidth: "100%" }}
          >
            {fallbackLabel}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
};
