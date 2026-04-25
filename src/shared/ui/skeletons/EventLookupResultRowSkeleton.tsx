import { Box, Skeleton, Stack } from "@mui/material";

export const EventLookupResultRowSkeleton = (): JSX.Element => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", sm: "108px 1fr" },
      gap: 1.25,
      p: 1.25,
      borderRadius: 2,
      border: "1px solid rgba(183, 237, 226, 0.14)",
      background: "rgba(4, 12, 18, 0.42)",
    }}
  >
    <Skeleton
      variant="rounded"
      sx={{
        width: "100%",
        aspectRatio: "4 / 3",
        minHeight: { xs: 128, sm: 104 },
        borderRadius: 1,
      }}
    />
    <Stack spacing={0.75} sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
        <Skeleton variant="text" width="78%" height={22} sx={{ flex: 1 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
          <Skeleton variant="circular" width={22} height={22} />
          <Skeleton variant="circular" width={22} height={22} />
        </Box>
      </Box>
      <Skeleton variant="text" width="55%" height={18} />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
        <Skeleton variant="circular" width={16} height={16} />
        <Skeleton variant="text" width={120} height={18} />
        <Skeleton variant="rounded" width={72} height={22} sx={{ borderRadius: 999 }} />
        <Skeleton variant="rounded" width={88} height={22} sx={{ borderRadius: 999 }} />
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        <Skeleton variant="rounded" width={100} height={30} />
        <Skeleton variant="rounded" width={92} height={30} />
      </Box>
    </Stack>
  </Box>
);
