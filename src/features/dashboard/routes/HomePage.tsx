import AddLocationAltOutlinedIcon from "@mui/icons-material/AddLocationAltOutlined";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import { Box, Button, Grid, Typography } from "@mui/material";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { BrandExperienceHero } from "../../../shared/ui/BrandExperienceHero";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { LoadingState } from "../../../shared/ui/LoadingState";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { TripCard } from "../../trips/components/TripCard";

export const HomePage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const ensureTrips = useTripsStore((state) => state.ensureTrips);
  const tripIds = useTripsStore((state) => state.tripIds);
  const tripsById = useTripsStore((state) => state.tripsById);
  const meta = useTripsStore((state) => state.listMeta);

  useEffect(() => {
    if (user) {
      void ensureTrips(user.id);
    }
  }, [ensureTrips, user]);

  const trips = tripIds.map((tripId) => tripsById[tripId]).filter((trip): trip is NonNullable<typeof trip> => Boolean(trip));

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <BrandExperienceHero />
      <SectionHeader title={t("dashboard.launchTitle")} subtitle={t("dashboard.launchSubtitle")} />
      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <GlassPanel elevated sx={{ p: 3, minHeight: 220, display: "grid", alignContent: "space-between", gap: 3 }}>
            <Box sx={{ display: "grid", gap: 1 }}>
              <Typography variant="overline" sx={{ color: "var(--wm-color-mint)", letterSpacing: 5 }}>{t("nav.local")}</Typography>
              <Typography variant="h4">{t("dashboard.localCta")}</Typography>
              <Typography variant="body2" color="text.secondary">{t("local.subtitle")}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button component={Link} to="/local" variant="contained" startIcon={<AddLocationAltOutlinedIcon />}>
                {t("dashboard.localCta")}
              </Button>
              <Button component={Link} to="/trips/new" variant="outlined" startIcon={<LuggageOutlinedIcon />}>
                {t("dashboard.newTrip")}
              </Button>
            </Box>
          </GlassPanel>
        </Grid>
        <Grid item xs={12} md={5}>
          <GlassPanel sx={{ p: 3, height: "100%", display: "grid", gap: 2 }}>
            <Typography variant="h6">{t("dashboard.health")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("states.partialData")}
            </Typography>
            <Box sx={{ display: "grid", gap: 1 }}>
              <Typography variant="h3" color="primary.main">
                {trips.reduce((count, trip) => count + (trip.status === "needs_review" ? 1 : 0), 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("trips.health")}
              </Typography>
            </Box>
          </GlassPanel>
        </Grid>
      </Grid>
      <SectionHeader
        title={t("dashboard.upcoming")}
        action={
          <Button component={Link} to="/trips/new" variant="contained">
            {t("trips.new")}
          </Button>
        }
      />
      {meta.status === "loading" && trips.length === 0 ? <LoadingState /> : null}
      {trips.length === 0 && meta.status !== "loading" ? (
        <EmptyState title={t("trips.empty")} description={t("dashboard.emptyTrips")} />
      ) : (
        <Grid container spacing={2}>
          {trips.slice(0, 4).map((trip) => (
            <Grid item xs={12} md={6} key={trip.id}>
              <TripCard trip={trip} actionLabel={t("trips.overview")} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};
