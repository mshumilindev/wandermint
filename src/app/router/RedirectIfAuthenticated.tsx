import { Box, CircularProgress } from "@mui/material";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuthStore } from "../store/useAuthStore";

export const RedirectIfAuthenticated = ({ children }: { children: ReactNode }): JSX.Element => {
  const status = useAuthStore((state) => state.status);

  if (status === "initializing") {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};
