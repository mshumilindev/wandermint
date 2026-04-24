import { z } from "zod";
import type { DestinationDiscovery, DestinationDiscoveryInput, DestinationDiscoveryProvider, DiscoveryCategory, DiscoveryItem } from "./contracts";
import { nowIso } from "../firebase/timestampMapper";
import { publicPlacesProvider } from "./publicPlacesProvider";

const wikidataSearchSchema = z.object({
  search: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    concepturi: z.string().optional(),
  })),
});

const categoryLabels: Record<DiscoveryCategory, string> = {
  attractions: "attractions",
  museums: "museums",
  local_food: "local cuisine",
  traditional_drinks: "traditional drinks",
  nearby_places: "nearby places",
  day_trips: "day trips",
  must_see: "must-see request",
};

const compact = <TValue>(values: Array<TValue | null>): TValue[] => values.filter((value): value is TValue => value !== null);

const normalizeToken = (value: string): string => value.trim().toLowerCase();

const parseMustSeeNotes = (notes: string | undefined): string[] =>
  (notes ?? "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1)
    .slice(0, 10);

const categorizeMustSee = (item: string): DiscoveryCategory => {
  const normalized = normalizeToken(item);
  if (/\b(eat|food|fugu|sushi|ramen|kaiseki|restaurant|taste)\b/.test(normalized)) return "local_food";
  if (/\b(drink|sake|wine|beer|bar|cocktail|tea)\b/.test(normalized)) return "traditional_drinks";
  if (/\b(museum|gallery|exhibition)\b/.test(normalized)) return "museums";
  if (/\b(fuji|mount|mountain|island|lake|day trip|outside|nearby)\b/.test(normalized)) return "day_trips";
  return "must_see";
};

const toQueryText = (input: DestinationDiscoveryInput, category: DiscoveryCategory): string => {
  const primarySegment = input.segments[0];
  const placeLabel = primarySegment ? `${primarySegment.city} ${primarySegment.country}` : input.locationLabel;
  return `${placeLabel} ${categoryLabels[category]}`;
};

const searchWikidata = async (query: string, category: DiscoveryCategory, limit = 5): Promise<DiscoveryItem[]> => {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language: "en",
    format: "json",
    origin: "*",
    limit: String(limit),
  });

  const response = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`);
  if (!response.ok) {
    return [];
  }

  const parsed = wikidataSearchSchema.safeParse(await response.json());
  if (!parsed.success) {
    return [];
  }

  return parsed.data.search.map((item): DiscoveryItem => ({
    id: `wikidata-${item.id}`,
    category,
    title: item.label,
    description: item.description,
    sourceName: "Wikidata",
    sourceUrl: item.concepturi ?? `https://www.wikidata.org/wiki/${item.id}`,
    confidence: "medium",
    tags: [categoryLabels[category], "structured public data"],
  }));
};

const searchPlaces = async (input: DestinationDiscoveryInput, category: DiscoveryCategory, categories: string[], radiusMeters: number): Promise<DiscoveryItem[]> => {
  const primarySegment = input.segments[0];
  const locationLabel = primarySegment ? `${primarySegment.city}, ${primarySegment.country}` : input.locationLabel;

  try {
    const places = await publicPlacesProvider.searchPlaces({
      locationLabel,
      query: categoryLabels[category],
      categories,
      radiusMeters,
    });

    return places.slice(0, 8).map((place): DiscoveryItem => ({
      id: `osm-${category}-${place.providerPlaceId ?? place.name}`,
      category,
      title: place.name,
      place,
      sourceName: "OpenStreetMap",
      confidence: "medium",
      tags: [categoryLabels[category], "nearby place"],
    }));
  } catch {
    return [];
  }
};

const searchMustSee = async (input: DestinationDiscoveryInput): Promise<DiscoveryItem[]> => {
  const notes = parseMustSeeNotes(input.mustSeeNotes);
  const wikidataResults = await Promise.all(
    notes.map(async (note): Promise<DiscoveryItem | null> => {
      const category = categorizeMustSee(note);
      const [result] = await searchWikidata(`${note} ${input.locationLabel}`, category, 1);
      if (!result) {
        return {
          id: `must-see-${normalizeToken(note).replace(/[^a-z0-9]+/g, "-")}`,
          category,
          title: note,
          description: "A personal must-see to keep in the mix while WanderMint looks for the strongest nearby match and a few good alternatives.",
          sourceName: "User request",
          confidence: "low",
          tags: ["must-see", categoryLabels[category]],
        };
      }

      return {
        ...result,
        id: `must-see-${result.id}`,
        category,
        tags: [...result.tags, "must-see"],
      };
    }),
  );

  return compact(wikidataResults);
};

const uniqueByTitle = (items: DiscoveryItem[]): DiscoveryItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.category}:${normalizeToken(item.title)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const publicDiscoveryProvider: DestinationDiscoveryProvider = {
  getDestinationDiscovery: async (input) => {
    const [
      attractionsFromOsm,
      museumsFromOsm,
      localFoodFromOsm,
      drinksFromOsm,
      nearbyFromOsm,
      dayTripsFromOsm,
      localFoodFromWiki,
      drinksFromWiki,
      dayTripsFromWiki,
      mustSee,
    ] = await Promise.all([
      searchPlaces(input, "attractions", ["attraction"], 4200),
      searchPlaces(input, "museums", ["museum"], 4200),
      searchPlaces(input, "local_food", ["local_food"], 3600),
      searchPlaces(input, "traditional_drinks", ["traditional_drinks"], 3600),
      searchPlaces(input, "nearby_places", ["attraction", "viewpoint"], 9000),
      searchPlaces(input, "day_trips", ["attraction", "historic"], 26000),
      searchWikidata(toQueryText(input, "local_food"), "local_food"),
      searchWikidata(toQueryText(input, "traditional_drinks"), "traditional_drinks"),
      searchWikidata(toQueryText(input, "day_trips"), "day_trips"),
      searchMustSee(input),
    ]);

    return {
      locationLabel: input.locationLabel,
      capturedAt: nowIso(),
      attractions: uniqueByTitle(attractionsFromOsm),
      museums: uniqueByTitle(museumsFromOsm),
      localFood: uniqueByTitle([...localFoodFromOsm, ...localFoodFromWiki]),
      traditionalDrinks: uniqueByTitle([...drinksFromOsm, ...drinksFromWiki]),
      nearbyPlaces: uniqueByTitle(nearbyFromOsm),
      dayTrips: uniqueByTitle([...dayTripsFromOsm, ...dayTripsFromWiki]),
      mustSee: uniqueByTitle(mustSee),
    };
  },
};
