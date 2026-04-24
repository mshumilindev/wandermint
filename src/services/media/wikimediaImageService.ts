const summaryCache = new Map<string, Promise<WikimediaSummaryResult | null>>();

interface WikimediaSummaryResponse {
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: {
    source?: string;
  };
  originalimage?: {
    source?: string;
  };
}

interface WikimediaSummaryResult {
  imageUrl: string;
  title?: string;
  description?: string;
  extract?: string;
}

interface ImageResolveInput {
  title: string;
  locationHint?: string;
  categoryHint?: string;
}

const normalizeToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const locationTokens = (locationHint?: string): string[] =>
  (locationHint ?? "")
    .split(/[,\-]/)
    .map((item) => normalizeToken(item))
    .filter((item) => item.length > 2);

const buildCandidates = ({ title, locationHint, categoryHint }: ImageResolveInput): Array<{ query: string; strictLocation: boolean }> => {
  const base = title.trim();
  const simplified = base.split(",")[0]?.trim() ?? base;
  const location = locationHint?.trim();
  const category = categoryHint?.trim();

  return [
    location ? { query: `${base}, ${location}`, strictLocation: true } : null,
    location ? { query: `${simplified}, ${location}`, strictLocation: true } : null,
    location && category ? { query: `${category} in ${location}`, strictLocation: true } : null,
    location ? { query: location, strictLocation: false } : null,
    category ? { query: `${category}`, strictLocation: false } : null,
    { query: base, strictLocation: false },
  ]
    .filter((item): item is { query: string; strictLocation: boolean } => Boolean(item))
    .map((item) => ({ ...item, query: item.query.trim() }))
    .filter((item, index, values) => item.query.length > 1 && values.findIndex((value) => value.query === item.query) === index);
};

const fetchSummaryImage = async (title: string): Promise<WikimediaSummaryResult | null> => {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as WikimediaSummaryResponse;
  const imageUrl = data.originalimage?.source ?? data.thumbnail?.source ?? null;
  if (!imageUrl) {
    return null;
  }

  return {
    imageUrl,
    title: data.title,
    description: data.description,
    extract: data.extract,
  };
};

export const wikimediaImageService = {
  resolveImage: async ({ title, locationHint, categoryHint }: ImageResolveInput): Promise<string | null> => {
    const candidates = buildCandidates({ title, locationHint, categoryHint });
    const requiredTokens = locationTokens(locationHint);

    for (const candidate of candidates) {
      if (!summaryCache.has(candidate.query)) {
        summaryCache.set(candidate.query, fetchSummaryImage(candidate.query).catch(() => null));
      }

      const summary = await summaryCache.get(candidate.query);
      if (!summary) {
        continue;
      }

      if (candidate.strictLocation && requiredTokens.length > 0) {
        const haystack = normalizeToken(`${summary.title ?? ""} ${summary.description ?? ""} ${summary.extract ?? ""}`);
        const hasLocationMatch = requiredTokens.some((token) => haystack.includes(token));
        if (!hasLocationMatch) {
          continue;
        }
      }

      return summary.imageUrl;
    }

    return null;
  },
};
