import { collection, collectionGroup, doc, getDocs, limit, onSnapshot, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { firestoreCollections } from "../../shared/config/product";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import { nowIso } from "../../services/firebase/timestampMapper";
import { tripsRepository } from "../../services/firebase/repositories/tripsRepository";
import type { CreateTripShareInput, TripShare } from "./share.types";
import { generateShareToken } from "./shareTokenService";

const SHARES_SUBCOLLECTION = "shares";

const shareDocRef = (tripId: string, shareId: string) =>
  doc(collection(doc(firestoreDb, firestoreCollections.trips, tripId), SHARES_SUBCOLLECTION), shareId);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const parseTripShare = (tripId: string, shareId: string, raw: unknown): TripShare | null => {
  if (!isRecord(raw)) {
    return null;
  }
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  const ownerUserId = typeof raw.ownerUserId === "string" ? raw.ownerUserId.trim() : "";
  const access = raw.access === "read_only" ? "read_only" : null;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : "";
  if (!token || !ownerUserId || !access || !createdAt) {
    return null;
  }
  return {
    id: shareId,
    tripId,
    ownerUserId,
    token,
    access,
    createdAt,
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : undefined,
    revokedAt: typeof raw.revokedAt === "string" ? raw.revokedAt : undefined,
    includeLiveStatus: Boolean(raw.includeLiveStatus),
    includeDocuments: Boolean(raw.includeDocuments),
    includeCosts: Boolean(raw.includeCosts),
  };
};

const serializeTripShare = (row: TripShare): Record<string, unknown> => ({
  id: row.id,
  tripId: row.tripId,
  ownerUserId: row.ownerUserId,
  token: row.token,
  access: row.access,
  createdAt: row.createdAt,
  ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
  ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}),
  includeLiveStatus: row.includeLiveStatus,
  includeDocuments: row.includeDocuments,
  includeCosts: row.includeCosts,
});

const isShareUsable = (share: TripShare): boolean => {
  if (share.revokedAt) {
    return false;
  }
  if (share.expiresAt) {
    const ex = Date.parse(share.expiresAt);
    if (Number.isFinite(ex) && ex < Date.now()) {
      return false;
    }
  }
  return true;
};

const syncTripPublicReadEnabled = async (tripId: string): Promise<void> => {
  const sharesSnap = await getDocs(collection(doc(firestoreDb, firestoreCollections.trips, tripId), SHARES_SUBCOLLECTION));
  let anyActive = false;
  for (const d of sharesSnap.docs) {
    const row = parseTripShare(tripId, d.id, d.data());
    if (row && isShareUsable(row)) {
      anyActive = true;
      break;
    }
  }
  await updateDoc(doc(firestoreDb, firestoreCollections.trips, tripId), {
    publicReadEnabled: anyActive,
    updatedAt: nowIso(),
  });
};

export const shareRepository = {
  findActiveShareByToken: async (token: string): Promise<{ tripId: string; share: TripShare } | null> => {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }
    const q = query(collectionGroup(firestoreDb, SHARES_SUBCOLLECTION), where("token", "==", trimmed), limit(2));
    const snap = await getDocs(q);
    if (snap.empty) {
      return null;
    }
    const docSnap = snap.docs[0];
    if (!docSnap) {
      return null;
    }
    const tripId = docSnap.ref.parent.parent?.id;
    if (!tripId) {
      return null;
    }
    const share = parseTripShare(tripId, docSnap.id, docSnap.data());
    if (!share || !isShareUsable(share)) {
      return null;
    }
    return { tripId, share };
  },

  subscribeActiveShareByToken: (
    token: string,
    onNext: (value: { tripId: string; share: TripShare } | null) => void,
    onError?: (e: Error) => void,
  ): (() => void) => {
    const trimmed = token.trim();
    if (!trimmed) {
      onNext(null);
      return () => {};
    }
    const q = query(collectionGroup(firestoreDb, SHARES_SUBCOLLECTION), where("token", "==", trimmed), limit(2));
    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          onNext(null);
          return;
        }
        const docSnap = snap.docs[0];
        if (!docSnap) {
          onNext(null);
          return;
        }
        const tripId = docSnap.ref.parent.parent?.id;
        if (!tripId) {
          onNext(null);
          return;
        }
        const share = parseTripShare(tripId, docSnap.id, docSnap.data());
        if (!share || !isShareUsable(share)) {
          onNext(null);
          return;
        }
        onNext({ tripId, share });
      },
      (err) => {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    );
  },

  listSharesForTripOwner: async (ownerUserId: string, tripId: string): Promise<TripShare[]> => {
    const trip = await tripsRepository.getTripById(ownerUserId, tripId);
    if (!trip) {
      return [];
    }
    const snap = await getDocs(collection(doc(firestoreDb, firestoreCollections.trips, tripId), SHARES_SUBCOLLECTION));
    const out: TripShare[] = [];
    for (const d of snap.docs) {
      const row = parseTripShare(tripId, d.id, d.data());
      if (row) {
        out.push(row);
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  createShare: async (ownerUserId: string, tripId: string, input: CreateTripShareInput): Promise<TripShare> => {
    const trip = await tripsRepository.getTripById(ownerUserId, tripId);
    if (!trip) {
      throw new Error("Trip not found");
    }
    const shareId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `sh_${Date.now()}`;
    const token = generateShareToken();
    const createdAt = nowIso();
    const share: TripShare = {
      id: shareId,
      tripId,
      ownerUserId,
      token,
      access: "read_only",
      createdAt,
      expiresAt: input.expiresAt?.trim() || undefined,
      includeLiveStatus: input.includeLiveStatus,
      includeDocuments: input.includeDocuments,
      includeCosts: input.includeCosts,
    };
    const batch = writeBatch(firestoreDb);
    batch.set(shareDocRef(tripId, shareId), serializeTripShare(share));
    batch.update(doc(firestoreDb, firestoreCollections.trips, tripId), {
      publicReadEnabled: true,
      updatedAt: createdAt,
    });
    await batch.commit();
    return share;
  },

  revokeShare: async (ownerUserId: string, tripId: string, shareId: string): Promise<void> => {
    const trip = await tripsRepository.getTripById(ownerUserId, tripId);
    if (!trip) {
      throw new Error("Trip not found");
    }
    await updateDoc(shareDocRef(tripId, shareId), { revokedAt: nowIso() });
    await syncTripPublicReadEnabled(tripId);
  },

  /** Removes all share docs before deleting the parent trip (Firestore does not cascade subcollections). */
  deleteAllSharesForTrip: async (ownerUserId: string, tripId: string): Promise<void> => {
    const trip = await tripsRepository.getTripById(ownerUserId, tripId);
    if (!trip) {
      return;
    }
    const snap = await getDocs(collection(doc(firestoreDb, firestoreCollections.trips, tripId), SHARES_SUBCOLLECTION));
    if (snap.empty) {
      return;
    }
    const batch = writeBatch(firestoreDb);
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
  },

  regenerateShare: async (
    ownerUserId: string,
    tripId: string,
    previousShareId: string,
    input: CreateTripShareInput,
  ): Promise<TripShare> => {
    const trip = await tripsRepository.getTripById(ownerUserId, tripId);
    if (!trip) {
      throw new Error("Trip not found");
    }
    const newShareId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `sh_${Date.now()}`;
    const token = generateShareToken();
    const createdAt = nowIso();
    const share: TripShare = {
      id: newShareId,
      tripId,
      ownerUserId,
      token,
      access: "read_only",
      createdAt,
      expiresAt: input.expiresAt?.trim() || undefined,
      includeLiveStatus: input.includeLiveStatus,
      includeDocuments: input.includeDocuments,
      includeCosts: input.includeCosts,
    };
    const batch = writeBatch(firestoreDb);
    batch.update(shareDocRef(tripId, previousShareId), { revokedAt: createdAt });
    batch.set(shareDocRef(tripId, newShareId), serializeTripShare(share));
    batch.update(doc(firestoreDb, firestoreCollections.trips, tripId), {
      publicReadEnabled: true,
      updatedAt: createdAt,
    });
    await batch.commit();
    return share;
  },
};
