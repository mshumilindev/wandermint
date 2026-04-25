import { Box, Grid, Skeleton } from "@mui/material";
import { GlassPanel } from "../GlassPanel";

export const TripOverviewPageSkeleton = (): JSX.Element => (
  <Box sx={{ display: "grid", gap: 3 }}>
    <Box sx={{ display: "flex", gap: 2, alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", flexDirection: { xs: "column", sm: "row" } }}>
      <Box sx={{ minWidth: 0 }}>
        <Skeleton variant="text" width="min(420px, 72%)" height={36} sx={{ maxWidth: "100%" }} />
        <Skeleton variant="text" width="min(520px, 88%)" height={22} sx={{ maxWidth: "100%", mt: 0.5 }} />
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Skeleton variant="rounded" width={148} height={36} />
        <Skeleton variant="rounded" width={88} height={36} />
        <Skeleton variant="rounded" width={96} height={36} />
        <Skeleton variant="rounded" width={112} height={36} />
      </Box>
    </Box>

    <GlassPanel elevated sx={{ p: 3, borderColor: "var(--wm-color-border)" }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", flexDirection: { xs: "column", sm: "row" } }}>
        <Box sx={{ display: "grid", gap: 1, flex: 1, minWidth: 0 }}>
          <Skeleton variant="rounded" width={200} height={30} sx={{ borderRadius: 999 }} />
          <Skeleton variant="text" width="min(360px, 90%)" height={40} />
          <Skeleton variant="text" width="min(480px, 100%)" height={22} />
        </Box>
        <Skeleton variant="rounded" width={120} height={36} sx={{ flexShrink: 0 }} />
      </Box>
    </GlassPanel>

    <GlassPanel sx={{ p: 2.5, display: "grid", gap: 1.5 }}>
      <Skeleton variant="text" width={160} height={32} />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Skeleton variant="rounded" width={180} height={30} sx={{ borderRadius: 999 }} />
        <Skeleton variant="rounded" width={200} height={30} sx={{ borderRadius: 999 }} />
        <Skeleton variant="rounded" width={168} height={30} sx={{ borderRadius: 999 }} />
      </Box>
    </GlassPanel>

    <Grid container spacing={2}>
      <Grid item xs={12} lg={8}>
        <Box sx={{ display: "flex", gap: 2, alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", flexDirection: { xs: "column", sm: "row" } }}>
          <Skeleton variant="text" width={120} height={32} />
        </Box>
        <Box sx={{ mt: 2, display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", px: 0.25 }}>
            <Skeleton variant="text" width={100} height={24} />
            <Skeleton variant="rounded" width={120} height={26} sx={{ borderRadius: 999 }} />
            <Skeleton variant="rounded" width={72} height={26} sx={{ borderRadius: 999 }} />
          </Box>
          {[0, 1].map((key) => (
            <GlassPanel key={key} sx={{ p: 2.5, display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Box sx={{ display: "grid", gap: 0.75 }}>
                  <Skeleton variant="text" width={200} height={20} />
                  <Skeleton variant="text" width="min(280px, 70%)" height={28} />
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Skeleton variant="rounded" width={88} height={28} sx={{ borderRadius: 999 }} />
                  <Skeleton variant="rounded" width={96} height={28} sx={{ borderRadius: 999 }} />
                  <Skeleton variant="rounded" width={140} height={32} />
                  <Skeleton variant="rounded" width={88} height={32} />
                </Box>
              </Box>
              <Box sx={{ display: "grid", gap: 1.5 }}>
                <Skeleton variant="rounded" height={108} sx={{ borderRadius: 2 }} />
                <Skeleton variant="rounded" height={108} sx={{ borderRadius: 2 }} />
              </Box>
            </GlassPanel>
          ))}
        </Box>
      </Grid>
      <Grid item xs={12} lg={4}>
        <Box sx={{ display: "grid", gap: 2 }}>
          <GlassPanel sx={{ p: 2, display: "grid", gap: 1 }}>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Skeleton variant="rounded" width={88} height={28} sx={{ borderRadius: 999 }} />
              <Skeleton variant="rounded" width={112} height={28} sx={{ borderRadius: 999 }} />
            </Box>
            <Skeleton variant="text" width="100%" height={26} />
            <Skeleton variant="text" width="85%" height={22} />
          </GlassPanel>
          <GlassPanel sx={{ p: 2, display: "grid", gap: 1.25 }}>
            <Skeleton variant="text" width="70%" height={24} />
            <Skeleton variant="text" width="100%" height={20} />
            <Skeleton variant="text" width="90%" height={20} />
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", pt: 0.5 }}>
              <Skeleton variant="rounded" width={96} height={32} />
              <Skeleton variant="rounded" width={88} height={32} />
            </Box>
          </GlassPanel>
        </Box>
      </Grid>
    </Grid>
  </Box>
);
