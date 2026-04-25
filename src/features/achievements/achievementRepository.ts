import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

import { firestoreCollections } from "../../shared/config/product";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import { nowIso } from "../../services/firebase/timestampMapper";
import type { AchievementProgress } from "./achievement.types";

/**
 * Firestore: `users/{userId}/achievements/{achievementId}` — `achievementId` matches {@link Achievement.key}.
 */
const achievementDocRef = (userId: string, achievementId: string) =>
  doc(collection(doc(firestoreDb, firestoreCollections.users, userId), "achievements"), achievementId);

export type AchievementProgressDocument = AchievementProgress & {
  updatedAt: string;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const parseProgress = (achievementKey: string, raw: unknown, expectedUserId: string): AchievementProgressDocument | null => {
  if (!isRecord(raw)) {
    return null;
  }
  const userId = typeof raw.userId === "string" ? raw.userId : "";
  if (userId !== expectedUserId) {
    return null;
  }
  const key = typeof raw.achievementKey === "string" ? raw.achievementKey : achievementKey;
  const progress = typeof raw.progress === "number" ? raw.progress : Number(raw.progress);
  const target = typeof raw.target === "number" ? raw.target : Number(raw.target);
  if (!Number.isFinite(progress) || !Number.isFinite(target)) {
    return null;
  }
  return {
    userId,
    achievementKey: key,
    progress,
    target,
    unlocked: Boolean(raw.unlocked),
    unlockedAt: typeof raw.unlockedAt === "string" ? raw.unlockedAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
};

const serialize = (row: AchievementProgressDocument): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    userId: row.userId,
    achievementKey: row.achievementKey,
    progress: row.progress,
    target: row.target,
    unlocked: row.unlocked,
    updatedAt: row.updatedAt,
  };
  if (row.unlockedAt !== undefined) {
    out.unlockedAt = row.unlockedAt;
  }
  return out;
};

export const achievementRepository = {
  getByKey: async (userId: string, achievementKey: string): Promise<AchievementProgressDocument | null> => {
    if (!userId.trim() || !achievementKey.trim()) {
      return null;
    }
    const snap = await getDoc(achievementDocRef(userId, achievementKey));
    if (!snap.exists()) {
      return null;
    }
    return parseProgress(achievementKey, snap.data(), userId);
  },

  listByUserId: async (userId: string): Promise<AchievementProgressDocument[]> => {
    if (!userId.trim()) {
      return [];
    }
    const snap = await getDocs(collection(doc(firestoreDb, firestoreCollections.users, userId), "achievements"));
    const out: AchievementProgressDocument[] = [];
    for (const d of snap.docs) {
      const row = parseProgress(d.id, d.data(), userId);
      if (row) {
        out.push(row);
      }
    }
    return out.sort((a, b) => a.achievementKey.localeCompare(b.achievementKey));
  },

  saveProgress: async (row: AchievementProgressDocument): Promise<void> => {
    if (!row.userId.trim() || !row.achievementKey.trim()) {
      throw new TypeError("Achievement progress requires userId and achievementKey.");
    }
    await setDoc(achievementDocRef(row.userId, row.achievementKey), serialize(row));
  },
};
