import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

const bodySchema = z.object({
  accessToken: z.string().min(40).max(4096),
});

export const instagramSaveToken = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const parsed = bodySchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid access token payload");
  }

  const db = getFirestore();
  const uid = request.auth.uid;
  const { accessToken } = parsed.data;

  await db.doc(`users/${uid}/integrations/instagram`).set(
    {
      accessToken,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.doc(`users/${uid}`).set(
    {
      instagramSummary: {
        connected: true,
        reconnectNeeded: false,
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true },
  );

  return { ok: true as const };
});
