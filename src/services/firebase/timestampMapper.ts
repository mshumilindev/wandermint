import { Timestamp } from "firebase/firestore";

export const nowIso = (): string => new Date().toISOString();

export const timestampToIso = (value: unknown): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return nowIso();
};

export const isoToTimestamp = (value: string): Timestamp => Timestamp.fromDate(new Date(value));
