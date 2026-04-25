import type { StoryTravelExperience } from "./storyTravelTypes";

const gradientDataUrl = (): string =>
  "linear-gradient(135deg, rgba(0, 180, 216, 0.35) 0%, rgba(72, 12, 168, 0.45) 45%, rgba(4, 11, 19, 0.92) 100%)";

export type ResolvedStoryImage = {
  /** CSS background when no URL */
  background?: string;
  url?: string;
  alt: string;
};

const cache = new Map<string, ResolvedStoryImage>();

export const resolveStoryExperienceImage = (experience: StoryTravelExperience): ResolvedStoryImage => {
  const key = experience.id;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const alt = `${experience.title} inspired by ${experience.sourceTitle}`;
  if (experience.imageUrl?.trim()) {
    const v: ResolvedStoryImage = { url: experience.imageUrl.trim(), alt };
    cache.set(key, v);
    return v;
  }
  const firstLoc = experience.locations.find((l) => l.imageUrl?.trim());
  if (firstLoc?.imageUrl) {
    const v: ResolvedStoryImage = { url: firstLoc.imageUrl.trim(), alt };
    cache.set(key, v);
    return v;
  }
  const v: ResolvedStoryImage = { background: gradientDataUrl(), alt };
  cache.set(key, v);
  return v;
};
