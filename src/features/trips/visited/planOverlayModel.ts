/** Overlay only — never mutates Firestore day plan blocks. */

export type VisitMarkSource =
  | "manual"
  | "suggested_time"
  | "suggested_location"
  | "suggested_time_location"
  | "suggested_skip"
  | "suggested_insert";

export interface ActivityOverlayEntry {
  visited?: boolean;
  visitedAt?: string;
  skipped?: boolean;
  skippedAt?: string;
  source?: VisitMarkSource;
}

/** Lightweight insert suggestion materialized in overlay until user accepts / dismisses. */
export interface InsertedPlanStub {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  /** Place after which this insert is suggested (stable activity key). */
  afterActivityKey: string;
  createdAt: string;
}

export interface TripPlanOverlay {
  /** Stable activity key → overlay flags */
  activities: Record<string, ActivityOverlayEntry>;
  /** suggestion fingerprint → dismissed at ISO */
  dismissed: Record<string, string>;
  /** Cooldown until epoch ms — visit prompts keyed by `visit_prompt::{activityKey}`, others by kind. */
  cooldownUntil: Record<string, number>;
  /** Pending insert rows (UI only until synced to server elsewhere). */
  inserted: InsertedPlanStub[];
}

export const emptyTripPlanOverlay = (): TripPlanOverlay => ({
  activities: {},
  dismissed: {},
  cooldownUntil: {},
  inserted: [],
});
