import { Box, Skeleton } from "@mui/material";
import { GlassPanel } from "./GlassPanel";

export const LoadingState = (): JSX.Element => (
  <GlassPanel sx={{ p: 3 }}>
    <Box sx={{ display: "grid", gap: 2 }}>
      <Skeleton variant="text" width="42%" height={34} />
      <Skeleton variant="rounded" height={84} />
      <Skeleton variant="rounded" height={84} />
    </Box>
  </GlassPanel>
);
