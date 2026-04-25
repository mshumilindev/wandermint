import dayjs from "dayjs";
import type { Confidence, MusicPersonalizationSettings, MusicPlanningSignals, MusicTasteProfile } from "../../../integrations/music/musicTypes";
import { warnMusicDev } from "../../../integrations/music/musicErrors";
import { musicStorage } from "../../../integrations/music/musicStorage";
import { interpretMusicTasteProfile } from "./musicAiLayer";

export type MusicProfileFreshness = "none" | "fresh" | "stale" | "ignored";

export const getMusicTasteProfileForUser = async (uid: string): Promise<MusicTasteProfile | null> => {
  if (!uid.trim()) {
    return null;
  }
  try {
    return await musicStorage.getProfile(uid);
  } catch (e) {
    warnMusicDev("profile_parse_failed", undefined, e instanceof Error ? e.message : undefined);
    return null;
  }
};

export const getEnabledMusicPersonalization = async (
  uid: string,
): Promise<{
  settings: MusicPersonalizationSettings;
  profile: MusicTasteProfile | null;
  planningConfidence: Confidence;
  profileFreshness: MusicProfileFreshness;
}> => {
  const settings = await musicStorage.getSettings(uid);
  if (!settings.useMusicTastePersonalization) {
    return { settings, profile: null, planningConfidence: "low", profileFreshness: "none" };
  }
  const profile = await getMusicTasteProfileForUser(uid);
  if (!profile) {
    return { settings, profile: null, planningConfidence: "low", profileFreshness: "none" };
  }
  const daysOld = dayjs().diff(dayjs(profile.updatedAt), "day");
  if (daysOld > 90) {
    return { settings, profile: null, planningConfidence: "low", profileFreshness: "ignored" };
  }
  const profileFreshness: MusicProfileFreshness = daysOld > 30 ? "stale" : "fresh";
  const planningConfidence: Confidence =
    profileFreshness === "stale" ? "low" : profile.topArtists.some((a) => a.confidence === "high") ? "high" : "medium";
  return { settings, profile, planningConfidence, profileFreshness };
};

export const buildMusicPlanningSignals = async (
  profile: MusicTasteProfile,
  planningConfidence: Confidence,
  allowAiInterpretation: boolean,
): Promise<MusicPlanningSignals> => {
  const vibeProfile = await interpretMusicTasteProfile(profile, allowAiInterpretation);
  return {
    topArtists: profile.topArtists
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((a) => a.name),
    topGenres: profile.topGenres.slice(0, 8).map((g) => g.name),
    scenes: profile.scenes.slice(0, 6).map((s) => s.label),
    vibe: vibeProfile.travelVibe,
    confidence: planningConfidence,
  };
};
