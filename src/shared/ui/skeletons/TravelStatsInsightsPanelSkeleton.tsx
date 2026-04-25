import { Box, Skeleton } from "@mui/material";

/** Mirrors the “insights” column in `TravelStatsPage` (`mostVisited`, `yearly`, `recordedTrips`). */
export const TravelStatsInsightsPanelSkeleton = (): JSX.Element => (
  <Box sx={{ display: "grid", gap: 2 }}>
    <Skeleton variant="text" width={180} height={32} />
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      {[0, 1, 2, 3, 4].map((key) => (
        <Skeleton key={key} variant="rounded" width={96} height={32} sx={{ borderRadius: 999 }} />
      ))}
    </Box>
    <Skeleton variant="text" width={120} height={32} />
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} variant="rounded" width={88} height={30} sx={{ borderRadius: 999 }} />
      ))}
    </Box>
    <Skeleton variant="text" width={200} height={32} />
    <Box sx={{ display: "grid", gap: 1.25 }}>
      {[0, 1, 2, 3].map((key) => (
        <Box
          key={key}
          sx={{
            p: 2,
            borderRadius: 2,
            border: "1px solid rgba(183, 237, 226, 0.12)",
            background: "rgba(4, 12, 18, 0.35)",
            display: "grid",
            gap: 1.1,
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "start" }}>
            <Box sx={{ flex: 1, minWidth: 0, display: "grid", gap: 0.75 }}>
              <Skeleton variant="text" width="72%" height={24} />
              <Skeleton variant="text" width="40%" height={20} />
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
              <Skeleton variant="rounded" width={64} height={32} />
              <Skeleton variant="rounded" width={80} height={32} />
            </Box>
          </Box>
          <Skeleton variant="rounded" width={120} height={26} sx={{ borderRadius: 999 }} />
        </Box>
      ))}
    </Box>
  </Box>
);
