import { Grid } from "@mui/material";
import { ScenarioCardSkeleton } from "./ScenarioCardSkeleton";

interface ScenarioCardsGridSkeletonProps {
  count: number;
  /** Saved grid uses `savedItem` image heights on cards. */
  previewVariant?: "scenarioCard" | "savedItem";
  showSaveAction?: boolean;
}

export const ScenarioCardsGridSkeleton = ({
  count,
  previewVariant = "scenarioCard",
  showSaveAction = true,
}: ScenarioCardsGridSkeletonProps): JSX.Element => (
  <Grid container spacing={2}>
    {Array.from({ length: count }, (_, index) => (
      <Grid item xs={12} sm={6} lg={4} key={index}>
        <ScenarioCardSkeleton previewVariant={previewVariant} showSaveAction={showSaveAction} />
      </Grid>
    ))}
  </Grid>
);
