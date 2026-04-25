import type { TripCollaborator, TripCollaboratorRole } from "./collaboration.types";

const STORAGE_KEY = "wandermint.tripCollaborators.v1";

type CollaboratorsStoreV1 = {
  v: 1;
  /** tripId → collaborators */
  byTripId: Record<string, TripCollaborator[]>;
};

const emptyStore = (): CollaboratorsStoreV1 => ({ v: 1, byTripId: {} });

const isCollaboratorRow = (row: unknown): row is TripCollaborator => {
  if (!row || typeof row !== "object") {
    return false;
  }
  const c = row as TripCollaborator;
  return (
    typeof c.userId === "string" &&
    c.userId.trim().length > 0 &&
    (c.role === "owner" || c.role === "editor" || c.role === "viewer") &&
    typeof c.addedAt === "string"
  );
};

const readStore = (): CollaboratorsStoreV1 => {
  if (typeof localStorage === "undefined") {
    return emptyStore();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyStore();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("byTripId" in parsed)) {
      return emptyStore();
    }
    const byTripId = (parsed as CollaboratorsStoreV1).byTripId;
    if (!byTripId || typeof byTripId !== "object") {
      return emptyStore();
    }
    const next: Record<string, TripCollaborator[]> = {};
    for (const [tripId, list] of Object.entries(byTripId)) {
      if (!Array.isArray(list)) {
        continue;
      }
      const rows = list.filter(isCollaboratorRow);
      if (rows.length > 0) {
        next[tripId] = rows;
      }
    }
    return { v: 1, byTripId: next };
  } catch {
    return emptyStore();
  }
};

const writeStore = (store: CollaboratorsStoreV1): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota / private mode
  }
};

const assertSingleOwner = (list: readonly TripCollaborator[]): void => {
  const owners = list.filter((c) => c.role === "owner");
  if (owners.length !== 1) {
    throw new Error("Trip collaborators must include exactly one owner.");
  }
};

export const tripCollaboratorsRepository = {
  listByTripId: async (tripId: string): Promise<TripCollaborator[]> => {
    if (!tripId.trim()) {
      return [];
    }
    return [...(readStore().byTripId[tripId] ?? [])].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  },

  getRole: async (tripId: string, userId: string): Promise<TripCollaboratorRole | null> => {
    const row = (await tripCollaboratorsRepository.listByTripId(tripId)).find((c) => c.userId === userId.trim());
    return row?.role ?? null;
  },

  /**
   * Replaces the collaborator list for a trip. Callers must enforce owner-only edits
   * for role changes (Rule 1).
   */
  setCollaboratorsForTrip: async (tripId: string, collaborators: TripCollaborator[]): Promise<void> => {
    const tid = tripId.trim();
    if (!tid) {
      throw new TypeError("tripId is required.");
    }
    assertSingleOwner(collaborators);
    const store = readStore();
    const next: CollaboratorsStoreV1 = {
      v: 1,
      byTripId: { ...store.byTripId, [tid]: collaborators.map((c) => ({ ...c, userId: c.userId.trim() })) },
    };
    writeStore(next);
  },

  /** Adds or updates one collaborator; preserves a single owner row. */
  upsertCollaborator: async (tripId: string, collaborator: TripCollaborator): Promise<void> => {
    const tid = tripId.trim();
    const uid = collaborator.userId.trim();
    if (!tid || !uid) {
      throw new TypeError("tripId and collaborator.userId are required.");
    }
    const current = await tripCollaboratorsRepository.listByTripId(tid);
    const without = current.filter((c) => c.userId !== uid);
    let next = [...without, { ...collaborator, userId: uid }];
    if (collaborator.role === "owner") {
      next = next.map((c) => (c.userId === uid ? c : { ...c, role: c.role === "owner" ? "editor" : c.role }));
    }
    if (!next.some((c) => c.role === "owner")) {
      throw new Error("Cannot remove the only owner without assigning another.");
    }
    assertSingleOwner(next);
    await tripCollaboratorsRepository.setCollaboratorsForTrip(tid, next);
  },

  removeCollaborator: async (tripId: string, userId: string): Promise<void> => {
    const tid = tripId.trim();
    const uid = userId.trim();
    if (!tid || !uid) {
      return;
    }
    const current = await tripCollaboratorsRepository.listByTripId(tid);
    const next = current.filter((c) => c.userId !== uid);
    if (next.length === 0) {
      const store = readStore();
      const { [tid]: _, ...rest } = store.byTripId;
      writeStore({ v: 1, byTripId: rest });
      return;
    }
    assertSingleOwner(next);
    await tripCollaboratorsRepository.setCollaboratorsForTrip(tid, next);
  },

  /**
   * Seeds an owner row when starting collaboration for a new trip.
   */
  ensureOwner: async (tripId: string, ownerUserId: string): Promise<TripCollaborator[]> => {
    const tid = tripId.trim();
    const oid = ownerUserId.trim();
    if (!tid || !oid) {
      throw new TypeError("tripId and ownerUserId are required.");
    }
    const existing = await tripCollaboratorsRepository.listByTripId(tid);
    if (existing.length > 0) {
      return existing;
    }
    const owner: TripCollaborator = { userId: oid, role: "owner", addedAt: new Date().toISOString() };
    await tripCollaboratorsRepository.setCollaboratorsForTrip(tid, [owner]);
    return [owner];
  },
};

export const clearTripCollaboratorsRepositoryForTests = (): void => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
};
