/**
 * Trip attachments (tickets, confirmations, screenshots, PDFs, notes).
 * Do not run OCR or extract text from uploaded files unless the user explicitly
 * requests that flow — store {@link TripDocument.fileUrl} / {@link TripDocument.textContent}
 * as provided only (Rule 4).
 */
export type TripDocumentType = "ticket" | "hotel" | "reservation" | "note" | "pdf" | "other";

export type TripDocument = {
  id: string;
  tripId: string;
  /** When set, document is scoped to a plan block / itinerary row (Rule 1). */
  itemId?: string;
  type: TripDocumentType;
  /** Remote URL or `blob:` URL after user upload; never fetched or parsed by default. */
  fileUrl?: string;
  /** User-entered or explicitly pasted text (e.g. note body). Not auto-filled from files. */
  textContent?: string;
  createdAt: string;
  /**
   * Optional display label for UI / offline lists without opening the file.
   * (Rule 3: metadata for offline cache.)
   */
  displayName?: string;
  /** Optional MIME hint set by uploader (e.g. `application/pdf`, `image/png`). */
  mimeType?: string;
};

/** Subset safe to embed in offline bundles when trimming payload size (keeps Rule 3 metadata). */
export type TripDocumentOfflineMeta = Pick<
  TripDocument,
  "id" | "tripId" | "itemId" | "type" | "createdAt" | "displayName" | "mimeType"
> & {
  /** Preserve URL string for precache / open-online flows; omit only if quota-critical. */
  fileUrl?: string;
  /** Include short notes only when offline copy is desired; large blobs may be stripped by caller. */
  textContent?: string;
};
