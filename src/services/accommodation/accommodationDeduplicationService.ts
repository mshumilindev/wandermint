import type { AccommodationCandidate, AccommodationProvider } from "./accommodationTypes";

const CHAIN_TOKENS = new Set([
  "hilton",
  "marriott",
  "ibis",
  "radisson",
  "novotel",
  "mercure",
  "hyatt",
  "sheraton",
  "holiday",
  "inn",
  "westin",
  "ritz",
]);

const STOP = new Set(["the", "and", "of", "a", "an", "at", "by", "de", "la", "le", "das", "der"]);

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "");

const WEAK_SUFFIXES = /\b(hotel|hostel|apartments?|resort|spa|inn|suites?|guesthouse)\b/gi;

export const normalizeAccommodationName = (name: string): string => {
  const base = stripDiacritics(name.toLowerCase().trim())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(WEAK_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base;
};

export const normalizeAccommodationAddress = (address: string): string => {
  let s = stripDiacritics(address.toLowerCase().trim())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
  s = s.replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave").replace(/\broad\b/g, "rd").replace(/\bboulevard\b/g, "blvd");
  return s.trim();
};

export const normalizeAccommodationCity = (city: string): string =>
  stripDiacritics(city.toLowerCase().trim()).replace(/\s+/g, " ").trim();

export const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const tokenizeName = (normalized: string): Set<string> => {
  const tokens = new Set<string>();
  for (const raw of normalized.split(" ")) {
    const t = raw.trim();
    if (t.length < 2 || STOP.has(t)) {
      continue;
    }
    tokens.add(t);
  }
  return tokens;
};

export const nameSimilarity = (a: string, b: string): number => {
  const na = normalizeAccommodationName(a);
  const nb = normalizeAccommodationName(b);
  if (!na.length || !nb.length) {
    return 0;
  }
  if (na === nb) {
    return 1;
  }
  if (na.includes(nb) || nb.includes(na)) {
    return 0.92;
  }
  const A = tokenizeName(na);
  const B = tokenizeName(nb);
  if (A.size === 0 || B.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const t of A) {
    if (B.has(t)) {
      inter += 1;
    }
  }
  const denom = Math.max(A.size, B.size);
  return denom > 0 ? inter / denom : 0;
};

const addressSimilarEnough = (a?: string, b?: string): boolean => {
  if (!a?.trim() || !b?.trim()) {
    return false;
  }
  const na = normalizeAccommodationAddress(a);
  const nb = normalizeAccommodationAddress(b);
  if (na === nb) {
    return true;
  }
  return nameSimilarity(na, nb) > 0.55;
};

const nameContainsChain = (name: string): boolean => {
  const n = normalizeAccommodationName(name);
  return [...CHAIN_TOKENS].some((c) => n.includes(c));
};

const providerRank = (p: AccommodationProvider): number => {
  if (p === "booking_demand") {
    return 4;
  }
  if (p === "amadeus") {
    return 3;
  }
  if (p === "google_places") {
    return 2;
  }
  if (p === "openstreetmap") {
    return 1;
  }
  return 0;
};

const certaintyRank = (c: AccommodationCandidate["estimatedPrice"]): number => {
  if (!c) {
    return 0;
  }
  if (c.certainty === "exact") {
    return 3;
  }
  if (c.certainty === "estimated") {
    return 2;
  }
  return 1;
};

export const mergeAccommodationCandidates = (primary: AccommodationCandidate, secondary: AccommodationCandidate): AccommodationCandidate => {
  const mergedProviders = [...new Set([...(primary.mergedFromProviders ?? [primary.provider]), ...(secondary.mergedFromProviders ?? [secondary.provider])])];

  const pickName =
    primary.name.trim().length >= secondary.name.trim().length && primary.name.trim().length >= 8 ? primary.name : secondary.name || primary.name;

  const city = primary.city?.trim() || secondary.city?.trim();
  const country = primary.country?.trim() || secondary.country?.trim();
  const address = primary.address?.trim() || secondary.address?.trim();
  const coordinates = primary.coordinates ?? secondary.coordinates;
  const imageUrl = primary.imageUrl?.trim() || secondary.imageUrl?.trim();

  const ratingPick =
    primary.reviewCount && secondary.reviewCount
      ? primary.reviewCount >= secondary.reviewCount
        ? primary
        : secondary
      : primary.rating !== undefined
        ? primary
        : secondary;

  const pricePrimary = primary.estimatedPrice;
  const priceSecondary = secondary.estimatedPrice;
  let estimatedPrice = pricePrimary;
  if (priceSecondary) {
    if (!pricePrimary || certaintyRank(priceSecondary) > certaintyRank(pricePrimary)) {
      estimatedPrice = priceSecondary;
    } else if (certaintyRank(priceSecondary) === certaintyRank(pricePrimary) && pricePrimary && priceSecondary) {
      const wPrimary = (pricePrimary.max ?? 0) - (pricePrimary.min ?? 0);
      const wSecondary = (priceSecondary.max ?? 0) - (priceSecondary.min ?? 0);
      estimatedPrice = wSecondary < wPrimary ? priceSecondary : pricePrimary;
    }
  }

  const url =
    primary.provider === "booking_demand" || primary.provider === "amadeus"
      ? primary.url
      : secondary.provider === "booking_demand" || secondary.provider === "amadeus"
        ? secondary.url
        : primary.url ?? secondary.url;

  const categories = [...new Set([...primary.categories, ...secondary.categories])];
  const relevanceScore = Math.max(primary.relevanceScore ?? 0, secondary.relevanceScore ?? 0) + 0.02 * (mergedProviders.length - 1);

  return {
    ...primary,
    name: pickName,
    city,
    country,
    address,
    coordinates,
    imageUrl,
    rating: ratingPick.rating,
    ratingSource: ratingPick.ratingSource,
    reviewCount: Math.max(primary.reviewCount ?? 0, secondary.reviewCount ?? 0),
    estimatedPrice,
    url,
    categories,
    mergedFromProviders: mergedProviders,
    relevanceScore,
  };
};

const countryConflict = (a: AccommodationCandidate, b: AccommodationCandidate): boolean => {
  const ca = (a.country ?? "").toLowerCase().trim();
  const cb = (b.country ?? "").toLowerCase().trim();
  if (!ca || !cb) {
    return false;
  }
  return ca !== cb;
};

const duplicatePair = (a: AccommodationCandidate, b: AccommodationCandidate): boolean => {
  if (!a.name.trim() || !b.name.trim()) {
    return false;
  }
  if (countryConflict(a, b)) {
    return false;
  }
  const cityA = normalizeAccommodationCity(a.city ?? "");
  const cityB = normalizeAccommodationCity(b.city ?? "");
  const sameCity = !cityA || !cityB || cityA === cityB;
  if (!sameCity) {
    return false;
  }

  const sim = nameSimilarity(a.name, b.name);
  const dist =
    a.coordinates && b.coordinates ? distanceMeters({ lat: a.coordinates.lat, lng: a.coordinates.lng }, { lat: b.coordinates.lat, lng: b.coordinates.lng }) : null;

  const chainA = nameContainsChain(a.name);
  const chainB = nameContainsChain(b.name);
  if (chainA || chainB) {
    if (dist !== null) {
      if (dist >= 150) {
        return false;
      }
      if (sim > 0.85 && dist < 150) {
        return true;
      }
      if (dist < 50 && sim > 0.65) {
        return true;
      }
      return false;
    }
    return sim > 0.92 && addressSimilarEnough(a.address, b.address);
  }

  if (dist !== null && sim > 0.85 && dist < 150) {
    return true;
  }
  if (dist !== null && dist < 50 && sim > 0.65) {
    return true;
  }
  if (dist === null && sim > 0.92) {
    const addrOk = !a.address?.trim() || !b.address?.trim() || addressSimilarEnough(a.address, b.address);
    return addrOk;
  }
  return false;
};

export const deduplicateAccommodations = (candidates: AccommodationCandidate[]): AccommodationCandidate[] => {
  const valid = candidates.filter((c) => c.name.trim().length > 0);
  const groups = new Map<string, AccommodationCandidate[]>();
  for (const c of valid) {
    const city = normalizeAccommodationCity(c.city ?? "");
    const country = normalizeAccommodationCity(c.country ?? "");
    const key = `${country}|${city}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(c);
    groups.set(key, bucket);
  }

  const merged: AccommodationCandidate[] = [];
  for (const [, bucket] of groups) {
    const sorted = [...bucket].sort((x, y) => {
      const pr = providerRank(y.provider) - providerRank(x.provider);
      if (pr !== 0) {
        return pr;
      }
      return (y.relevanceScore ?? 0) - (x.relevanceScore ?? 0);
    });
    const accepted: AccommodationCandidate[] = [];
    for (const cand of sorted) {
      const idx = accepted.findIndex((ex) => duplicatePair(ex, cand));
      if (idx < 0) {
        accepted.push({ ...cand, mergedFromProviders: cand.mergedFromProviders ?? [cand.provider] });
        continue;
      }
      const primary = accepted[idx]!;
      accepted[idx] =
        providerRank(cand.provider) > providerRank(primary.provider)
          ? mergeAccommodationCandidates(cand, primary)
          : mergeAccommodationCandidates(primary, cand);
    }
    merged.push(...accepted);
  }

  return merged.sort((a, b) => {
    const rs = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    if (rs !== 0) {
      return rs;
    }
    const rat = (b.rating ?? 0) - (a.rating ?? 0);
    if (rat !== 0) {
      return rat;
    }
    const rc = (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
    if (rc !== 0) {
      return rc;
    }
    return a.name.localeCompare(b.name);
  });
};
