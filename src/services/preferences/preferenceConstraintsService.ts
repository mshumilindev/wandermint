import type { AvoidConstraint, PreferenceProfile } from "../../entities/user/model";

const norm = (s: string | undefined): string => s?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";

const tokensMatch = (haystack: string, needle: string): boolean => {
  const h = norm(haystack);
  const n = norm(needle);
  if (!n || !h) {
    return false;
  }
  return h === n || h.includes(n) || n.includes(h);
};

/**
 * True when a trip segment / suggestion destination must be suppressed (hard block).
 */
export const isDestinationLocationAvoided = (profile: PreferenceProfile | null | undefined, input: { country: string; city?: string }): boolean => {
  if (!profile?.avoid?.length) {
    return false;
  }
  const country = input.country;
  const city = input.city ?? "";
  for (const c of profile.avoid) {
    const v = c.value;
    if (!norm(v)) {
      continue;
    }
    switch (c.type) {
      case "country":
        if (tokensMatch(country, v)) {
          return true;
        }
        break;
      case "city":
        if (city && tokensMatch(city, v)) {
          return true;
        }
        break;
      case "region":
        if (tokensMatch(country, v) || tokensMatch(city, v)) {
          return true;
        }
        for (const part of v.split(/[,|]/)) {
          const p = part.trim();
          if (p && (tokensMatch(country, p) || tokensMatch(city, p))) {
            return true;
          }
        }
        break;
      case "category":
        break;
      default:
        break;
    }
  }
  return false;
};

/** Curated catalogue row — block by geography or when a tag matches an avoided category. */
export const isCuratedDestinationAvoided = (
  profile: PreferenceProfile | null | undefined,
  seed: { country: string; city?: string; tags: string[] },
): boolean => {
  if (isDestinationLocationAvoided(profile, { country: seed.country, city: seed.city })) {
    return true;
  }
  if (!profile?.avoid?.length) {
    return false;
  }
  for (const c of profile.avoid) {
    if (c.type !== "category") {
      continue;
    }
    const needle = norm(c.value);
    if (!needle) {
      continue;
    }
    for (const tag of seed.tags) {
      if (tokensMatch(tag, needle)) {
        return true;
      }
    }
  }
  return false;
};

export const defaultPreferenceProfile = (): PreferenceProfile => ({ avoid: [], prefer: [] });

const isAvoidConstraint = (v: unknown): v is AvoidConstraint => {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as { type?: unknown; value?: unknown };
  const t = o.type;
  const val = o.value;
  return (
    (t === "country" || t === "city" || t === "region" || t === "category") && typeof val === "string" && val.trim().length > 0
  );
};

export const mergePreferenceProfile = (raw: PreferenceProfile | null | undefined): PreferenceProfile => ({
  avoid: Array.isArray(raw?.avoid) ? raw!.avoid.filter(isAvoidConstraint) : [],
  prefer: Array.isArray(raw?.prefer) ? raw!.prefer.map((s) => String(s).trim()).filter(Boolean) : [],
});

export const formatAvoidConstraintsForPlanningGuidance = (profile: PreferenceProfile): string => {
  if (!profile.avoid.length) {
    return "";
  }
  const lines = profile.avoid.map((c) => `- ${c.type}: ${c.value.trim()}`);
  return `HARD AVOID (account settings — never schedule stops, layovers, or intercity corridors through these; do not substitute nearby proxies in the same blocked jurisdiction): ${lines.join(" ")}`;
};

export const buildTripGenerationAvoidClause = (profile: PreferenceProfile | null | undefined): string => {
  const merged = mergePreferenceProfile(profile ?? null);
  if (!merged.avoid.length) {
    return "";
  }
  const lines = merged.avoid.map((c) => `- ${c.type}: "${c.value.trim()}"`);
  const prefer = merged.prefer.length ? `Soft preferences (bias only, never override avoids): ${merged.prefer.slice(0, 16).join("; ")}` : "";
  return [
    "ABSOLUTE TRAVEL BLOCKS (user account settings — overrides every other instruction including discovery, creativity, or 'best value'):",
    ...lines,
    "Do not place primary destinations, day hubs, overnight bases, or transfer corridors in any blocked country, city, region token, or primary category match above.",
    "If the wizard segments already sit in a blocked area, refuse to invent logistics there — surface tradeoffs instead of silently relocating.",
    prefer,
  ]
    .filter(Boolean)
    .join("\n");
};
