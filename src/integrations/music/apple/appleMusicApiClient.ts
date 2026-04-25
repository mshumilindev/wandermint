import type { AppleRecentlyPlayedResource } from "./appleMusicTypes";

/** Placeholder — real calls need signed developer token + user music token headers. */
export const fetchAppleRecentlyPlayed = async (_developerToken: string, _userToken: string): Promise<AppleRecentlyPlayedResource[]> => {
  return [];
};
