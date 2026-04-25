import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import DirectionsTransitRoundedIcon from "@mui/icons-material/DirectionsTransitRounded";
import FlightTakeoffRoundedIcon from "@mui/icons-material/FlightTakeoffRounded";
import HotelRoundedIcon from "@mui/icons-material/HotelRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LocalActivityRoundedIcon from "@mui/icons-material/LocalActivityRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SuggestedTrip } from "../../../services/home/homeTripSuggestionTypes";
import { suggestionKindToBadgeKey } from "../../../services/home/homeTripSuggestionTypes";
import { formatUserFriendlyDateRange } from "../../../shared/lib/dateDisplay";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { writeHomeSuggestionTripPrefill } from "../homeSuggestionTripPrefill";
import type { AlternativeDateWindow, TripBudgetBreakdown } from "../../../features/travel-pricing/types/tripBudget.types";

type SuggestedTripCardProps = {
  trip: SuggestedTrip;
  onRegenerateDates?: () => void;
};

type WindowView = "balanced" | "cheap" | "comfort";

const compactDateChip = (startIso: string, endIso: string): string => {
  const a = dayjs(startIso);
  const b = dayjs(endIso);
  if (!a.isValid() || !b.isValid()) {
    return "";
  }
  const sameMonth = a.month() === b.month() && a.year() === b.year();
  if (sameMonth) {
    return `${a.format("D")}–${b.format("D MMM")}`;
  }
  return `${a.format("D MMM")} – ${b.format("D MMM")}`;
};

const categoryRow = (
  breakdown: TripBudgetBreakdown,
  key: keyof TripBudgetBreakdown["categories"],
  icon: ReactNode,
): JSX.Element => {
  const cat = breakdown.categories[key];
  const unavailable = cat.confidence === "unavailable" || (cat.max <= 0 && cat.min <= 0);
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, minWidth: 0 }}>
      <Box sx={{ color: "primary.light", pt: 0.15, flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {cat.label}
        </Typography>
        {unavailable ? (
          <Typography variant="body2" color="text.disabled">
            —
          </Typography>
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {Math.round(cat.min)}–{Math.round(cat.max)} {cat.currency}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export const SuggestedTripCard = ({ trip, onRegenerateDates }: SuggestedTripCardProps): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [whyOpen, setWhyOpen] = useState(false);
  const [windowView, setWindowView] = useState<WindowView>("balanced");

  const badgeKey = trip.sourceSignals.some((s) => s.startsWith("fallback:"))
    ? "curated"
    : suggestionKindToBadgeKey(trip.type);

  const badgeLabel = t(`homeSuggestions.badges.${badgeKey}`);
  const destLabel = trip.destination.city ? `${trip.destination.city}, ${trip.destination.country}` : trip.destination.country;

  const breakdown = trip.budgetBreakdown;
  const displayMode = trip.budgetDisplayMode ?? "unavailable";

  const altCheap = trip.alternativeDateWindows?.find((a) => a.label === "cheapest");
  const altComfort = trip.alternativeDateWindows?.find((a) => a.label === "comfort");

  const activeWindow = useMemo((): { start: string; end: string; totalMin: number; totalMax: number; currency: string } | null => {
    if (!trip.recommendedDateWindow) {
      return null;
    }
    if (windowView === "cheap" && altCheap) {
      return {
        start: altCheap.startDate,
        end: altCheap.endDate,
        totalMin: altCheap.estimatedTotalMin,
        totalMax: altCheap.estimatedTotalMax,
        currency: altCheap.currency,
      };
    }
    if (windowView === "comfort" && altComfort) {
      return {
        start: altComfort.startDate,
        end: altComfort.endDate,
        totalMin: altComfort.estimatedTotalMin,
        totalMax: altComfort.estimatedTotalMax,
        currency: altComfort.currency,
      };
    }
    return {
      start: trip.recommendedDateWindow.startDate,
      end: trip.recommendedDateWindow.endDate,
      totalMin: breakdown?.totalMin ?? trip.estimatedBudget.min,
      totalMax: breakdown?.totalMax ?? trip.estimatedBudget.max,
      currency: breakdown?.currency ?? trip.estimatedBudget.currency,
    };
  }, [altCheap, altComfort, breakdown, trip.estimatedBudget, trip.recommendedDateWindow, windowView]);

  const openPlan = (): void => {
    writeHomeSuggestionTripPrefill(trip);
    void navigate({ to: "/trips/new" });
  };

  const confidenceLabel =
    displayMode === "source_backed" ? t("homeSuggestions.card.priceConfidenceHigh") : displayMode === "partial" ? t("homeSuggestions.card.priceConfidencePartial") : t("homeSuggestions.card.priceConfidenceLow");

  return (
    <GlassPanel
      sx={{
        p: 0,
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        overflow: "hidden",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": { transform: "translateY(-2px)" },
      }}
    >
      {trip.heroImage ? (
        <Box
          component="img"
          src={trip.heroImage.url}
          alt={trip.heroImage.alt}
          sx={{ width: "100%", height: 140, objectFit: "cover", display: "block", opacity: 0.92 }}
        />
      ) : (
        <Box
          sx={{
            height: 120,
            background: "linear-gradient(135deg, rgba(33,220,195,0.18), rgba(120,90,220,0.2))",
            borderBottom: "1px solid rgba(183,237,226,0.12)",
          }}
        />
      )}
      <Box sx={{ p: 2.25, display: "grid", gap: 1.35, minWidth: 0 }}>
        <Chip size="small" label={badgeLabel} color="primary" variant="outlined" sx={{ width: "fit-content" }} />
        <Typography variant="h6">{trip.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {destLabel}
        </Typography>

        {activeWindow ? (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              icon={<CalendarMonthRoundedIcon sx={{ "&&": { fontSize: 16 } }} />}
              label={compactDateChip(activeWindow.start, activeWindow.end)}
              variant="outlined"
              sx={{ borderColor: "rgba(183,237,226,0.35)" }}
            />
            <Typography variant="caption" color="text.secondary">
              {formatUserFriendlyDateRange(activeWindow.start, activeWindow.end)}
            </Typography>
          </Stack>
        ) : null}

        {displayMode !== "unavailable" && activeWindow && activeWindow.totalMax > 0 ? (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              icon={<AccountBalanceWalletRoundedIcon sx={{ "&&": { fontSize: 16 } }} />}
              label={t("homeSuggestions.card.totalLabel", {
                min: Math.round(activeWindow.totalMin),
                max: Math.round(activeWindow.totalMax),
                currency: activeWindow.currency,
              })}
              color="secondary"
              variant="outlined"
            />
            {windowView !== "balanced" && breakdown ? (
              <Typography variant="caption" color="text.secondary">
                {t("homeSuggestions.card.breakdownForBalancedOnly")}
              </Typography>
            ) : null}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t("homeSuggestions.card.budgetUnavailable")}
          </Typography>
        )}

        {breakdown && windowView === "balanced" ? (
          <Grid container spacing={1.25}>
            <Grid item xs={12} sm={6}>
              {categoryRow(breakdown, "transport", <FlightTakeoffRoundedIcon fontSize="small" />)}
            </Grid>
            <Grid item xs={12} sm={6}>
              {categoryRow(breakdown, "accommodation", <HotelRoundedIcon fontSize="small" />)}
            </Grid>
            <Grid item xs={12} sm={6}>
              {categoryRow(breakdown, "food", <RestaurantRoundedIcon fontSize="small" />)}
            </Grid>
            <Grid item xs={12} sm={6}>
              {categoryRow(breakdown, "localTransport", <DirectionsTransitRoundedIcon fontSize="small" />)}
            </Grid>
            <Grid item xs={12} sm={6}>
              {categoryRow(breakdown, "activities", <LocalActivityRoundedIcon fontSize="small" />)}
            </Grid>
            <Grid item xs={12} sm={6}>
              {categoryRow(breakdown, "buffer", <AccountBalanceWalletRoundedIcon fontSize="small" />)}
            </Grid>
          </Grid>
        ) : breakdown && windowView !== "balanced" ? (
          <Typography variant="caption" color="text.secondary">
            {t("homeSuggestions.card.switchToBalancedForBreakdown")}
          </Typography>
        ) : null}

        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          {displayMode === "source_backed" ? (
            <VerifiedOutlinedIcon fontSize="small" color="success" sx={{ opacity: 0.85 }} />
          ) : (
            <InfoOutlinedIcon fontSize="small" color="action" sx={{ opacity: 0.85 }} />
          )}
          <Typography variant="caption" color="text.secondary">
            {confidenceLabel}
            {trip.priceDataFetchedAt ? ` · ${t("homeSuggestions.card.lastChecked", { at: dayjs(trip.priceDataFetchedAt).format("MMM D, YYYY HH:mm") })}` : ""}
          </Typography>
        </Stack>

        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
          {trip.reasoning}
        </Typography>

        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="contained" onClick={openPlan}>
            {t("homeSuggestions.card.openPlan")}
          </Button>
          <Button size="small" variant="outlined" disabled={!onRegenerateDates} onClick={() => onRegenerateDates?.()}>
            {t("homeSuggestions.card.regenerateDates")}
          </Button>
          <Button size="small" variant="outlined" disabled={!altCheap} onClick={() => setWindowView("cheap")}>
            {t("homeSuggestions.card.showCheaper")}
          </Button>
          <Button size="small" variant="outlined" disabled={!altComfort} onClick={() => setWindowView("comfort")}>
            {t("homeSuggestions.card.showComfort")}
          </Button>
          <Button size="small" variant="text" onClick={() => setWindowView("balanced")}>
            {t("homeSuggestions.card.resetWindow")}
          </Button>
          <Button size="small" variant="text" onClick={() => setWhyOpen((v) => !v)}>
            {t("homeSuggestions.card.whyThis")}
          </Button>
        </Stack>

        <Collapse in={whyOpen}>
          <Box sx={{ pt: 0.5, display: "grid", gap: 0.75 }}>
            {(trip.signalsDetailed ?? []).map((s) => (
              <Box key={`${s.type}-${s.label}`}>
                <Typography variant="caption" color="primary.light" sx={{ fontWeight: 700 }}>
                  {s.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {s.explanation}
                </Typography>
              </Box>
            ))}
            {(trip.alternativeDateWindows ?? []).map((a: AlternativeDateWindow) => (
              <Typography key={a.label} variant="caption" color="text.secondary">
                <strong>{a.label}</strong>: {compactDateChip(a.startDate, a.endDate)} — {a.reason}
              </Typography>
            ))}
          </Box>
        </Collapse>
      </Box>
    </GlassPanel>
  );
};
