import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getHomeTripSuggestions } from "../../../services/home/homeTripSuggestionService";
import type { SuggestedTrip } from "../../../services/home/homeTripSuggestionTypes";
import type { StoryTravelExperience } from "../../../services/storyTravel/storyTravelTypes";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { StoryExperienceStrip } from "../../storyTravel/components/StoryExperienceStrip";
import { SuggestedTripCard } from "./SuggestedTripCard";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "ready"; trips: SuggestedTrip[]; usedFallback: boolean; storyInspirations: StoryTravelExperience[] };

export const SuggestedTripsSection = ({ userId }: { userId: string | undefined }): JSX.Element => {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const load = useCallback(async () => {
    if (!userId?.trim()) {
      const empty = await getHomeTripSuggestions("");
      setState({ status: "ready", trips: empty.suggestions, usedFallback: true, storyInspirations: empty.storyInspirations });
      return;
    }
    setState({ status: "loading" });
    try {
      const result = await getHomeTripSuggestions(userId);
      setState({
        status: "ready",
        trips: result.suggestions,
        usedFallback: result.usedFallback,
        storyInspirations: result.storyInspirations,
      });
    } catch {
      const fallback = await getHomeTripSuggestions("");
      setState({
        status: "ready",
        trips: fallback.suggestions,
        usedFallback: true,
        storyInspirations: fallback.storyInspirations,
      });
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status !== "ready") {
    return (
      <Box sx={{ display: "grid", gap: 2 }}>
        <SectionHeader title={t("homeSuggestions.sectionTitle")} subtitle={t("homeSuggestions.sectionSubtitle")} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
          <CircularProgress size={22} />
          <Typography variant="body2" color="text.secondary">
            {t("homeSuggestions.loading")}
          </Typography>
        </Box>
      </Box>
    );
  }

  const ready = state;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <SectionHeader title={t("homeSuggestions.sectionTitle")} subtitle={t("homeSuggestions.sectionSubtitle")} />
      {ready.usedFallback ? (
        <Typography variant="caption" color="text.secondary">
          {t("homeSuggestions.fallbackHint")}
        </Typography>
      ) : null}
      <Grid container spacing={2}>
        {ready.trips.map((trip: SuggestedTrip) => (
          <Grid item xs={12} sm={6} md={4} key={trip.id}>
            <SuggestedTripCard trip={trip} onRegenerateDates={() => void load()} />
          </Grid>
        ))}
      </Grid>
      <StoryExperienceStrip
        title={t("homeSuggestions.storySectionTitle")}
        subtitle={t("homeSuggestions.storySectionSubtitle")}
        experiences={ready.storyInspirations}
      />
    </Box>
  );
};
