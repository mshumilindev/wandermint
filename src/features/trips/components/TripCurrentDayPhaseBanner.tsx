import { Alert } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";
import { getTripTimelinePhase } from "../pacing/tripCurrentDay";

type TripCurrentDayPhaseBannerProps = {
  trip: Trip | null;
  dayPlans: DayPlan[];
};

export const TripCurrentDayPhaseBanner = ({ trip, dayPlans }: TripCurrentDayPhaseBannerProps): JSX.Element | null => {
  const { t } = useTranslation();
  const phase = useMemo(() => getTripTimelinePhase(dayPlans, trip, new Date()), [dayPlans, trip]);

  if (phase === "in_progress" || !trip || dayPlans.length === 0) {
    return null;
  }

  if (phase === "upcoming") {
    return (
      <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
        {t("trips.currentDay.phaseUpcoming")}
      </Alert>
    );
  }

  return (
    <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
      {t("trips.currentDay.phasePast")}
    </Alert>
  );
};
