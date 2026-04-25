import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { Box, Typography } from "@mui/material";

interface MiniMapPreviewProps {
  coordinates?: { lat: number; lng: number };
  label?: string;
  city?: string;
  country?: string;
}

export const MiniMapPreview = ({ coordinates, label, city, country }: MiniMapPreviewProps): JSX.Element => {
  if (!coordinates) {
    return (
      <Box
        aria-label="Mini map preview placeholder"
        sx={{
          height: 190,
          borderRadius: 2.5,
          border: "1px solid rgba(183, 237, 226, 0.16)",
          background:
            "linear-gradient(180deg, rgba(4, 12, 19, 0.82), rgba(4, 10, 16, 0.96)), linear-gradient(90deg, rgba(183,237,226,0.04) 1px, transparent 1px), linear-gradient(rgba(183,237,226,0.04) 1px, transparent 1px)",
          backgroundSize: "auto, 28px 28px, 28px 28px",
          display: "grid",
          placeItems: "center",
          px: 2,
          textAlign: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Select a location to preview it on the map
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      role="img"
      aria-label={`Mini map preview for ${city ?? label ?? "selected location"}`}
      sx={{
        position: "relative",
        height: 190,
        borderRadius: 2.5,
        border: "1px solid rgba(183, 237, 226, 0.16)",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 65% 28%, rgba(33, 220, 195, 0.2), transparent 45%), linear-gradient(180deg, rgba(3, 15, 23, 0.7), rgba(3, 10, 18, 0.92))",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(183, 237, 226, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(183, 237, 226, 0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.5,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 28,
          height: 28,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          color: "primary.main",
          border: "1px solid rgba(33, 220, 195, 0.45)",
          background: "rgba(33, 220, 195, 0.16)",
          boxShadow: "0 0 24px rgba(33, 220, 195, 0.35)",
        }}
      >
        <PlaceOutlinedIcon fontSize="small" />
      </Box>
      <Box
        sx={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 10,
          borderRadius: 1.5,
          border: "1px solid rgba(183, 237, 226, 0.12)",
          background: "rgba(5, 14, 20, 0.72)",
          px: 1.2,
          py: 0.8,
        }}
      >
        <Typography variant="caption" sx={{ color: "text.primary", fontWeight: 600 }}>
          {label ?? [city, country].filter(Boolean).join(", ")}
        </Typography>
      </Box>
    </Box>
  );
};
