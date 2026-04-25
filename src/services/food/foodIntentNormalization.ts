/**
 * Maps free-text food wishes to stable cuisine / dish tags for planning prompts.
 * Unknown phrases fall back to a single slug token derived from the label.
 */

const PHRASE_TAGS: Record<string, string[]> = {
  oysters: ["seafood", "oysters"],
  oyster: ["seafood", "oysters"],
  ramen: ["japanese", "ramen"],
  sushi: ["japanese", "sushi"],
  sashimi: ["japanese", "sashimi"],
  tapas: ["spanish", "tapas"],
  paella: ["spanish", "paella"],
  curry: ["south_asian", "curry"],
  tacos: ["mexican", "tacos"],
  taco: ["mexican", "tacos"],
  barbecue: ["bbq", "grilled"],
  bbq: ["bbq", "grilled"],
  pizza: ["italian", "pizza"],
  pasta: ["italian", "pasta"],
  croissant: ["french", "bakery"],
  brunch: ["brunch", "cafe"],
  wine: ["wine_bar", "wine"],
  coffee: ["cafe", "coffee"],
  dimsum: ["chinese", "dim_sum"],
  "dim sum": ["chinese", "dim_sum"],
  pho: ["vietnamese", "pho"],
  steak: ["steakhouse", "steak"],
  seafood: ["seafood"],
  vegan: ["vegan"],
  vegetarian: ["vegetarian"],
  streetfood: ["street_food"],
  "street food": ["street_food"],
};

const slugFromLabel = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

export const normalizeFoodIntentLabel = (raw: string): string[] => {
  const trimmed = raw.trim();
  if (!trimmed.length) {
    return [];
  }
  const lower = trimmed.toLowerCase();
  const direct = PHRASE_TAGS[lower];
  if (direct) {
    return [...direct];
  }
  for (const [phrase, tags] of Object.entries(PHRASE_TAGS)) {
    if (phrase.length >= 3 && (lower.includes(phrase) || phrase.includes(lower))) {
      return [...tags];
    }
  }
  const slug = slugFromLabel(trimmed);
  return slug.length > 0 ? [slug] : [];
};
