const SESSION_KEY = "wandermint_bucket_list_to_trip";

export type BucketListTripPrefill = {
  mustSeeLine: string;
  segmentCity?: string;
  segmentCountry?: string;
};

export const writeBucketListTripPrefill = (prefill: BucketListTripPrefill): void => {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(prefill));
};

export const readAndConsumeBucketListTripPrefill = (): BucketListTripPrefill | null => {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  sessionStorage.removeItem(SESSION_KEY);
  try {
    return JSON.parse(raw) as BucketListTripPrefill;
  } catch {
    return null;
  }
};
