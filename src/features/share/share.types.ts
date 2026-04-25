export type TripShareAccess = "read_only";

/** Stored at `trips/{tripId}/shares/{shareId}` */
export type TripShare = {
  id: string;
  tripId: string;
  ownerUserId: string;
  token: string;
  access: TripShareAccess;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  includeLiveStatus: boolean;
  includeDocuments: boolean;
  includeCosts: boolean;
};

export type CreateTripShareInput = {
  includeLiveStatus: boolean;
  includeDocuments: boolean;
  includeCosts: boolean;
  /** ISO; omit for no expiry */
  expiresAt?: string | null;
};
