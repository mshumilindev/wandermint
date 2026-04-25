import type { Trip } from "../../../entities/trip/model";
import type { RestoreTripVersionInput, RestoreTripVersionResult } from "./tripVersion.types";
import { tripVersionRepository } from "./tripVersionRepository";

const cloneTrip = (trip: Trip): Trip => {
  if (typeof structuredClone === "function") {
    return structuredClone(trip);
  }
  return JSON.parse(JSON.stringify(trip)) as Trip;
};

/**
 * Loads a stored snapshot and returns a fresh clone for re-applying to the app / Firestore.
 * Validates `userId` against the snapshot to reduce cross-user restore mistakes.
 */
export const restoreTripVersion = async (input: RestoreTripVersionInput): Promise<RestoreTripVersionResult> => {
  const userId = input.userId.trim();
  const versionId = input.versionId.trim();
  if (!userId || !versionId) {
    throw new TypeError("restoreTripVersion requires userId and versionId.");
  }

  const version = await tripVersionRepository.getById(versionId);
  if (!version) {
    throw new Error(`Trip version not found: ${versionId}`);
  }

  if (version.snapshot.userId !== userId) {
    throw new Error("Version snapshot does not belong to this user.");
  }

  return {
    trip: cloneTrip(version.snapshot),
    version,
  };
};
