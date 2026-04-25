import { useEffect, useRef, useState } from "react";
import type { EventLookupResult } from "../../../entities/events/eventLookup.model";
import { searchBackfillPastEvents } from "../../../features/events/eventBackfillService";
import type { TripEventSearchContext } from "../../../features/events/eventSearch.types";
import { searchResultToLookupResult, searchUpcomingEvents } from "../../../features/events/eventSearchService";

export interface UseEventLookupParams {
  query: string;
  mode: "upcoming" | "past";
  city?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
  minChars?: number;
  debounceMs?: number;
  enabled?: boolean;
  /** When false, external catalog search is disabled (privacy). Defaults to true for callers that omit it. */
  externalSearchAllowed?: boolean;
}

export interface UseEventLookupState {
  results: EventLookupResult[];
  warnings: string[];
  loading: boolean;
  error: string | null;
}

export const useEventLookup = (params: UseEventLookupParams): UseEventLookupState => {
  const minChars = params.minChars ?? 3;
  const debounceMs = params.debounceMs ?? 520;
  const enabled = params.enabled ?? true;
  const externalSearchAllowed = params.externalSearchAllowed !== false;
  const [results, setResults] = useState<EventLookupResult[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = params.query.trim();
    if (!enabled || !externalSearchAllowed || q.length < minChars) {
      controllerRef.current?.abort();
      setResults([]);
      setWarnings([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      void (async (): Promise<void> => {
        try {
          const ctx: TripEventSearchContext = {
            tripCity: params.city,
            tripCountry: params.country,
            tripStartDate: params.startDate,
            tripEndDate: params.endDate,
          };
          const payload =
            params.mode === "upcoming"
              ? await searchUpcomingEvents({ query: q, context: ctx, signal: controller.signal })
              : await searchBackfillPastEvents({ query: q, context: ctx, signal: controller.signal });
          if (!controller.signal.aborted) {
            setResults(payload.results.map(searchResultToLookupResult));
            setWarnings(payload.warnings ?? []);
          }
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(e instanceof Error ? e.message : "lookup_failed");
            setResults([]);
            setWarnings([]);
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [
    debounceMs,
    enabled,
    externalSearchAllowed,
    minChars,
    params.city,
    params.country,
    params.endDate,
    params.mode,
    params.query,
    params.startDate,
  ]);

  return { results, warnings, loading, error };
};
