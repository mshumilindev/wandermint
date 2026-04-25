import Chip from "@mui/material/Chip";

interface StoryExperienceBadgeProps {
  size?: "small" | "medium";
}

/** Inline marker for optional story-inspired enrichment (itinerary / lists). */
export const StoryExperienceBadge = ({ size = "small" }: StoryExperienceBadgeProps): JSX.Element => (
  <Chip
    size={size}
    label="Story"
    sx={{
      height: size === "small" ? 22 : 28,
      fontWeight: 700,
      letterSpacing: 0.02,
      background: "linear-gradient(120deg, rgba(0, 180, 216, 0.22), rgba(114, 9, 183, 0.28))",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "primary.light",
    }}
  />
);
