import { Navigate } from "@tanstack/react-router";
import { Box, CircularProgress } from "@mui/material";
import { useAuthStore } from "../store/useAuthStore";

export const IndexGate = (): JSX.Element => {
  const status = useAuthStore((state) => state.status);

  if (status === "initializing") {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return <Navigate to={status === "authenticated" ? "/home" : "/auth"} replace />;
};
