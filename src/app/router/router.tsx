import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "../layout/AppShell";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { IndexGate } from "./IndexGate";
import { RedirectIfAuthenticated } from "./RedirectIfAuthenticated";
import { RequireAuth } from "./RequireAuth";
import { AuthPage } from "../../features/auth/routes/AuthPage";
import { HomePage } from "../../features/dashboard/routes/HomePage";
import { LocalScenarioPage } from "../../features/local-scenarios/routes/LocalScenarioPage";
import { LocalScenarioDetailPage } from "../../features/local-scenarios/routes/LocalScenarioDetailPage";
import { BucketListPage } from "../../features/bucket-list/routes/BucketListPage";
import { SavedPage } from "../../features/saved/routes/SavedPage";
import { PrivacySettingsPage } from "../../features/privacy/routes/PrivacySettingsPage";
import { SettingsPage } from "../../features/settings/routes/SettingsPage";
import { SpotifyMusicCallbackPage } from "../../features/settings/routes/SpotifyMusicCallbackPage";
import { DayPlanPage } from "../../features/trips/routes/DayPlanPage";
import { NewTripPage } from "../../features/trips/routes/NewTripPage";
import { TripLivePage } from "../../features/trips/routes/TripLivePage";
import { TripOverviewPage } from "../../features/trips/routes/TripOverviewPage";
import { TripsListPage } from "../../features/trips/routes/TripsListPage";
import { TripChatPage } from "../../features/trip-chat/routes/TripChatPage";
import { TravelStatsPage } from "../../features/travel-stats/routes/TravelStatsPage";
import { AchievementsPage } from "../../features/achievements/routes/AchievementsPage";
import { AnalyticsDashboardPage } from "../../features/analytics/routes/AnalyticsDashboardPage";
import { ShareTripPage } from "../../features/share/ShareTripPage";
import { FriendsPage } from "../../features/friends/routes/FriendsPage";

const rootRoute = createRootRoute({
  errorComponent: ({ error, reset }) => <AppErrorBoundary error={error} reset={reset} />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexGate,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "auth",
  component: () => (
    <RedirectIfAuthenticated>
      <AuthPage />
    </RedirectIfAuthenticated>
  ),
});

const shareTripRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "share/trip/$shareToken",
  component: ShareTripPage,
});

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  component: () => (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "home",
  component: HomePage,
});

const localRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "local",
  component: LocalScenarioPage,
});

const localScenarioDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "local/scenario/$scenarioId",
  component: LocalScenarioDetailPage,
});

const tripsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "trips",
  component: TripsListPage,
});

const newTripRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "trips/new",
  component: NewTripPage,
});

const tripOverviewRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "trips/$tripId",
  component: TripOverviewPage,
});

const tripLiveRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "trips/$tripId/live",
  component: TripLivePage,
});

const tripChatRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "trips/$tripId/chat",
  component: TripChatPage,
});

const tripDayRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "trips/$tripId/day/$dayId",
  component: DayPlanPage,
});

const savedRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "saved",
  component: SavedPage,
});

const bucketListRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "bucket-list",
  component: BucketListPage,
});

const friendsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "friends",
  component: FriendsPage,
});

const achievementsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "achievements",
  component: AchievementsPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "analytics",
  component: AnalyticsDashboardPage,
});

const travelMapRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "travel-map",
  component: TravelStatsPage,
});

const settingsPrivacyRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "settings/privacy",
  component: PrivacySettingsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "settings",
  component: SettingsPage,
});

const spotifyMusicCallbackRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "settings/music/spotify/callback",
  component: SpotifyMusicCallbackPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  shareTripRoute,
  protectedRoute.addChildren([
    homeRoute,
    localRoute,
    localScenarioDetailRoute,
    tripsRoute,
    newTripRoute,
    tripOverviewRoute,
    tripLiveRoute,
    tripChatRoute,
    tripDayRoute,
    travelMapRoute,
    savedRoute,
    bucketListRoute,
    friendsRoute,
    achievementsRoute,
    analyticsRoute,
    settingsPrivacyRoute,
    settingsRoute,
    spotifyMusicCallbackRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
