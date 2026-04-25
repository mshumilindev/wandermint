import { Box, Skeleton } from "@mui/material";
import { GlassPanel } from "../GlassPanel";

export type TripCardSkeletonActions = "single" | "double";

interface TripCardSkeletonProps {
  actions?: TripCardSkeletonActions;
}

export const TripCardSkeleton = ({ actions = "single" }: TripCardSkeletonProps): JSX.Element => (
  <GlassPanel sx={{ p: 2.5, display: "grid", gap: 2 }}>
    <Skeleton
      variant="rounded"
      sx={{
        width: "100%",
        aspectRatio: "16 / 9",
        minHeight: { xs: 168, sm: 188 },
        borderRadius: 1,
      }}
    />
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "flex-start" }}>
      <Box sx={{ flex: 1, minWidth: 0, display: "grid", gap: 0.75 }}>
        <Skeleton variant="text" width="72%" height={32} />
        <Skeleton variant="text" width="48%" height={22} />
      </Box>
      <Skeleton variant="rounded" width={88} height={28} sx={{ flexShrink: 0, borderRadius: 999 }} />
    </Box>
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <Skeleton variant="rounded" width={148} height={30} sx={{ borderRadius: 999 }} />
      <Skeleton variant="rounded" width={112} height={30} sx={{ borderRadius: 999 }} />
      <Skeleton variant="rounded" width={124} height={30} sx={{ borderRadius: 999 }} />
      <Skeleton variant="rounded" width={96} height={30} sx={{ borderRadius: 999 }} />
    </Box>
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      <Skeleton variant="rounded" width={132} height={36} />
      {actions === "double" ? <Skeleton variant="rounded" width={96} height={36} /> : null}
    </Box>
  </GlassPanel>
);
