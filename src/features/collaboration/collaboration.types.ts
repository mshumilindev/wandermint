export type TripCollaboratorRole = "owner" | "editor" | "viewer";

export type TripCollaborator = {
  userId: string;
  role: TripCollaboratorRole;
  addedAt: string;
};

/** Returns true when the user may change trip data (Rule 1). */
export const canModifyTrip = (userId: string, collaborators: readonly TripCollaborator[]): boolean => {
  const uid = userId.trim();
  if (!uid) {
    return false;
  }
  const row = collaborators.find((c) => c.userId === uid);
  return row?.role === "owner" || row?.role === "editor";
};

/** Returns true when the user may open live itinerary (all roles including viewer — Rule 2). */
export const canViewLiveItinerary = (userId: string, collaborators: readonly TripCollaborator[]): boolean => {
  const uid = userId.trim();
  if (!uid) {
    return false;
  }
  return collaborators.some((c) => c.userId === uid);
};

/** Same as {@link canModifyTrip}: viewers must not edit live blocks (Rule 2). */
export const canEditLiveItinerary = canModifyTrip;

/**
 * Travel/taste/behavior learning must be keyed to the **authenticated user who acted**,
 * never merged into another collaborator or the trip owner’s profile (Rules 3–4).
 */
export const learningProfileUserIdForActor = (authenticatedActorUserId: string): string =>
  authenticatedActorUserId.trim();
