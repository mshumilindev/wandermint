import { getAuth } from "firebase-admin/auth";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { searchBandsintownEvents } from "./events/bandsintownProvider.js";
import { searchSongkickEvents } from "./events/songkickProvider.js";
import { searchTicketmasterEvents } from "./events/ticketmasterProvider.js";
import type { EventLookupResult, SearchMode } from "./events/types.js";

const ticketmasterApiKey = defineSecret("TICKETMASTER_API_KEY");

const memCache = new Map<string, { expiresAt: number; payload: unknown }>();

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authorizationHeader.slice("Bearer ".length);
};

const verifyFirebaseUser = async (authorizationHeader: string | undefined): Promise<string | null> => {
  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
};

const readTicketmasterKey = (): string => {
  try {
    return ticketmasterApiKey.value().trim();
  } catch {
    return typeof process.env.TICKETMASTER_API_KEY === "string" ? process.env.TICKETMASTER_API_KEY.trim() : "";
  }
};

const dedupeResults = (items: EventLookupResult[]): EventLookupResult[] => {
  const seen = new Set<string>();
  const out: EventLookupResult[] = [];
  for (const item of items) {
    const key =
      item.providerEventId?.trim() ||
      `${item.title.toLowerCase()}|${item.startDate ?? ""}|${(item.venueName ?? "").toLowerCase()}|${(item.city ?? "").toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
};

const sortResults = (items: EventLookupResult[], query: string, mode: SearchMode, city?: string, country?: string): EventLookupResult[] => {
  const q = query.toLowerCase().trim();
  const c = city?.toLowerCase().trim() ?? "";
  const co = country?.toLowerCase().trim() ?? "";
  return [...items].sort((a, b) => {
    const score = (e: EventLookupResult): number => {
      let s = e.confidence * 4;
      const title = e.title.toLowerCase();
      if (q && title === q) {
        s += 6;
      } else if (q && title.includes(q)) {
        s += 3;
      }
      if (c && (e.city?.toLowerCase().includes(c) ?? false)) {
        s += 2;
      }
      if (co && (e.country?.toLowerCase().includes(co) ?? false)) {
        s += 1.5;
      }
      if (e.startDate) {
        const ts = Date.parse(e.startDate);
        if (Number.isFinite(ts)) {
          s += mode === "upcoming" ? -ts / 1e11 : ts / 1e11;
        }
      }
      return s;
    };
    return score(b) - score(a);
  });
};

export const eventsGateway = onRequest(
  {
    cors: true,
    region: "us-central1",
    timeoutSeconds: 25,
    memory: "256MiB",
    secrets: [ticketmasterApiKey],
  },
  async (request, response) => {
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "GET") {
      response.status(405).json({ error: "Method not allowed" });
      return;
    }

    const path = request.path || new URL(request.url, "http://localhost").pathname;
    if (!path.includes("/events/search")) {
      response.status(404).json({ error: "Not found" });
      return;
    }

    let userId: string | null = null;
    try {
      userId = await verifyFirebaseUser(request.header("authorization"));
    } catch {
      response.status(401).json({ error: "Invalid Firebase auth token" });
      return;
    }

    if (!userId) {
      response.status(401).json({ error: "Missing Firebase auth token" });
      return;
    }

    const url = new URL(request.url, "http://localhost");
    const query = (url.searchParams.get("query") ?? "").trim();
    const mode = (url.searchParams.get("mode") ?? "upcoming") as SearchMode;
    const city = url.searchParams.get("city")?.trim() ?? "";
    const country = url.searchParams.get("country")?.trim() ?? "";
    const startDate = url.searchParams.get("startDate")?.trim() ?? "";
    const endDate = url.searchParams.get("endDate")?.trim() ?? "";
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") ?? "12") || 12));

    if (query.length < 3) {
      response.status(400).json({ error: "query_too_short", results: [], warnings: ["min_query_length"] });
      return;
    }

    if (mode !== "upcoming" && mode !== "past") {
      response.status(400).json({ error: "invalid_mode" });
      return;
    }

    const cacheKey = JSON.stringify({ mode, query, city, country, startDate, endDate, limit });
    const ttlMs = mode === "upcoming" ? 6 * 60 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000;
    const cached = memCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      response.status(200).json(cached.payload);
      return;
    }

    const warnings: string[] = [];
    const tmKey = readTicketmasterKey();
    let tm: EventLookupResult[] = [];
    if (tmKey) {
      tm = await searchTicketmasterEvents({
        apiKey: tmKey,
        query,
        mode,
        city: city || undefined,
        countryCode: country.length === 2 ? country.toUpperCase() : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit,
      });
    } else {
      warnings.push("ticketmaster_not_configured");
    }

    const bi = await searchBandsintownEvents();
    const sk = await searchSongkickEvents();
    const merged = dedupeResults([...tm, ...bi, ...sk]);
    const sorted = sortResults(merged, query, mode, city, country);
    const payload = { results: sorted, warnings: warnings.length ? warnings : undefined };
    memCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, payload });
    response.status(200).json(payload);
  },
);
