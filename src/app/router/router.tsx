import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "../layout/AppShell";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { IndexGate } from "./IndexGate";
import { RedirectIfAuthenticated } from "./RedirectIfAuthenticated";
import { RequireAuth } from "./RequireAuth";
import { AuthPage } from "../../features/auth/routes/AuthPage";
import { HomePage } from "../../features/dashboard/routes/HomePage";
import { LocalScenarioPage } from "../../features/local-scenarios/routes/LocalScenarioPage";
import { SavedPage } from "../../features/saved/routes/SavedPage";
import { SettingsPage } from "../../features/settings/routes/SettingsPage";
import { DayPlanPage } from "../../features/trips/routes/DayPlanPage";
import { NewTripPage } from "../../features/trips/routes/NewTripPage";
import { TripOverviewPage } from "../../features/trips/routes/TripOverviewPage";
import { TripsListPage } from "../../features/trips/routes/TripsListPage";
import { TripChatPage } from "../../features/trip-chat/routes/TripChatPage";
import { TravelStatsPage } from "../../features/travel-stats/routes/TravelStatsPage";

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

const travelMapRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "travel-map",
  component: TravelStatsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  protectedRoute.addChildren([
    homeRoute,
    localRoute,
    tripsRoute,
    newTripRoute,
    tripOverviewRoute,
    tripChatRoute,
    tripDayRoute,
    travelMapRoute,
    savedRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
