export type InternalPlaceCategory =
  | "cafe"
  | "restaurant"
  | "local_food"
  | "traditional_drinks"
  | "museum"
  | "gallery"
  | "cinema"
  | "landmark"
  | "viewpoint"
  | "park"
  | "nightlife";

export interface PlaceCategoryDefinition {
  category: InternalPlaceCategory;
  selectors: string[];
}

const categoryDefinitions: Record<InternalPlaceCategory, PlaceCategoryDefinition> = {
  cafe: {
    category: "cafe",
    selectors: ['node["amenity"="cafe"]', 'way["amenity"="cafe"]'],
  },
  restaurant: {
    category: "restaurant",
    selectors: ['node["amenity"="restaurant"]', 'way["amenity"="restaurant"]'],
  },
  local_food: {
    category: "local_food",
    selectors: [
      'node["amenity"="restaurant"]["cuisine"]',
      'way["amenity"="restaurant"]["cuisine"]',
      'node["amenity"="fast_food"]["cuisine"]',
      'way["amenity"="fast_food"]["cuisine"]',
    ],
  },
  traditional_drinks: {
    category: "traditional_drinks",
    selectors: [
      'node["amenity"="bar"]',
      'way["amenity"="bar"]',
      'node["amenity"="pub"]',
      'way["amenity"="pub"]',
      'node["amenity"="biergarten"]',
      'way["amenity"="biergarten"]',
    ],
  },
  museum: {
    category: "museum",
    selectors: ['node["tourism"="museum"]', 'way["tourism"="museum"]', 'relation["tourism"="museum"]'],
  },
  gallery: {
    category: "gallery",
    selectors: [
      'node["tourism"="gallery"]',
      'way["tourism"="gallery"]',
      'node["amenity"="arts_centre"]',
      'way["amenity"="arts_centre"]',
    ],
  },
  cinema: {
    category: "cinema",
    selectors: ['node["amenity"="cinema"]', 'way["amenity"="cinema"]'],
  },
  landmark: {
    category: "landmark",
    selectors: [
      'node["tourism"="attraction"]',
      'way["tourism"="attraction"]',
      'node["historic"]',
      'way["historic"]',
      'node["heritage"]',
      'way["heritage"]',
    ],
  },
  viewpoint: {
    category: "viewpoint",
    selectors: ['node["tourism"="viewpoint"]', 'way["tourism"="viewpoint"]'],
  },
  park: {
    category: "park",
    selectors: [
      'node["leisure"="park"]',
      'way["leisure"="park"]',
      'node["leisure"="garden"]',
      'way["leisure"="garden"]',
    ],
  },
  nightlife: {
    category: "nightlife",
    selectors: [
      'node["amenity"="bar"]',
      'way["amenity"="bar"]',
      'node["amenity"="pub"]',
      'way["amenity"="pub"]',
      'node["amenity"="nightclub"]',
      'way["amenity"="nightclub"]',
    ],
  },
};

const normalize = (value: string): string => value.trim().toLowerCase();

const includesAny = (value: string, tokens: string[]): boolean => tokens.some((token) => value.includes(token));

const matchRawCategory = (rawCategory: string): InternalPlaceCategory[] => {
  const normalized = normalize(rawCategory);

  if (includesAny(normalized, ["traditional_drinks", "traditional drinks", "pub", "bar", "bier", "sake", "wine", "cocktail"])) {
    return ["traditional_drinks"];
  }

  if (includesAny(normalized, ["nightlife", "club", "night club"])) {
    return ["nightlife", "traditional_drinks"];
  }

  if (includesAny(normalized, ["local_food", "local food", "street food", "cuisine"])) {
    return ["local_food"];
  }

  if (includesAny(normalized, ["restaurant", "food", "meal", "dinner", "lunch"])) {
    return ["restaurant"];
  }

  if (includesAny(normalized, ["coffee", "cafe", "tea"])) {
    return ["cafe"];
  }

  if (includesAny(normalized, ["museum"])) {
    return ["museum"];
  }

  if (includesAny(normalized, ["gallery", "art"])) {
    return ["gallery"];
  }

  if (includesAny(normalized, ["cinema", "movie", "film"])) {
    return ["cinema"];
  }

  if (includesAny(normalized, ["viewpoint", "lookout"])) {
    return ["viewpoint"];
  }

  if (includesAny(normalized, ["park", "garden"])) {
    return ["park"];
  }

  if (includesAny(normalized, ["landmark", "historic", "attraction"])) {
    return ["landmark"];
  }

  return [];
};

export const resolveInternalPlaceCategories = (categories: string[], query?: string): InternalPlaceCategory[] => {
  const matched = new Set<InternalPlaceCategory>();

  categories.forEach((category) => {
    matchRawCategory(category).forEach((matchedCategory) => {
      matched.add(matchedCategory);
    });
  });

  const normalizedQuery = normalize(query ?? "");
  if (matched.has("traditional_drinks") && includesAny(normalizedQuery, ["tea", "coffee", "matcha"])) {
    matched.add("cafe");
  }

  if (matched.size === 0) {
    matched.add("cafe");
    matched.add("restaurant");
    matched.add("gallery");
  }

  return Array.from(matched);
};

export const getCategoryDefinition = (category: InternalPlaceCategory): PlaceCategoryDefinition => categoryDefinitions[category];

export const buildOverpassSelectors = (categories: InternalPlaceCategory[]): string[] => {
  const seen = new Set<string>();

  return categories.flatMap((category) => categoryDefinitions[category].selectors).filter((selector) => {
    if (seen.has(selector)) {
      return false;
    }

    seen.add(selector);
    return true;
  });
};
