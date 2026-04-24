import { addDoc, collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { z } from "zod";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { nowIso, timestampToIso } from "../timestampMapper";

export type ChatRole = "user" | "assistant" | "system";

export interface TripChatThread {
  id: string;
  userId: string;
  tripId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripChatMessage {
  id: string;
  userId: string;
  tripId: string;
  threadId: string;
  role: ChatRole;
  content: string;
  structuredPatchSummary?: string;
  createdAt: string;
}

const tripChatMessageSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tripId: z.string(),
  threadId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  structuredPatchSummary: z.string().optional(),
  createdAt: z.string(),
});

export const tripChatRepository = {
  getRecentMessages: async (tripId: string, threadId: string, pageSize = 24): Promise<TripChatMessage[]> => {
    const messagesQuery = query(
      collection(firestoreDb, firestoreCollections.tripChatMessages),
      where("tripId", "==", tripId),
      where("threadId", "==", threadId),
      orderBy("createdAt", "desc"),
      limit(pageSize),
    );
    const snapshot = await getDocs(messagesQuery);
    return snapshot.docs
      .map((messageDoc) => {
        const data = messageDoc.data();
        return tripChatMessageSchema.parse({
          ...data,
          id: messageDoc.id,
          createdAt: timestampToIso(data.createdAt),
        });
      })
      .reverse();
  },

  appendMessage: async (message: Omit<TripChatMessage, "id" | "createdAt">): Promise<TripChatMessage> => {
    const createdAt = nowIso();
    const ref = await addDoc(collection(firestoreDb, firestoreCollections.tripChatMessages), {
      ...message,
      createdAt,
    });

    return {
      ...message,
      id: ref.id,
      createdAt,
    };
  },
};
