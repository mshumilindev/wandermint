export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface CacheMeta {
  status: AsyncStatus;
  lastFetchedAt: number | null;
  lastValidatedAt?: number | null;
  isDirty: boolean;
  error: string | null;
}

export const createIdleCacheMeta = (): CacheMeta => ({
  status: "idle",
  lastFetchedAt: null,
  lastValidatedAt: null,
  isDirty: false,
  error: null,
});

export const isCacheFresh = (meta: CacheMeta | undefined, ttlMs: number): boolean => {
  if (!meta || meta.status !== "success" || meta.isDirty || meta.lastFetchedAt === null) {
    return false;
  }

  return Date.now() - meta.lastFetchedAt < ttlMs;
};

export const cacheDurations = {
  short: 2 * 60 * 1000,
  medium: 15 * 60 * 1000,
  long: 60 * 60 * 1000,
} as const;
