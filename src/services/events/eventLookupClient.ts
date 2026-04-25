import { eventSearchResponseSchema } from "../../entities/events/eventLookup.schema";
import type { EventLookupResult } from "../../entities/events/eventLookup.model";
import { firebaseAuth } from "../firebase/firebaseApp";

export interface EventSearchParams {
  query: string;
  mode: "upcoming" | "past";
  city?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  signal?: AbortSignal;
}

const baseUrl = (): string => {
  const fromEnv = import.meta.env.VITE_EVENTS_API_URL?.trim();
  return (fromEnv ?? "/api/events").replace(/\/$/, "");
};

export const fetchEventSearch = async (params: EventSearchParams): Promise<{ results: EventLookupResult[]; warnings?: string[] }> => {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error("auth_required");
  }
  const idToken = await user.getIdToken();
  const sp = new URLSearchParams();
  sp.set("query", params.query);
  sp.set("mode", params.mode);
  if (params.city?.trim()) {
    sp.set("city", params.city.trim());
  }
  if (params.country?.trim()) {
    sp.set("country", params.country.trim());
  }
  if (params.startDate?.trim()) {
    sp.set("startDate", params.startDate.trim());
  }
  if (params.endDate?.trim()) {
    sp.set("endDate", params.endDate.trim());
  }
  sp.set("limit", String(params.limit ?? 12));

  const url = `${baseUrl()}/search?${sp.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` },
    signal: params.signal,
  });

  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = json as { error?: string };
    throw new Error(err.error ?? `http_${response.status}`);
  }
  const parsed = eventSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { results: [], warnings: ["invalid_payload"] };
  }
  return { results: parsed.data.results, warnings: parsed.data.warnings };
};
