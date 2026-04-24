import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Trip } from "../../../entities/trip/model";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { formatBudgetAmountLabel } from "../../../shared/lib/priceDisplay";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { StatusBadge } from "../../../shared/ui/StatusBadge";

interface TripCardProps {
  trip: Trip;
  warningCount?: number;
  actionLabel: string;
  deleteLabel?: string;
  onDelete?: () => void;
}

export const TripCard = ({ trip, warningCount = 0, actionLabel, deleteLabel, onDelete }: TripCardProps): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const primarySegment = trip.tripSegments[0];
  const budgetLabel = formatBudgetAmountLabel(trip.budget.amount, trip.budget.currency, {
    preferredCurrency: preferences?.currency,
    locale: preferences?.locale,
  });

  return (
    <GlassPanel sx={{ p: 2.5, display: "grid", gap: 2 }}>
      <EntityPreviewImage
        title={primarySegment ? `${primarySegment.city}` : trip.destination}
        locationHint={primarySegment?.country ?? trip.destination}
        categoryHint="city"
        alt={trip.destination}
        height={172}
      />
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h6">{trip.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {trip.destination}
          </Typography>
        </Box>
        <StatusBadge status={trip.status} />
      </Box>
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <MetadataPill icon={<CalendarMonthOutlinedIcon />} label={`${trip.dateRange.start} - ${trip.dateRange.end}`} tone="teal" />
      <MetadataPill label={`${trip.tripSegments.length} ${trip.tripSegments.length === 1 ? "city" : "cities"}`} tone="teal" />
      <MetadataPill icon={<HealthAndSafetyOutlinedIcon />} label={t("trips.warningCount", { count: warningCount })} tone={warningCount > 0 ? "amber" : "default"} />
      <MetadataPill label={budgetLabel} />
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" onClick={() => void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } })}>
          {actionLabel}
        </Button>
        {onDelete && deleteLabel ? (
          <Button color="error" variant="outlined" onClick={onDelete}>
            {deleteLabel}
          </Button>
        ) : null}
      </Box>
    </GlassPanel>
  );
};
