import { createClientId } from "../../../shared/lib/id";
import { searchUpcomingEvents } from "../../events/eventSearchService";
import { publicGeoProvider } from "../../../services/providers/publicGeoProvider";
import { publicPlacesProvider } from "../../../services/providers/publicPlacesProvider";
import type {
  DiscoveryCategory,
  DiscoveryItem,
  DiscoveryItemType,
  DiscoverySearchParams,
  DiscoverySearchResult,
} from "./bucketListDiscovery.types";

const PLACE_CATEGORIES: Record<Exclude<DiscoveryCategory, "all">, string[]> = {
  places: ["landmark", "attraction", "architecture"],
  food: ["restaurant", "local_food"],
  drinks: ["traditional_drinks", "cafe"],
  events: [],
  museums: ["museum", "gallery"],
  nature: ["park", "viewpoint", "nature"],
  nightlife: ["nightlife", "traditional_drinks"],
  hidden_gems: ["landmark", "viewpoint"],
  photo_spots: ["viewpoint", "landmark"],
  shopping: ["market", "shopping"],
  wellness: ["wellness", "spa"],
  activities: ["activity", "hiking"],
};

const TYPE_BY_CATEGORY: Partial<Record<DiscoveryCategory, DiscoveryItemType>> = {
  food: "restaurant",
  drinks: "drink",
  museums: "museum",
  nightlife: "nightlife",
  nature: "nature",
  events: "event",
  hidden_gems: "hidden_gem",
  photo_spots: "photo_spot",
  shopping: "shopping",
  wellness: "wellness",
  activities: "activity",
  places: "landmark",
};

const normalize = (s: string): string => s.trim().toLowerCase();

const parseQueryAndLocation = (query: string, locationHint?: string): { queryCore: string; location: string | undefined } => {
  const core = query.trim();
  if (locationHint?.trim()) {
    return { queryCore: core, location: locationHint.trim() };
  }
  const inSplit = core.split(/\s+in\s+/i);
  if (inSplit.length >= 2) {
    const location = inSplit[inSplit.length - 1]?.trim();
    const queryCore = inSplit.slice(0, -1).join(" in ").trim();
    if (location && queryCore) {
      return { queryCore, location };
    }
  }
  const nearSplit = core.split(/\s+near\s+/i);
  if (nearSplit.length >= 2) {
    const location = nearSplit[nearSplit.length - 1]?.trim();
    const queryCore = nearSplit.slice(0, -1).join(" near ").trim();
    if (location && queryCore) {
      return { queryCore, location };
    }
  }
  return { queryCore: core, location: undefined };
};

const inferCategoryFromQuery = (query: string): DiscoveryCategory => {
  const q = normalize(query);
  if (/(festival|concert|live music|theatre|opera|exhibition|cinema|show)/i.test(q)) return "events";
  if (/(museum|gallery)/i.test(q)) return "museums";
  if (/(bar|wine|cocktail|whiskey|beer|nightlife|rooftop)/i.test(q)) return "drinks";
  if (/(food|ramen|dessert|coffee|tea|restaurant|street food|cuisine|seafood|matcha)/i.test(q)) return "food";
  if (/(beach|lake|mountain|park|hiking|viewpoint|sunset|nature)/i.test(q)) return "nature";
  if (/(photo|instagram|spot)/i.test(q)) return "photo_spots";
  if (/(hidden gem|hidden)/i.test(q)) return "hidden_gems";
  if (/(market|shopping|store|concept store)/i.test(q)) return "shopping";
  if (/(wellness|spa)/i.test(q)) return "wellness";
  if (/(activity|experience|sports)/i.test(q)) return "activities";
  return "places";
};

const asPlaceDiscovery = (input: {
  id: string;
  title: string;
  city?: string;
  country?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  type: DiscoveryItemType;
  category: DiscoveryCategory;
  sourceLabel: string;
  sourceProvider?: string;
  tags: string[];
}): DiscoveryItem => ({
  id: input.id,
  title: input.title,
  description: undefined,
  type: input.type,
  category: input.category,
  imageAlt: `${input.title} preview`,
  location: {
    city: input.city,
    country: input.country,
    address: input.address,
    coordinates:
      input.lat !== undefined && input.lng !== undefined
        ? {
            lat: input.lat,
            lng: input.lng,
          }
        : undefined,
  },
  rating: input.rating,
  source: {
    label: input.sourceLabel,
    provider: input.sourceProvider,
  },
  tags: input.tags,
});

const eventTypeFromTitle = (title: string): DiscoveryItemType => {
  const t = normalize(title);
  if (t.includes("festival")) return "festival";
  if (t.includes("opera")) return "opera";
  if (t.includes("theatre") || t.includes("theater")) return "theatre";
  if (t.includes("exhibition")) return "exhibition";
  if (t.includes("cinema")) return "cinema";
  if (t.includes("concert") || t.includes("live")) return "concert";
  return "event";
};

const fallbackItems = (query: string, category: DiscoveryCategory, locationHint?: string, limit = 12): DiscoveryItem[] => {
  const location = locationHint?.trim() || "your area";
  const presets: DiscoveryItem[] = [
    asPlaceDiscovery({
      id: `demo:${createClientId("disc")}`,
      title: `Hidden coffee corners in ${location}`,
      city: location,
      type: "cafe",
      category: "food",
      sourceLabel: "WanderMint demo discovery",
      sourceProvider: "demo",
      tags: ["coffee", "slow travel", "fallback"],
    }),
    asPlaceDiscovery({
      id: `demo:${createClientId("disc")}`,
      title: `Sunset viewpoints near ${location}`,
      city: location,
      type: "viewpoint",
      category: "photo_spots",
      sourceLabel: "WanderMint demo discovery",
      sourceProvider: "demo",
      tags: ["sunset", "photo", "fallback"],
    }),
    asPlaceDiscovery({
      id: `demo:${createClientId("disc")}`,
      title: `Local markets and concept stores in ${location}`,
      city: location,
      type: "market",
      category: "shopping",
      sourceLabel: "WanderMint demo discovery",
      sourceProvider: "demo",
      tags: ["market", "shopping", "fallback"],
    }),
  ].map((item) => ({
    ...item,
    source: {
      ...item.source,
      isFallback: true,
    },
  }));
  const filtered = category === "all" ? presets : presets.filter((item) => item.category === category || category === "places");
  if (filtered.length > 0) {
    return filtered.slice(0, limit);
  }
  return presets.slice(0, limit);
};

export const searchDiscoveryItems = async (params: DiscoverySearchParams): Promise<DiscoverySearchResult> => {
  const query = params.query.trim();
  const limit = Math.max(1, Math.min(24, params.limit ?? 12));
  const selectedCategory = params.category && params.category !== "all" ? params.category : inferCategoryFromQuery(query);
  const { queryCore, location } = parseQueryAndLocation(query, params.locationHint);
  const eventSearchAllowed = params.externalEventSearchAllowed ?? true;

  if (query.length < 2) {
    return { items: [], source: "empty", query };
  }

  try {
    const items: DiscoveryItem[] = [];

    const [cityRows, placeRows, eventRows] = await Promise.all([
      publicGeoProvider.searchCities(location || query, { limit: 6 }).catch(() => []),
      selectedCategory === "events"
        ? Promise.resolve([])
        : publicPlacesProvider
            .searchPlaces({
              locationLabel: location || query,
              query: queryCore || query,
              categories: selectedCategory === "all" ? PLACE_CATEGORIES.places : PLACE_CATEGORIES[selectedCategory] ?? [],
              radiusMeters: 5200,
            })
            .catch(() => []),
      eventSearchAllowed && (selectedCategory === "events" || inferCategoryFromQuery(query) === "events")
        ? searchUpcomingEvents({
            query,
            context: {
              tripCity: location,
            },
            limit: Math.max(8, limit),
          })
            .then((r) => r.results)
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    for (const c of cityRows.slice(0, 4)) {
      items.push({
        id: `geo:${normalize(`${c.city}|${c.country}`)}`,
        title: `${c.city}, ${c.country}`,
        type: "city",
        category: "places",
        description: c.region ? `${c.city} in ${c.region}` : undefined,
        imageAlt: `${c.city}, ${c.country}`,
        location: {
          city: c.city,
          region: c.region,
          country: c.country,
          coordinates: { lat: c.latitude, lng: c.longitude },
        },
        source: { label: "OpenStreetMap Nominatim", provider: "nominatim" },
        tags: ["city"],
      });
    }

    const placeType = TYPE_BY_CATEGORY[selectedCategory] ?? "landmark";
    for (const p of placeRows.slice(0, limit)) {
      items.push(
        asPlaceDiscovery({
          id: `place:${p.provider}:${p.providerPlaceId ?? p.name}`,
          title: p.name,
          city: p.city,
          country: p.country,
          address: p.address,
          lat: p.latitude,
          lng: p.longitude,
          rating: p.rating,
          type: placeType,
          category: selectedCategory,
          sourceLabel: "OpenStreetMap Overpass",
          sourceProvider: "openstreetmap-overpass",
          tags: [selectedCategory, "discovery"],
        }),
      );
    }

    for (const e of eventRows.slice(0, Math.max(4, Math.floor(limit / 2)))) {
      items.push({
        id: `event:${e.id}`,
        title: e.title,
        description: e.description,
        type: eventTypeFromTitle(e.title),
        category: "events",
        imageUrl: e.imageUrl,
        imageAlt: `${e.title} event`,
        location: {
          city: e.city,
          country: e.country,
          coordinates: e.coordinates,
        },
        source: {
          label: e.source,
          provider: e.source,
          url: e.sourceUrl,
        },
        event: {
          startDate: e.startDate,
          endDate: e.endDate,
          venueName: e.venueName,
        },
        tags: ["event", e.type],
      });
    }

    const deduped = new Map<string, DiscoveryItem>();
    for (const item of items) {
      const key = normalize(`${item.title}|${item.location?.city ?? ""}|${item.type}`);
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }
    const out = [...deduped.values()].slice(0, limit);
    if (out.length > 0) {
      return { items: out, source: "providers", query };
    }
  } catch {
    // handled by fallback below
  }

  return {
    items: fallbackItems(query, selectedCategory, location, limit),
    source: "fallback-demo",
    query,
  };
};

