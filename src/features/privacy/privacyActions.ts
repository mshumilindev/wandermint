import type { PrivacySettings } from "./privacySettings.types";
import { travelBehaviorRepository } from "../user-behavior/travelBehaviorRepository";
import { travelTasteRepository } from "../user-taste/travelTasteRepository";
import { tripReviewsRepository } from "../../services/firebase/repositories/tripReviewsRepository";

export const shouldPersistTravelBehaviorProfile = (settings: PrivacySettings | null | undefined): boolean =>
  Boolean(settings?.allowBehaviorLearning);

export const shouldPersistTripReview = (settings: PrivacySettings | null | undefined): boolean =>
  Boolean(settings?.allowPostTripAnalysis);

/** Removes aggregated travel-behavior and personal taste documents (does not touch trips or day plans). */
export const deleteTravelBehaviorProfileForUser = async (userId: string): Promise<void> => {
  await travelBehaviorRepository.deleteProfile(userId);
  await travelTasteRepository.deleteProfile(userId);
};

/** Deletes all stored post-trip review payloads for the user. */
export const deleteTripReviewsForUser = async (userId: string): Promise<void> => {
  await tripReviewsRepository.deleteAllForUser(userId);
};
