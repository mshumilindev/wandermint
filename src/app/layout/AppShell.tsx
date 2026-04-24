import AddLocationAltOutlinedIcon from "@mui/icons-material/AddLocationAltOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import { Alert, AppBar, Avatar, Box, Button, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Snackbar, Toolbar, Typography, useMediaQuery } from "@mui/material";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AudioControl } from "../../shared/ui/AudioControl";
import { BrandLogo } from "../../shared/ui/BrandLogo";
import { useAuthStore } from "../store/useAuthStore";
import { useUiStore } from "../store/useUiStore";
import { useUserPreferencesStore } from "../store/useUserPreferencesStore";
import { appTheme } from "../theme/theme";

const navItems = [
  { to: "/home", labelKey: "nav.home", icon: <DashboardOutlinedIcon /> },
  { to: "/local", labelKey: "nav.local", icon: <AddLocationAltOutlinedIcon /> },
  { to: "/trips", labelKey: "nav.trips", icon: <LuggageOutlinedIcon /> },
  { to: "/travel-map", labelKey: "nav.travelMap", icon: <PublicRoundedIcon /> },
  { to: "/saved", labelKey: "nav.saved", icon: <StarBorderRoundedIcon /> },
  { to: "/settings", labelKey: "nav.settings", icon: <SettingsOutlinedIcon /> },
] as const;

const ShellNav = ({ onNavigate }: { onNavigate?: () => void }): JSX.Element => {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <List sx={{ px: 1.5 }}>
      {navItems.map((item) => (
        <ListItemButton
          key={item.to}
          component={Link}
          to={item.to}
          onClick={onNavigate}
          selected={pathname === item.to || pathname.startsWith(`${item.to}/`)}
          sx={{
            borderRadius: 2,
            mb: 0.5,
            color: "text.secondary",
            "&.Mui-selected": {
              color: "primary.main",
              background: "var(--wm-color-accent-amber-soft)",
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>{item.icon}</ListItemIcon>
          <ListItemText primary={t(item.labelKey)} primaryTypographyProps={{ fontWeight: 700 }} />
        </ListItemButton>
      ))}
    </List>
  );
};

export const AppShell = (): JSX.Element => {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery(appTheme.breakpoints.up("md"));
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);
  const user = useAuthStore((state) => state.user);
  const signOutUser = useAuthStore((state) => state.signOutUser);
  const ensurePreferences = useUserPreferencesStore((state) => state.ensurePreferences);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (user?.id) {
      void ensurePreferences(user.id);
    }
  }, [ensurePreferences, user?.id]);

  const pageTitle = (() => {
    if (pathname === "/home") return t("nav.home");
    if (pathname === "/local") return t("nav.local");
    if (pathname === "/trips") return t("nav.trips");
    if (pathname === "/trips/new") return t("wizard.title");
    if (pathname.startsWith("/trips/") && pathname.endsWith("/chat")) return t("chat.title");
    if (pathname.startsWith("/trips/") && pathname.includes("/day/")) return t("trips.dayPlan");
    if (pathname.startsWith("/trips/")) return t("trips.overview");
    if (pathname === "/travel-map") return t("nav.travelMap");
    if (pathname === "/saved") return t("nav.saved");
    if (pathname === "/settings") return t("nav.settings");
    return t("common.appName");
  })();

  const drawerContent = (
    <Box
      sx={{
        width: 268,
        height: "100%",
        background:
          "linear-gradient(180deg, rgba(3, 15, 23, 0.78), rgba(8, 11, 14, 0.62)), radial-gradient(circle at 24% 8%, rgba(33, 220, 195, 0.18), transparent 30%)",
        backdropFilter: "var(--wm-blur-header)",
        borderRight: "1px solid var(--wm-glass-border)",
        boxShadow: "var(--wm-ambient-mint)",
      }}
    >
      <Box sx={{ p: 3, display: "grid", justifyItems: "center", textAlign: "center", gap: 0.65 }}>
        <BrandLogo markSize={48} />
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {t("nav.tagline")}
        </Typography>
      </Box>
      <ShellNav onNavigate={() => setSidebarOpen(false)} />
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {isDesktop ? (
        <Box component="aside" sx={{ width: 268, flexShrink: 0, position: "sticky", top: 0, alignSelf: "flex-start", height: "100vh" }}>
          {drawerContent}
        </Box>
      ) : (
        <Drawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          {drawerContent}
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} sx={{ background: "rgba(3, 15, 23, 0.58)", backdropFilter: "var(--wm-blur-header)", borderBottom: "1px solid var(--wm-glass-border)" }}>
          <Toolbar sx={{ gap: 2 }}>
            {!isDesktop ? (
              <IconButton onClick={() => setSidebarOpen(true)} aria-label="menu">
                <MenuRoundedIcon />
              </IconButton>
            ) : null}
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {pageTitle}
              </Typography>
            </Box>
            {user ? <AudioControl userId={user.id} /> : null}
            {user ? <Avatar src={user.avatarUrlHighRes ?? user.avatarUrl ?? undefined} alt={user.displayName} sx={{ width: 34, height: 34, border: "1px solid var(--wm-glass-border)" }} /> : null}
            <Button color="inherit" onClick={() => void signOutUser()}>
              {t("common.signOut")}
            </Button>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 }, maxWidth: 1440, mx: "auto" }}>
          <Outlet />
        </Box>
        {toasts.map((toast, index) => (
          <Snackbar
            key={toast.id}
            open
            autoHideDuration={toast.tone === "error" ? 5200 : 3400}
            onClose={() => dismissToast(toast.id)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            sx={{ bottom: `${24 + index * 72}px !important` }}
          >
            <Alert
              onClose={() => dismissToast(toast.id)}
              severity={toast.tone}
              variant="filled"
              sx={{ width: "100%", minWidth: 280 }}
            >
              {toast.message}
            </Alert>
          </Snackbar>
        ))}
      </Box>
    </Box>
  );
};
