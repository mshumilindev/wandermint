import AddLocationAltOutlinedIcon from "@mui/icons-material/AddLocationAltOutlined";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import FormatListBulletedOutlinedIcon from "@mui/icons-material/FormatListBulletedOutlined";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import { Alert, AppBar, Avatar, Box, Drawer, Fab, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Snackbar, Toolbar, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AudioControl } from "../../shared/ui/AudioControl";
import { BrandLogo } from "../../shared/ui/BrandLogo";
import { useAuthStore } from "../store/useAuthStore";
import { useUiStore } from "../store/useUiStore";
import { BucketListQuickAddDialog } from "../../features/bucket-list/components/BucketListQuickAddDialog";
import { AchievementUnlockToastSurface } from "../../features/achievements/components/AchievementUnlockToastSurface";
import { useBucketListQuickAddStore } from "../../features/bucket-list/bucketListQuickAddStore";
import { setAnalyticsLocationConsentProvider } from "../../features/observability/appLogger";
import { usePrivacySettingsStore } from "../store/usePrivacySettingsStore";
import { useUserPreferencesStore } from "../store/useUserPreferencesStore";
import { appTheme } from "../theme/theme";

/** Same chrome as the top-right actions cluster (glass + blur). */
const shellChromeSurface = {
  background: "var(--wm-glass-panel)",
  backdropFilter: "var(--wm-blur-panel)",
  WebkitBackdropFilter: "var(--wm-blur-panel)",
  boxShadow: "var(--wm-shadow-soft)",
} as const;

const navItems = [
  { to: "/home", labelKey: "nav.home", icon: <DashboardOutlinedIcon /> },
  { to: "/local", labelKey: "nav.local", icon: <AddLocationAltOutlinedIcon /> },
  { to: "/trips", labelKey: "nav.trips", icon: <LuggageOutlinedIcon /> },
  { to: "/travel-map", labelKey: "nav.travelMap", icon: <PublicRoundedIcon /> },
  { to: "/saved", labelKey: "nav.saved", icon: <StarBorderRoundedIcon /> },
  { to: "/bucket-list", labelKey: "nav.bucketList", icon: <FormatListBulletedOutlinedIcon /> },
  { to: "/friends", labelKey: "nav.friends", icon: <PeopleRoundedIcon /> },
  { to: "/achievements", labelKey: "nav.achievements", icon: <EmojiEventsOutlinedIcon /> },
  { to: "/analytics", labelKey: "nav.analytics", icon: <BarChartOutlinedIcon /> },
  { to: "/settings", labelKey: "nav.settings", icon: <SettingsOutlinedIcon /> },
] as const;

const ShellNav = ({ onNavigate }: { onNavigate?: () => void }): JSX.Element => {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const allowPersonalAnalytics = useUserPreferencesStore((s) => s.preferences?.allowPersonalAnalytics === true);

  return (
    <List sx={{ px: 1.5 }}>
      {navItems
        .filter((item) => item.to !== "/analytics" || allowPersonalAnalytics)
        .map((item) => (
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
  const ensurePrivacySettings = usePrivacySettingsStore((state) => state.ensurePrivacySettings);
  const openBucketQuickAdd = useBucketListQuickAddStore((state) => state.openDialog);

  useEffect(() => {
    if (user?.id) {
      void ensurePreferences(user.id);
      void ensurePrivacySettings(user.id);
    }
  }, [ensurePreferences, ensurePrivacySettings, user?.id]);

  useEffect(() => {
    setAnalyticsLocationConsentProvider(() => usePrivacySettingsStore.getState().settings?.allowLocationDuringTrip === true);
  }, []);

  const drawerContent = (
    <Box
      sx={{
        width: 268,
        height: "100%",
        border: "none",
        borderRight: "none",
        ...shellChromeSurface,
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
        <Box
          component="aside"
          sx={{
            width: 268,
            flexShrink: 0,
            position: "sticky",
            top: 0,
            alignSelf: "flex-start",
            height: "100vh",
            border: "none",
            borderRight: "none",
            outline: "none",
            boxShadow: "none",
          }}
        >
          {drawerContent}
        </Box>
      ) : (
        <Drawer
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          PaperProps={{
            sx: {
              width: 268,
              maxWidth: "100%",
              background: "transparent",
              border: "none",
              borderRight: "none",
              borderRadius: 0,
              boxShadow: "none",
              backgroundImage: "none",
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            background: "none",
            backgroundColor: "transparent",
            boxShadow: "none",
            border: "none",
            backgroundImage: "none",
            "&.MuiPaper-root": {
              background: "none",
              backgroundColor: "transparent",
              backgroundImage: "none",
            },
          }}
        >
          <Toolbar
            sx={{
              gap: 2,
              minHeight: { xs: 56, sm: 60 },
              background: "transparent",
              borderBottom: "none",
            }}
          >
            {!isDesktop ? (
              <IconButton onClick={() => setSidebarOpen(true)} aria-label="menu">
                <MenuRoundedIcon />
              </IconButton>
            ) : null}
            <Box sx={{ flex: 1, minWidth: 0 }} />
            {user ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexShrink: 0,
                  minHeight: 48,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 999,
                  ...shellChromeSurface,
                }}
              >
                <AudioControl userId={user.id} variant="plain" />
                <Avatar
                  src={user.avatarUrlHighRes ?? user.avatarUrl ?? undefined}
                  alt={user.displayName}
                  sx={{ width: 34, height: 34, border: "1px solid var(--wm-glass-border)" }}
                />
                <Tooltip title={t("common.signOut")}>
                  <IconButton
                    color="inherit"
                    edge="end"
                    onClick={() => void signOutUser()}
                    aria-label={t("common.signOut")}
                    size="small"
                    sx={{
                      border: "1px solid rgba(183, 237, 226, 0.16)",
                      background: "transparent",
                    }}
                  >
                    <LogoutRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            ) : null}
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 }, maxWidth: 1440, mx: "auto" }}>
          <Outlet />
        </Box>
        {toasts.map((toast, index) => {
          const stackTall = toasts.some((t) => t.achievement);
          const stackGap = stackTall ? 132 : 72;
          const autoHideDuration = toast.achievement ? 8600 : toast.tone === "error" ? 5200 : 3400;
          return (
            <Snackbar
              key={toast.id}
              open
              autoHideDuration={autoHideDuration}
              onClose={() => dismissToast(toast.id)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              sx={{ bottom: `${24 + index * stackGap}px !important` }}
            >
              {toast.achievement ? (
                <AchievementUnlockToastSurface achievement={toast.achievement} onClose={() => dismissToast(toast.id)} />
              ) : (
                <Alert
                  onClose={() => dismissToast(toast.id)}
                  severity={toast.tone}
                  variant="filled"
                  sx={{ width: "100%", minWidth: 280 }}
                >
                  {toast.message}
                </Alert>
              )}
            </Snackbar>
          );
        })}
        <BucketListQuickAddDialog />
        {user ? (
          <Tooltip title={t("bucketList.quickFab")}>
            <Fab
              color="primary"
              aria-label={t("bucketList.quickFab")}
              onClick={() => openBucketQuickAdd()}
              sx={{
                position: "fixed",
                right: 24,
                bottom: 96,
                zIndex: (theme) => theme.zIndex.snackbar + 2,
              }}
            >
              <BookmarkAddOutlinedIcon />
            </Fab>
          </Tooltip>
        ) : null}
      </Box>
    </Box>
  );
};
