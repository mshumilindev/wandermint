import { Box, CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { AuroraBackdrop } from "../../shared/ui/AuroraBackdrop";
import { appTheme } from "../theme/theme";
import { useAuthStore } from "../store/useAuthStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: Infinity,
    },
  },
});

interface AppProvidersProps {
  children: ReactNode;
}

export const AppProviders = ({ children }: AppProvidersProps): JSX.Element => {
  const startAuthListener = useAuthStore((state) => state.startAuthListener);

  useEffect(() => {
    const unsubscribe = startAuthListener();
    return () => unsubscribe();
  }, [startAuthListener]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        <AuroraBackdrop />
        <Box sx={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>{children}</Box>
      </ThemeProvider>
    </QueryClientProvider>
  );
};
