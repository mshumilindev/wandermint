import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import { Box, Button, Card, CardContent, Chip, Typography } from "@mui/material";
import type { MusicEventSuggestion } from "../../../services/events/musicEventTypes";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";

export type MusicInspiredSuggestionCardProps = {
  suggestion: MusicEventSuggestion;
  onAddToTrip?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
};

export const MusicInspiredSuggestionCard = ({
  suggestion,
  onAddToTrip,
  onDismiss,
  compact = false,
}: MusicInspiredSuggestionCardProps): JSX.Element => {
  const alt = `${suggestion.title} music-inspired travel suggestion`;
  return (
    <Card variant="outlined" sx={{ borderColor: "rgba(201, 184, 255, 0.28)", bgcolor: "rgba(8,12,20,0.55)" }}>
      <CardContent sx={{ display: "grid", gap: 1.25, p: compact ? 1.5 : 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Chip size="small" icon={<MusicNoteOutlinedIcon />} label="Music taste match" color="secondary" variant="outlined" />
          {suggestion.localDate ? (
            <Typography variant="caption" color="text.secondary">
              {suggestion.localDate}
              {suggestion.localTime ? ` · ${suggestion.localTime}` : ""}
            </Typography>
          ) : null}
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
          <EntityPreviewImage
            entityId={`music-suggestion:${suggestion.id}`}
            variant="optionPreview"
            title={suggestion.title}
            locationHint={suggestion.city ?? suggestion.country ?? ""}
            categoryHint="event"
            existingImageUrl={suggestion.imageUrl ?? null}
            alt={alt}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={800}>
              {suggestion.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {suggestion.reason}
            </Typography>
            {(suggestion.matchedArtistName || suggestion.matchedGenre) && (
              <Typography variant="caption" color="primary.main" sx={{ display: "block", mt: 0.5 }}>
                {[suggestion.matchedArtistName, suggestion.matchedGenre].filter(Boolean).join(" · ")}
              </Typography>
            )}
          </Box>
        </Box>
        {!compact ? (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {onAddToTrip ? (
              <Button size="small" variant="contained" onClick={onAddToTrip}>
                Add as optional
              </Button>
            ) : null}
            {onDismiss ? (
              <Button size="small" variant="text" onClick={onDismiss}>
                Dismiss
              </Button>
            ) : null}
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
};
