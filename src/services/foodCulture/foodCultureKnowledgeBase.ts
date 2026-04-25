import type { FoodCultureKnowledgeEntry } from "../../entities/food-culture/model";

/**
 * Curated food/drink culture seeds. City rows should be more specific than country rows.
 * Matching prefers exact city+country, then city-only, then country-only.
 */
export const FOOD_CULTURE_KNOWLEDGE: FoodCultureKnowledgeEntry[] = [
  {
    country: "Ireland",
    strengths: ["pubs", "beer", "whiskey", "seafood in coastal towns", "chowder", "oysters", "stews"],
    mustTryDishes: ["Irish stew", "seafood chowder", "oysters on the coast", "soda bread"],
    mustTryDrinks: ["Guinness", "Irish whiskey", "Irish coffee", "cider", "local ales"],
    practicalTips: [
      "Beer and pub culture are central to social life — a credible pub stop is often more meaningful than a generic restaurant.",
      "Seafood quality is usually stronger near the coast (e.g. Howth near Dublin for oysters) than inland.",
    ],
    avoidTips: [
      "Near major attractions, some pubs inflate food prices; compare menus and walk a few streets away when you want better value.",
    ],
    strategyHints: {
      not_tourist_trap: ["Prefer neighborhood pubs and side streets over obvious landmark-adjacent tourist menus."],
      budget_local: ["Supermarket beer and deli counters can be good value; look for lunch specials."],
      high_end: ["Whiskey bars and tasting menus exist in larger cities — book ahead when possible."],
    },
  },
  {
    country: "Ireland",
    city: "Kilkenny",
    strengths: ["pubs", "local ale heritage", "casual Irish food"],
    mustTryDishes: [],
    mustTryDrinks: ["Smithwick's"],
    practicalTips: ["Kilkenny has a strong Smithwick's brewing heritage — a pub stop fits local beer culture when alcohol tips are enabled."],
    avoidTips: [],
    strategyHints: {
      local_authentic: ["Prioritize traditional pubs and local beer over international chains."],
    },
  },
  {
    country: "Ireland",
    city: "Dublin",
    strengths: ["pubs", "Guinness", "whiskey", "international dining"],
    mustTryDishes: [],
    mustTryDrinks: ["Guinness", "Irish whiskey"],
    practicalTips: ["For oysters and coastal seafood, Howth is a common day-trip if your route allows."],
    avoidTips: ["Temple Bar area can be noisy and priced for visitors — fine for one drink, not always the best food value."],
    strategyHints: {
      seafood_focus: ["Bias toward coastal seafood day trips when time allows."],
    },
  },
  {
    country: "Japan",
    strengths: ["sushi", "ramen", "izakaya", "street food", "depachika", "konbini food", "seasonal seafood", "regional specialties"],
    mustTryDishes: ["regional ramen", "tempura", "yakitori", "seasonal set meals"],
    mustTryDrinks: ["sake", "highball", "umeshu", "matcha drinks"],
    practicalTips: [
      "Convenience-store food can be surprisingly high quality for a quick meal.",
      "Department-store food halls (depachika) are strong for bento, sweets, and gifts.",
      "Sushi quality and price tiers differ widely — choose a tier that matches your budget.",
    ],
    avoidTips: [],
    strategyHints: {
      budget_local: ["Ramen, standing sushi, lunch sets, and konbini meals stretch the budget well."],
      high_end: ["Omakase and kaiseki are premium experiences — reservations are often essential."],
      street_food: ["Markets and festival stalls can be great when seasonal; keep hygiene common sense."],
    },
  },
  {
    country: "Japan",
    city: "Tokyo",
    strengths: ["omakase", "ramen", "izakaya", "kissaten", "depachika", "specialty cafes", "seafood"],
    mustTryDishes: ["sushi / omakase", "ramen", "tsukemen", "tempura", "yakitori"],
    mustTryDrinks: ["sake", "highball", "umeshu", "matcha drinks"],
    practicalTips: [
      "Ramen or tsukemen works well as a faster lunch with high flavor-per-minute.",
      "Depachika are ideal when you want variety without committing to one restaurant.",
    ],
    avoidTips: [],
    strategyHints: {
      high_end: ["Omakase, wagyu-focused spots, and serious cocktail bars fit this strategy — reserve when possible."],
      budget_local: ["Ramen, konbini meals, depachika lunch boxes, and lunch sets are strong value."],
    },
  },
  {
    country: "Japan",
    city: "Osaka",
    strengths: ["street food", "casual food culture", "night snacks"],
    mustTryDishes: ["takoyaki", "okonomiyaki", "kushikatsu"],
    mustTryDrinks: ["local beer", "highball"],
    practicalTips: ["Osaka leans casual and snack-forward — great for a dense food crawl if pacing allows."],
    avoidTips: [],
    strategyHints: {
      street_food: ["Markets and stall culture are a natural fit here."],
    },
  },
  {
    country: "Japan",
    city: "Kyoto",
    strengths: ["kaiseki", "tea", "tofu and yuba", "wagashi", "matcha"],
    mustTryDishes: ["kaiseki (premium)", "yudofu", "matcha sweets"],
    mustTryDrinks: ["matcha", "local tea", "sake"],
    practicalTips: ["Tea and wagashi culture is stronger here than in many other Japanese cities."],
    avoidTips: [],
    strategyHints: {
      high_end: ["Kaiseki and refined tea experiences align with this strategy."],
      comfort_safe: ["Tofu/kaiseki-lite and tea sweets are approachable classics."],
    },
  },
  {
    country: "Croatia",
    strengths: ["seafood", "grilled fish", "crni rižoto (black risotto)", "local wine", "olive oil"],
    mustTryDishes: ["black risotto", "grilled fish", "octopus salad", "oysters where regional"],
    mustTryDrinks: ["local wine", "rakija"],
    practicalTips: ["Coastal Croatia is seafood-forward — inland specialties differ."],
    avoidTips: ["Historic old-town cores can carry tourist premiums on menus — read prices and compare a street or two away."],
    strategyHints: {
      not_tourist_trap: ["Prefer side streets and neighborhood konobas away from the busiest landmark strips."],
      seafood_focus: ["Bias toward Adriatic seafood preparations when the destination is coastal."],
    },
  },
  {
    country: "Croatia",
    city: "Dubrovnik",
    strengths: ["seafood", "wine", "scenic dining"],
    mustTryDishes: ["grilled fish", "black risotto", "octopus"],
    mustTryDrinks: ["local wine"],
    practicalTips: ["Seafood is a regional strength, but Old Town restaurants can be priced for visitors — balance view with value."],
    avoidTips: ["Multi-language photo menus right on the main drag are a signal to compare alternatives."],
    strategyHints: {
      not_tourist_trap: ["Walk slightly outside the busiest walls for better value on similar dishes."],
    },
  },
  {
    country: "Portugal",
    strengths: ["seafood", "cod (bacalhau)", "pastries", "wine", "port wine"],
    mustTryDishes: ["bacalhau preparations", "pastel de nata", "grilled sardines (seasonal)"],
    mustTryDrinks: ["vinho verde", "port wine", "ginjinha where relevant"],
    practicalTips: ["Pastelarias are everyday culture — a nata stop is a small, high-signal ritual."],
    avoidTips: [],
    strategyHints: {
      budget_local: ["Pastelarias, lunch pratos do dia, and tascas can be excellent value."],
    },
  },
  {
    country: "Portugal",
    city: "Porto",
    strengths: ["port wine lodges", "hearty northern dishes"],
    mustTryDishes: ["francesinha (rich/heavy)", "tripas à moda do Porto (acquired taste)"],
    mustTryDrinks: ["port wine"],
    practicalTips: ["Port lodges across the river are culturally central when alcohol recommendations are on."],
    avoidTips: [],
    strategyHints: {
      experimental: ["Francesinha is iconic but heavy — label it clearly as indulgent."],
    },
  },
];

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

export const findFoodCultureKnowledgeMatches = (city: string, country: string): FoodCultureKnowledgeEntry[] => {
  const c = norm(city);
  const co = norm(country);
  if (!c && !co) {
    return [];
  }
  if (c) {
    const byCity = FOOD_CULTURE_KNOWLEDGE.filter((e) => norm(e.city) === c);
    if (byCity.length > 0) {
      if (!co) {
        return byCity;
      }
      const strict = byCity.filter((e) => !norm(e.country) || norm(e.country) === co);
      return strict.length > 0 ? strict : byCity;
    }
  }
  if (co) {
    return FOOD_CULTURE_KNOWLEDGE.filter((e) => norm(e.country) === co && !norm(e.city));
  }
  return [];
};
