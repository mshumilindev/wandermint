import type { Confidence, MusicPlanningSignals } from "../../../integrations/music/musicTypes";

export type ActivityMusicMatchInput = {
  name: string;
  category?: string;
  tags?: string[];
};

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Soft ranking boost (0–0.2) — never exceeds +0.2 total per spec.
 * Genre/scene matches add smaller increments; strong artist/title overlap can reach the cap.
 */
export const rankActivityWithMusicTaste = (activity: ActivityMusicMatchInput, signals: MusicPlanningSignals | null): number => {
  if (!signals) {
    return 0;
  }
  const hay = norm(`${activity.name} ${activity.category ?? ""} ${(activity.tags ?? []).join(" ")}`);
  if (!hay) {
    return 0;
  }
  const dampen = signals.confidence === "low" ? 0.65 : signals.confidence === "medium" ? 0.85 : 1;
  let boost = 0;
  for (const artist of signals.topArtists) {
    const a = norm(artist);
    if (a.length >= 3 && hay.includes(a)) {
      boost = Math.max(boost, 0.18);
    }
  }
  for (const genre of signals.topGenres) {
    const g = norm(genre);
    if (g.length >= 3 && hay.includes(g)) {
      boost = Math.min(0.2, boost + 0.06);
    }
  }
  for (const scene of signals.scenes) {
    const parts = scene.split(/[·,]/).map((p) => norm(p)).filter(Boolean);
    for (const p of parts) {
      if (p.length >= 4 && hay.includes(p)) {
        boost = Math.min(0.2, boost + 0.05);
        break;
      }
    }
  }
  return Math.min(0.2, boost * dampen);
};
