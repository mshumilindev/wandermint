/** Legacy Firestore trips without `schemaVersion` are treated as v1. */
export const TRIP_SCHEMA_VERSION_LEGACY_IMPLICIT = 1;

/** Current persisted trip + normalized plan-item projection shape. */
export const TRIP_SCHEMA_VERSION_CURRENT = 2;
