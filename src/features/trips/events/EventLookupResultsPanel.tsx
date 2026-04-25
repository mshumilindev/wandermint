import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import MusicNoteRoundedIcon from "@mui/icons-material/MusicNoteRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import TheaterComedyRoundedIcon from "@mui/icons-material/TheaterComedyRounded";
import { Alert, Box, Button, Chip, CircularProgress, Link, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { EventLookupResult } from "../../../entities/events/eventLookup.model";
import { CountryFlag } from "../../../shared/ui/CountryFlag";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { EventLookupResultRowSkeleton } from "../../../shared/ui/skeletons/EventLookupResultRowSkeleton";

const eventTypeIcon = (eventType: EventLookupResult["eventType"]): JSX.Element => {
  switch (eventType) {
    case "festival":
    case "multi_day_festival":
      return <CelebrationRoundedIcon fontSize="small" color="primary" aria-hidden />;
    case "venue_event":
      return <TheaterComedyRoundedIcon fontSize="small" color="primary" aria-hidden />;
    case "concert":
      return <MusicNoteRoundedIcon fontSize="small" color="primary" aria-hidden />;
    default:
      return <EventNoteRoundedIcon fontSize="small" color="primary" aria-hidden />;
  }
};

const providerLabel = (provider: EventLookupResult["provider"], t: (k: string) => string): string => {
  const key = `events.providers.${provider}`;
  const translated = t(key);
  return translated === key ? provider : translated;
};

interface EventLookupResultsPanelProps {
  mode: "upcoming" | "past";
  results: EventLookupResult[];
  loading: boolean;
  error: string | null;
  warnings?: string[];
  onPick: (result: EventLookupResult, replaceAll: boolean) => void;
}

export const EventLookupResultsPanel = ({
  mode,
  results,
  loading,
  error,
  warnings,
  onPick,
}: EventLookupResultsPanelProps): JSX.Element | null => {
  const { t } = useTranslation();
  const heading = mode === "upcoming" ? t("events.sectionUpcoming") : t("events.sectionPast");

  return (
    <Stack spacing={1.25} sx={{ mt: 0.5 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {heading}
      </Typography>
      {warnings?.includes("ticketmaster_not_configured") ? (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
          {t("events.warningTicketmaster")}
        </Alert>
      ) : null}
      {error ? (
        <Alert severity="error" variant="outlined" sx={{ py: 0.5 }}>
          {t(`events.errors.${error}`, { defaultValue: t("events.lookupFailed") })}
        </Alert>
      ) : null}
      {loading ? (
        <Stack spacing={1.25}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
            <CircularProgress size={18} aria-hidden />
            <Typography variant="body2" color="text.secondary">
              {t("events.searching")}
            </Typography>
          </Box>
          {[0, 1, 2].map((key) => (
            <EventLookupResultRowSkeleton key={key} />
          ))}
        </Stack>
      ) : null}
      {!loading && !error && results.length === 0 ? (
        <Alert severity="info" variant="outlined" sx={{ py: 0.75 }}>
          <Typography variant="body2">{t("events.noResults")}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {t("events.noResultsHint")}
          </Typography>
        </Alert>
      ) : null}
      <Stack spacing={1}>
        {results.map((result) => (
          <Box
            key={result.id}
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "108px 1fr" },
              gap: 1.25,
              p: 1.25,
              borderRadius: 2,
              border: "1px solid rgba(183, 237, 226, 0.14)",
              background: "rgba(4, 12, 18, 0.42)",
            }}
          >
            <Box sx={{ width: "100%", minWidth: 0 }}>
              <EntityPreviewImage
                entityId={`event-lookup:${result.id}`}
                variant="activityThumb"
                title={result.title}
                locationHint={result.city ?? result.country}
                categoryHint="event"
                existingImageUrl={result.imageUrl ?? undefined}
                providerImageUrl={result.imageUrl ?? undefined}
              />
            </Box>
            <Stack spacing={0.75} sx={{ minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>
                  {result.title}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                  {eventTypeIcon(result.eventType)}
                  {result.sourceUrl || result.ticketUrl ? (
                    <Link
                      href={result.ticketUrl ?? result.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("events.openSource")}
                      sx={{ display: "inline-flex", color: "primary.light" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <OpenInNewRoundedIcon sx={{ fontSize: 18 }} />
                    </Link>
                  ) : null}
                </Box>
              </Box>
              {result.venueName ? (
                <Typography variant="caption" color="text.secondary" noWrap title={result.venueName}>
                  {result.venueName}
                </Typography>
              ) : null}
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
                <CountryFlag country={result.country} countryCode={result.countryCode} size="0.95rem" />
                <Typography variant="caption" color="text.secondary">
                  {[result.city, result.country].filter(Boolean).join(", ")}
                </Typography>
                {result.startDate ? (
                  <Chip size="small" label={result.startDate} sx={{ height: 22, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }} />
                ) : null}
                <Chip
                  size="small"
                  label={providerLabel(result.provider, t)}
                  variant="outlined"
                  sx={{ height: 22, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }}
                />
                {result.confidence < 0.75 ? (
                  <Chip size="small" color="warning" label={t("events.fuzzyMatch")} sx={{ height: 22, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }} />
                ) : null}
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                <Button size="small" variant="contained" onClick={() => onPick(result, false)}>
                  {t("events.useEvent")}
                </Button>
                <Button size="small" variant="text" onClick={() => onPick(result, true)}>
                  {t("events.replaceAll")}
                </Button>
              </Box>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
};
