import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Box, Drawer, IconButton, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TravelMemory } from "../../../entities/travel-memory/model";
import type { EntityMediaAttachment } from "../../../entities/media/model";
import { nowIso } from "../../../services/firebase/timestampMapper";
import { formatTravelMemoryRange } from "../../../shared/lib/formatTravelMemoryRange";
import { CountryFlag } from "../../../shared/ui/CountryFlag";
import { EntityInstagramMediaStrip } from "../../../shared/ui/EntityInstagramMediaStrip";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { MemoryRoutePreview } from "../../../shared/ui/MemoryRoutePreview";
import { StyleBadge } from "../../../shared/ui/StyleBadge";
import type { TravelMapPoint } from "../services/travelMapService";

interface TravelMemoryDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  memory: TravelMemory | null;
  point: TravelMapPoint | null;
  onMemoryUpdate?: (memory: TravelMemory) => void | Promise<void>;
  instagramConnected?: boolean;
  onInstagramConnected?: () => void;
}

export const TravelMemoryDetailDrawer = ({
  open,
  onClose,
  memory,
  point,
  onMemoryUpdate,
  instagramConnected = false,
  onInstagramConnected,
}: TravelMemoryDetailDrawerProps): JSX.Element => {
  const { t } = useTranslation();

  const persistAttachments = (next: EntityMediaAttachment[]): void => {
    if (!memory) {
      return;
    }
    void onMemoryUpdate?.({ ...memory, mediaAttachments: next, updatedAt: nowIso() });
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 400, md: 420 },
          p: 0,
          background: "var(--wm-dropdown-surface, rgba(6, 14, 20, 0.96))",
          borderLeft: "1px solid rgba(183, 237, 226, 0.14)",
          backdropFilter: "blur(16px)",
        },
      }}
    >
      {memory && point ? (
        <Box sx={{ display: "grid", height: "100%", gridTemplateRows: "auto 1fr" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 2, py: 1.5, borderBottom: "1px solid rgba(183, 237, 226, 0.1)" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t("travelStats.memoryDrawerTitle")}
            </Typography>
            <IconButton size="small" edge="end" aria-label={t("travelStats.memoryDrawerClose")} onClick={onClose}>
              <CloseRoundedIcon sx={{ color: "text.secondary" }} />
            </IconButton>
          </Box>
          <Box
            sx={{
              overflowY: "auto",
              p: 2,
              pt: 1.5,
              display: "grid",
              gap: 1.25,
              alignContent: "start",
              alignItems: "start",
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
              {t("travelStats.memoryDrawerHint")}
            </Typography>
            <EntityPreviewImage
              entityId={`travel-memory:${memory.id}`}
              variant="compact"
              title={memory.city}
              locationHint={memory.country}
              categoryHint="city"
              latitude={memory.latitude}
              longitude={memory.longitude}
              alt={`${memory.city} · ${memory.country} · city`}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
              <Box sx={{ flexShrink: 0 }}>
                <CountryFlag country={memory.country} size="1.1rem" />
              </Box>
              <Typography variant="h6" sx={{ minWidth: 0, wordBreak: "break-word" }}>
                {point.label}
              </Typography>
            </Box>
            <StyleBadge style={memory.style} />
            <Box sx={{ display: "grid", gap: 0.35, width: "100%" }}>
              <Typography variant="overline" color="primary.main" sx={{ lineHeight: 1.3 }}>
                {formatTravelMemoryRange(memory, t)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                {memory.notes.trim().length > 0 ? memory.notes : t("travelStats.memoryDrawerNoNotes")}
              </Typography>
            </Box>
            {memory.anchorEvents && memory.anchorEvents.length > 0 ? (
              <Box sx={{ display: "grid", gap: 0.75, width: "100%" }}>
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
                  {t("travelStats.anchorEventsDrawerTitle")}
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.25, display: "grid", gap: 0.75 }}>
                  {memory.anchorEvents.map((event) => (
                    <Typography key={event.id} component="li" variant="body2" color="text.secondary" sx={{ display: "list-item" }}>
                      <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
                        {event.title}
                      </Box>
                      {event.eventDate ? ` · ${event.eventDate}` : ""}
                      {event.venue ? ` · ${event.venue}` : ""}
                      {event.city || event.country ? ` · ${[event.city, event.country].filter(Boolean).join(", ")}` : ""}
                    </Typography>
                  ))}
                </Box>
              </Box>
            ) : null}
            {onMemoryUpdate ? (
              <EntityInstagramMediaStrip
                entityId={memory.id}
                entityType="trip"
                attachments={memory.mediaAttachments ?? []}
                titleHint={memory.city}
                locationHint={memory.country}
                categoryHint={memory.style}
                instagramConnected={instagramConnected}
                instagramAuthSurface="inlineToken"
                onAttachmentsChange={persistAttachments}
                onInstagramConnected={onInstagramConnected}
              />
            ) : null}
            <MemoryRoutePreview memories={[...point.memories].sort((left, right) => left.startDate.localeCompare(right.startDate))} />
          </Box>
        </Box>
      ) : null}
    </Drawer>
  );
};
