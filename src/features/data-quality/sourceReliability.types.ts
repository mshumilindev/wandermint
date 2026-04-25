export type SourceName =
  | "google_places"
  | "ticketmaster"
  | "wikimedia"
  | "openstreetmap"
  | "ai_generated"
  | "manual_user_input"
  | "local_cache";

export type ReliabilityField = "title" | "location" | "openingHours" | "price" | "image" | "eventDate";

export type FieldReliability = {
  source: SourceName;
  /** Effective trust in [0, 1] after decay and caps. */
  confidence: number;
  lastVerifiedAt?: string;
};

export type EntityReliabilityMap = {
  title?: FieldReliability;
  location?: FieldReliability;
  openingHours?: FieldReliability;
  price?: FieldReliability;
  image?: FieldReliability;
  eventDate?: FieldReliability;
};

export type ReliabilityWarningSeverity = "low" | "medium" | "high";

export type FieldReliabilityWarning = {
  field: ReliabilityField;
  severity: ReliabilityWarningSeverity;
  /** Stable key for i18n (e.g. `dataQuality.openingHoursLowConfidence`). */
  messageKey: string;
  source: SourceName;
  confidence: number;
};
