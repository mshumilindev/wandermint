import { Box, Button, Grid } from "@mui/material";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripDetailsStore } from "../../../app/store/useTripDetailsStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { TripCardsGridSkeleton } from "../../../shared/ui/skeletons/TripCardsGridSkeleton";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { TripCard } from "../components/TripCard";

export const TripsListPage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const ensureTrips = useTripsStore((state) => state.ensureTrips);
  const refreshTrips = useTripsStore((state) => state.refreshTrips);
  const tripIds = useTripsStore((state) => state.tripIds);
  const tripsById = useTripsStore((state) => state.tripsById);
  const meta = useTripsStore((state) => state.listMeta);
  const deleteTripCascade = useTripDetailsStore((state) => state.deleteTripCascade);
  const pushToast = useUiStore((state) => state.pushToast);
  const [tripToDeleteId, setTripToDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      void ensureTrips(user.id);
    }
  }, [ensureTrips, user]);

  const trips = tripIds.map((tripId) => tripsById[tripId]).filter((trip): trip is NonNullable<typeof trip> => Boolean(trip));
  const tripToDelete = trips.find((trip) => trip.id === tripToDeleteId) ?? null;

  const handleDelete = async (): Promise<void> => {
    if (!user || !tripToDeleteId) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteTripCascade(user.id, tripToDeleteId);
      pushToast({ tone: "success", message: t("feedback.tripDeleted") });
      setTripToDeleteId(null);
    } catch {
      pushToast({ tone: "error", message: t("feedback.tripDeleteFailed") });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader
        title={t("trips.title")}
        subtitle={t("trips.subtitle")}
        action={
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="outlined" onClick={() => user && void refreshTrips(user.id)}>
              {t("common.refresh")}
            </Button>
            <Button component={Link} to="/trips/new" variant="contained">
              {t("trips.new")}
            </Button>
          </Box>
        }
      />
      {meta.status === "loading" && trips.length === 0 ? <TripCardsGridSkeleton variant="trips" /> : null}
      {trips.length === 0 && meta.status !== "loading" ? (
        <EmptyState title={t("trips.empty")} description={t("trips.subtitle")} />
      ) : (
        <Grid container spacing={2}>
          {trips.map((trip) => (
            <Grid key={trip.id} item xs={12} md={6} xl={4}>
              <TripCard
                trip={trip}
                actionLabel={t("trips.overview")}
                deleteLabel={
                  trip.status === "completed" || trip.status === "partially_completed" || trip.status === "abandoned" || trip.status === "archived"
                    ? t("common.delete")
                    : undefined
                }
                onDelete={
                  user && (trip.status === "completed" || trip.status === "partially_completed" || trip.status === "abandoned" || trip.status === "archived")
                    ? () => setTripToDeleteId(trip.id)
                    : undefined
                }
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
    <ConfirmActionDialog
      open={Boolean(tripToDelete)}
      title={t("prompts.confirmDeleteTripTitle")}
      description={tripToDelete ? t("prompts.confirmDeleteTripWithNameDescription", { title: tripToDelete.title }) : t("prompts.confirmDeleteTripDescription")}
      impactNote={t("prompts.confirmDeleteTripImpact")}
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      tone="danger"
      isPending={isDeleting}
      onCancel={() => setTripToDeleteId(null)}
      onConfirm={() => void handleDelete()}
    />
    </>
  );
};
