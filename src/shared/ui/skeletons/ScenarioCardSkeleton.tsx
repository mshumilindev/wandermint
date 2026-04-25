import { Box, Skeleton } from "@mui/material";
import { GlassPanel } from "../GlassPanel";

interface ScenarioCardSkeletonProps {
  /** Mirrors `ScenarioCard` `previewVariant` image sizing. */
  previewVariant?: "scenarioCard" | "savedItem";
  /** `ScenarioCard` shows a save button only when `onSave` is passed. */
  showSaveAction?: boolean;
}

export const ScenarioCardSkeleton = ({
  previewVariant = "scenarioCard",
  showSaveAction = true,
}: ScenarioCardSkeletonProps): JSX.Element => {
  const imageMinHeight =
    previewVariant === "savedItem"
      ? { xs: 168, sm: 184 }
      : { xs: 176, md: 200 };

  return (
    <GlassPanel elevated sx={{ p: 2.5, display: "grid", gap: 2, height: "100%" }}>
      <Skeleton
        variant="rounded"
        sx={{
          width: "100%",
          aspectRatio: "16 / 9",
          minHeight: imageMinHeight,
          borderRadius: 1,
        }}
      />
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ display: "grid", gap: 0.75, flex: 1, minWidth: 0 }}>
          <Skeleton variant="text" width="85%" height={36} />
          <Skeleton variant="text" width="55%" height={22} />
          <Skeleton variant="text" width="70%" height={20} />
        </Box>
        {showSaveAction ? <Skeleton variant="rounded" width={88} height={36} /> : null}
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Skeleton variant="rounded" width={108} height={30} sx={{ borderRadius: 999 }} />
        <Skeleton variant="rounded" width={96} height={30} sx={{ borderRadius: 999 }} />
        <Skeleton variant="rounded" width={120} height={30} sx={{ borderRadius: 999 }} />
        <Skeleton variant="rounded" width={140} height={30} sx={{ borderRadius: 999 }} />
      </Box>
      <Box sx={{ display: "grid", gap: 1.5 }}>
        <Skeleton variant="rounded" height={96} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rounded" height={96} sx={{ borderRadius: 2 }} />
      </Box>
    </GlassPanel>
  );
};
