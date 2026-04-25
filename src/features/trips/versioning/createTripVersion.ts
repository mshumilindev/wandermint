import type { Trip } from "../../../entities/trip/model";
import type { CreateTripVersionInput, TripVersion } from "./tripVersion.types";
import { tripVersionRepository } from "./tripVersionRepository";

const cloneTrip = (trip: Trip): Trip => {
  if (typeof structuredClone === "function") {
    return structuredClone(trip);
  }
  return JSON.parse(JSON.stringify(trip)) as Trip;
};

const newVersionId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ver_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Persists a deep snapshot of `trip` **before** a destructive or major mutation
 * (replan, bulk edit, repair). Callers must **not** use this for minor UI tweaks (Rule 4).
 */
export const createTripVersion = async (input: CreateTripVersionInput): Promise<TripVersion> => {
  const tripId = input.trip.id.trim();
  if (!tripId) {
    throw new TypeError("createTripVersion requires trip.id.");
  }

  const version: TripVersion = {
    id: newVersionId(),
    tripId,
    createdAt: new Date().toISOString(),
    reason: input.reason.trim() || "unspecified",
    snapshot: cloneTrip(input.trip),
  };

  await tripVersionRepository.append(version);
  return version;
};
