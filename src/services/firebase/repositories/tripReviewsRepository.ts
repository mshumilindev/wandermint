import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { z } from "zod";
import type { TripReview } from "../../../features/trip-review/tripReview.types";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { timestampToIso } from "../timestampMapper";

const tripReviewSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tripId: z.string(),
  review: z.object({
    completionRate: z.number(),
    skipRate: z.number(),
    averageDelayMinutes: z.number(),
    mostSkippedCategories: z.array(z.string()),
    overloadedDays: z.array(z.string()),
    insights: z.array(z.string()),
  }),
  createdAt: z.string(),
});

export type TripReviewDocument = z.infer<typeof tripReviewSchema>;

const reviewsCol = () => collection(firestoreDb, firestoreCollections.tripReviews);

export const tripReviewDocId = (userId: string, tripId: string): string => `${userId}__${tripId}`;

export const tripReviewsRepository = {
  saveTripReview: async (docRow: TripReviewDocument): Promise<void> => {
    await setDoc(doc(reviewsCol(), docRow.id), docRow);
  },

  listByUserId: async (userId: string): Promise<TripReviewDocument[]> => {
    if (!userId.trim()) {
      return [];
    }
    const q = query(reviewsCol(), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => tripReviewsRepository.parseTripReviewDocument(d.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  deleteTripReview: async (reviewDocId: string): Promise<void> => {
    await deleteDoc(doc(reviewsCol(), reviewDocId));
  },

  deleteAllForUser: async (userId: string): Promise<void> => {
    if (!userId.trim()) {
      return;
    }
    const q = query(reviewsCol(), where("userId", "==", userId));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  },

  parseTripReviewDocument: (data: unknown): TripReviewDocument => {
    const raw = data as Record<string, unknown>;
    return tripReviewSchema.parse({
      ...raw,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : timestampToIso(raw.createdAt),
    });
  },
};
