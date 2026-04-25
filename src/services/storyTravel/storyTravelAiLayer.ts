import type { StoryTravelExperience, StoryTravelItineraryAdaptation } from "./storyTravelTypes";

export type StoryTripContext = {
  tripDurationDays: number;
  pace: "slow" | "balanced" | "dense";
  budgetStyle: "lean" | "balanced" | "premium";
  primaryCity?: string;
  primaryCountry?: string;
};

/**
 * Deterministic refinement: keep curated factual fields, trim list, improve copy slightly.
 * Remote LLM can replace this later without changing call sites.
 */
export const refineStoryTravelExperiences = (
  candidates: StoryTravelExperience[],
  tripContext: StoryTripContext,
  _max?: number,
): StoryTravelExperience[] => {
  const max = _max ?? (tripContext.tripDurationDays <= 2 ? 1 : tripContext.pace === "dense" ? 1 : 2);
  const sorted = [...candidates].sort((a, b) => {
    const durOrder = (d: StoryTravelExperience["recommendedDuration"]): number => {
      if (d === "quick_stop") {
        return 0;
      }
      if (d === "half_day") {
        return 1;
      }
      if (d === "full_day") {
        return 2;
      }
      return 3;
    };
    if (tripContext.tripDurationDays <= 2) {
      return durOrder(a.recommendedDuration) - durOrder(b.recommendedDuration);
    }
    return 0;
  });
  return sorted.slice(0, max).map((exp) => ({
    ...exp,
    explanation: generateStoryExperienceExplanation(exp, tripContext),
  }));
};

export const generateStoryExperienceExplanation = (experience: StoryTravelExperience, tripContext: StoryTripContext): string => {
  const loc = [tripContext.primaryCity, tripContext.primaryCountry].filter(Boolean).join(", ");
  const fit =
    experience.destinationFit === "exact_city"
      ? "fits your current city well"
      : experience.destinationFit === "country"
        ? "fits the country you are planning"
        : "is a softer regional or mood match";
  return `${experience.title} (${experience.sourceTitle}) ${fit}${loc ? ` for ${loc}` : ""}. ${experience.description}`.slice(0, 420);
};

export const adaptStoryExperienceToItinerary = (
  experience: StoryTravelExperience,
  dayContext: { dayIndex: number; blockCount: number },
): StoryTravelItineraryAdaptation => {
  const warnings: string[] = [];
  if (dayContext.blockCount >= 6) {
    warnings.push("Day is already dense — treat this story beat as optional or swap a lower-priority stop.");
  }
  if (experience.recommendedDuration === "multi_day") {
    warnings.push("Multi-day story arcs need their own trip window — do not compress into a single afternoon.");
  }
  const placement: StoryTravelItineraryAdaptation["suggestedPlacement"] =
    dayContext.dayIndex === 0 ? "afternoon" : dayContext.blockCount > 4 ? "flexible" : "morning";
  return {
    suggestedPlacement: placement,
    durationLabel: experience.recommendedDuration.replace("_", " "),
    notes: [
      "Keep curated relationship labels honest in UI: filming vs inspiration vs confirmed venue.",
      "Never drop anchors, flights, or must-see items for this optional layer.",
    ],
    warnings,
  };
};

export const formatStoryTravelPromptAppendix = (experiences: StoryTravelExperience[]): string => {
  if (!experiences.length) {
    return "";
  }
  const lines = experiences.map(
    (e) =>
      `- OPTIONAL STORY INSPIRATION: ${e.title} (${e.sourceTitle}, ${e.experienceType}, confidence ${e.confidence}) — ${e.explanation}`,
  );
  return [
    "STORY / LITERARY LAYER (optional enrichment only — never mandatory blocks):",
    ...lines,
    "Do not invent new factual venues beyond these themes. If you add a meal or walk, keep it as a normal block without fake studio access.",
    "Respect pacing: at most one compact story-informed note per ~2 travel days unless user explicitly chose a themed trip.",
  ].join("\n");
};
