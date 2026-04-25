import type { EventSearchResult } from "../../../features/events/eventSearch.types";

export type SongkickSearchParams = {
  query: string;
  city?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  signal?: AbortSignal;
};

/**
 * Songkick’s public API is not broadly available for new consumer keys.
 * This module is a safe extension point: wired into the aggregator, returns []
 * until a supported backend or contract is added.
 */
export const searchSongkickEvents = async (_params: SongkickSearchParams): Promise<EventSearchResult[]> => {
  const key = import.meta.env.VITE_SONGKICK_API_KEY?.trim();
  if (!key) {
    return [];
  }
  return [];
};
