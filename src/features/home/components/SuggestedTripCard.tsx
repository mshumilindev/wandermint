import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { SuggestedTrip } from "../../../services/home/homeTripSuggestionTypes";
import { suggestionKindToBadgeKey } from "../../../services/home/homeTripSuggestionTypes";
import { GlassPanel } from "../../../shared/ui/GlassPanel";

type SuggestedTripCardProps = {
  trip: SuggestedTrip;
};

export const SuggestedTripCard = ({ trip }: SuggestedTripCardProps): JSX.Element => {
  const { t } = useTranslation();
  const badgeKey = trip.sourceSignals.some((s) => s.startsWith("fallback:"))
    ? "curated"
    : suggestionKindToBadgeKey(trip.type);

  const badgeLabel = t(`homeSuggestions.badges.${badgeKey}`);
  const destLabel = trip.destination.city
    ? `${trip.destination.city}, ${trip.destination.country}`
    : trip.destination.country;

  return (
    <Link
      to="/trips/new"
      style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
    >
      <GlassPanel
        sx={{
          p: 2.5,
          height: "100%",
          display: "grid",
          gap: 1.5,
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
          "&:hover": { transform: "translateY(-2px)" },
        }}
      >
        <Chip size="small" label={badgeLabel} color="primary" variant="outlined" sx={{ width: "fit-content" }} />
        <Typography variant="h6">{trip.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {destLabel}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("homeSuggestions.durationBudget", {
            days: trip.durationDays,
            min: trip.estimatedBudget.min,
            max: trip.estimatedBudget.max,
            currency: trip.estimatedBudget.currency,
          })}
        </Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
          {trip.reasoning}
        </Typography>
      </GlassPanel>
    </Link>
  );
};
