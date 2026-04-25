import { Grid } from "@mui/material";
import { TripCardSkeleton } from "./TripCardSkeleton";

interface TripCardsGridSkeletonProps {
  variant: "dashboard" | "trips";
}

const DASHBOARD_COUNT = 4;
const TRIPS_LIST_COUNT = 6;

export const TripCardsGridSkeleton = ({ variant }: TripCardsGridSkeletonProps): JSX.Element => {
  const count = variant === "dashboard" ? DASHBOARD_COUNT : TRIPS_LIST_COUNT;
  const actions = variant === "trips" ? "double" : "single";

  return (
    <Grid container spacing={2}>
      {Array.from({ length: count }, (_, index) => (
        <Grid
          key={index}
          item
          xs={12}
          md={6}
          {...(variant === "trips" ? { xl: 4 as const } : {})}
        >
          <TripCardSkeleton actions={actions} />
        </Grid>
      ))}
    </Grid>
  );
};
