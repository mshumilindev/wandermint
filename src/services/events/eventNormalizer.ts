import type { EventLookupResult } from "../../entities/events/eventLookup.model";

const dedupeKey = (e: EventLookupResult): string =>
  e.providerEventId?.trim() ||
  `${e.title.toLowerCase()}|${e.startDate ?? ""}|${(e.venueName ?? "").toLowerCase()}|${(e.city ?? "").toLowerCase()}`;

export const dedupeEventResults = (items: EventLookupResult[]): EventLookupResult[] => {
  const seen = new Set<string>();
  const out: EventLookupResult[] = [];
  for (const item of items) {
    const k = dedupeKey(item);
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(item);
  }
  return out;
};

export const sortEventResults = (
  items: EventLookupResult[],
  query: string,
  mode: "upcoming" | "past",
  city?: string,
  country?: string,
): EventLookupResult[] => {
  const q = query.toLowerCase().trim();
  const c = city?.toLowerCase().trim() ?? "";
  const co = country?.toLowerCase().trim() ?? "";
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
  return dedupeEventResults([...items]).sort((a, b) => score(b) - score(a));
};
