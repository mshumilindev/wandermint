import type { StoryTravelPreferences } from "./storyTravelTypes";

export const defaultStoryTravelPreferences = (): StoryTravelPreferences => ({
  enabled: true,
  showLiterary: true,
  showFilmSeries: true,
  showVibeMatches: false,
  density: "subtle",
});

export const mergeStoryTravelPreferences = (raw: Partial<StoryTravelPreferences> | null | undefined): StoryTravelPreferences => {
  const d = defaultStoryTravelPreferences();
  if (!raw || typeof raw !== "object") {
    return d;
  }
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : d.enabled,
    showLiterary: typeof raw.showLiterary === "boolean" ? raw.showLiterary : d.showLiterary,
    showFilmSeries: typeof raw.showFilmSeries === "boolean" ? raw.showFilmSeries : d.showFilmSeries,
    showVibeMatches: typeof raw.showVibeMatches === "boolean" ? raw.showVibeMatches : d.showVibeMatches,
    density: raw.density === "none" || raw.density === "subtle" || raw.density === "balanced" || raw.density === "themed" ? raw.density : d.density,
  };
};
