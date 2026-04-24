import LandscapeRoundedIcon from "@mui/icons-material/LandscapeRounded";
import { Box, Typography, type SxProps, type Theme } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { wikimediaImageService } from "../../services/media/wikimediaImageService";

interface EntityPreviewImageProps {
  title: string;
  locationHint?: string;
  categoryHint?: string;
  alt: string;
  height?: number | string | Record<string, number | string>;
  aspectRatio?: string;
  sx?: SxProps<Theme>;
  compact?: boolean;
}

export const EntityPreviewImage = ({
  title,
  locationHint,
  categoryHint,
  alt,
  height = 188,
  aspectRatio,
  sx,
  compact = false,
}: EntityPreviewImageProps): JSX.Element => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const fallbackLabel = useMemo(() => title.split(/[,\s]+/).slice(0, 2).join(" "), [title]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }

        observer.disconnect();
        void wikimediaImageService.resolveImage({ title, locationHint, categoryHint }).then((resolved) => {
          setImageUrl(resolved);
          setReady(true);
        });
      },
      { rootMargin: "240px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [categoryHint, locationHint, title]);

  return (
    <Box
      ref={viewportRef}
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: compact ? 2.25 : 2.75,
        border: "1px solid rgba(183, 237, 226, 0.12)",
        background:
          "radial-gradient(circle at 18% 22%, rgba(33, 220, 195, 0.22), transparent 26%), radial-gradient(circle at 82% 14%, rgba(217, 162, 74, 0.18), transparent 22%), linear-gradient(180deg, rgba(7, 14, 20, 0.92), rgba(4, 9, 14, 0.98))",
        height,
        aspectRatio,
        minHeight: compact ? 88 : undefined,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
        ...sx,
      }}
    >
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt={alt}
          loading="lazy"
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "saturate(0.92) contrast(1.02) brightness(0.9)",
          }}
        />
      ) : null}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            imageUrl
              ? "linear-gradient(180deg, rgba(4, 9, 14, 0.08), rgba(4, 9, 14, 0.28) 48%, rgba(4, 9, 14, 0.72))"
              : "linear-gradient(180deg, rgba(4, 9, 14, 0.14), rgba(4, 9, 14, 0.46) 54%, rgba(4, 9, 14, 0.84))",
        }}
      />
      {!imageUrl ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "rgba(240, 248, 246, 0.84)",
            gap: 0.5,
          }}
        >
          <LandscapeRoundedIcon sx={{ fontSize: compact ? 26 : 34, opacity: ready ? 0.46 : 0.62 }} />
          <Typography variant={compact ? "caption" : "body2"} sx={{ letterSpacing: 0.4, opacity: 0.82 }}>
            {fallbackLabel}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
};
