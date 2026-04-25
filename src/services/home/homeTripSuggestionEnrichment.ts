import dayjs from "dayjs";
import { buildTripBudgetBreakdown } from "../../features/travel-pricing/services/tripBudgetService";
import { pickTopWindows, scoreDestinationDateWindows } from "../../features/travel-pricing/services/destinationDateScoringService";
import { fetchDestinationHeroImage } from "../../features/travel-pricing/providers/destinationImageProvider";
import { fetchCountryMetaByName } from "../../features/travel-pricing/providers/countryMetaProvider";
import { publicGeoProvider } from "../providers/publicGeoProvider";
import type { HomeSuggestionContext } from "./homeTripSuggestionContextBuilder";
import { CURATED_DESTINATION_SEEDS } from "./homeTripSuggestionScoring";
import type { SuggestedTrip } from "./homeTripSuggestionTypes";
import type {
  AlternativeDateWindow,
  BudgetDisplayMode,
  SuggestionHeroImage,
  SuggestionSignalDetail,
} from "../../features/travel-pricing/types/tripBudget.types";

const foodStyleFromContext = (ctx: HomeSuggestionContext): "budget" | "balanced" | "foodie" | "premium" => {
  if (ctx.budget.dominantStyle === "lean") {
    return "budget";
  }
  if (ctx.budget.dominantStyle === "premium") {
    return "premium";
  }
  if ((ctx.music?.topGenres.length ?? 0) > 4) {
    return "foodie";
  }
  return "balanced";
};

const curatedSeasonal = (city: string | undefined, country: string): number[] | undefined => {
  const c = city?.trim().toLowerCase() ?? "";
  const co = country.trim().toLowerCase();
  const exact = CURATED_DESTINATION_SEEDS.find(
    (s) => s.country.trim().toLowerCase() === co && (s.city?.trim().toLowerCase() ?? "") === c,
  );
  if (exact) {
    return exact.seasonalMonths;
  }
  return CURATED_DESTINATION_SEEDS.find((s) => s.country.trim().toLowerCase() === co)?.seasonalMonths;
};

const buildSignals = (trip: SuggestedTrip, ctx: HomeSuggestionContext): SuggestionSignalDetail[] => {
  const out: SuggestionSignalDetail[] = [];
  if (trip.type === "bucket_list_push") {
    out.push({ type: "bucket_list", label: "Bucket list", explanation: "Pulled from a saved destination you ranked.", strength: 0.9 });
  }
  if (ctx.music && trip.type === "event_driven") {
    out.push({
      type: "music_taste",
      label: "Music taste",
      explanation: `Genres you listen to (${ctx.music.topGenres.slice(0, 3).join(", ")}) overlap this city's live scene.`,
      strength: 0.75,
    });
  }
  if (ctx.flickSync.interestSignals.length && trip.type === "vibe_based") {
    out.push({
      type: "media_taste",
      label: "FlickSync",
      explanation: "Themes from media you saved line up with this destination vibe.",
      strength: 0.72,
    });
  }
  if (trip.type === "return_trip") {
    out.push({ type: "travel_style", label: "Return favorite", explanation: "You executed a similar trip well recently.", strength: 0.85 });
  }
  if (trip.type === "new_exploration") {
    out.push({ type: "novelty", label: "New region", explanation: "Fresh country mix aligned with your pacing.", strength: 0.65 });
  }
  if (ctx.budget.avgDailySpend) {
    out.push({
      type: "budget_fit",
      label: "Spend fit",
      explanation: `Grounded in your observed trip spend (~${Math.round(ctx.budget.avgDailySpend)} ${ctx.budget.currency}/day).`,
      strength: 0.8,
    });
  }
  out.push({
    type: "calendar",
    label: "Dates",
    explanation: "Date window scored with weekends, seasonality, and short-range weather when available.",
    strength: 0.7,
  });
  return out;
};

export const enrichHomeSuggestedTrip = async (trip: SuggestedTrip, ctx: HomeSuggestionContext): Promise<SuggestedTrip> => {
  const city = trip.destination.city?.trim() ?? "";
  const country = trip.destination.country.trim();
  const destLabel = city ? `${city}, ${country}` : country;

  let destLat: number | undefined;
  let destLng: number | undefined;
  try {
    const geo = await publicGeoProvider.geocode(destLabel);
    destLat = geo.latitude;
    destLng = geo.longitude;
  } catch {
    destLat = undefined;
    destLng = undefined;
  }

  const homeCity = ctx.accountPreferences?.homeCity?.trim() || "";
  let originLabel = homeCity.length > 0 ? homeCity : "";
  if (!originLabel && ctx.tripHistory[0]?.destinations[0]) {
    const d = ctx.tripHistory[0]!.destinations[0]!;
    originLabel = `${d.city}, ${d.country}`;
  }
  if (!originLabel) {
    originLabel = destLabel;
  }

  let originCountryName = country;
  try {
    const og = await publicGeoProvider.geocode(originLabel);
    const parts = og.label.split(",").map((p) => p.trim());
    originCountryName = parts[parts.length - 1] ?? originCountryName;
  } catch {
    originCountryName = country;
  }

  const [originMeta, destMeta] = await Promise.all([
    fetchCountryMetaByName(originCountryName),
    fetchCountryMetaByName(country),
  ]);

  const scored = await scoreDestinationDateWindows({
    durationDays: trip.durationDays,
    horizonDays: 60,
    seasonalMonths: curatedSeasonal(city || undefined, country),
    latitude: destLat,
    longitude: destLng,
  });

  const { balanced, cheapest, comfort } = pickTopWindows(scored);

  const foodStyle = foodStyleFromContext(ctx);

  const baseParams = {
    originLabel,
    originCountryMeta: originMeta,
    destinationCity: city || country,
    destinationCountry: country,
    destinationCountryMeta: destMeta,
    destinationLabel: destLabel,
    durationDays: trip.durationDays,
    userCurrency: ctx.budget.currency,
    userAvgDailySpend: ctx.budget.avgDailySpend,
    foodStyle,
  };

  const [primaryBudget, cheapBudget, comfortBudget] = await Promise.all([
    buildTripBudgetBreakdown({
      ...baseParams,
      startDate: balanced.startDate,
      endDate: balanced.endDate,
    }),
    buildTripBudgetBreakdown({
      ...baseParams,
      startDate: cheapest.startDate,
      endDate: cheapest.endDate,
    }),
    buildTripBudgetBreakdown({
      ...baseParams,
      startDate: comfort.startDate,
      endDate: comfort.endDate,
    }),
  ]);

  const alternatives: AlternativeDateWindow[] = [
    {
      label: "cheapest",
      startDate: cheapest.startDate,
      endDate: cheapest.endDate,
      reason: `Lower-scored calendar slot (often fewer weekend hits). ${cheapBudget.assumptions[0] ?? "Re-check transport/hotel for these dates."}`,
      estimatedTotalMin: cheapBudget.totalMin,
      estimatedTotalMax: cheapBudget.totalMax,
      currency: cheapBudget.currency,
    },
    {
      label: "comfort",
      startDate: comfort.startDate,
      endDate: comfort.endDate,
      reason: "Alternate window with repriced stay envelope — compare against primary dates.",
      estimatedTotalMin: comfortBudget.totalMin,
      estimatedTotalMax: comfortBudget.totalMax,
      currency: comfortBudget.currency,
    },
  ];

  let heroImage: SuggestionHeroImage | undefined;
  const img = await fetchDestinationHeroImage({ city: city || undefined, country }).catch(() => null);
  if (img) {
    heroImage = { url: img.url, alt: img.alt, source: "wikipedia", attribution: img.attribution };
  }

  const usableCategories =
    primaryBudget.categories.transport.confidence !== "unavailable" ||
    primaryBudget.categories.accommodation.confidence !== "unavailable" ||
    primaryBudget.categories.food.confidence !== "unavailable" ||
    primaryBudget.categories.localTransport.confidence !== "unavailable" ||
    primaryBudget.categories.activities.confidence !== "unavailable";

  const budgetDisplayMode: BudgetDisplayMode =
    !usableCategories || primaryBudget.totalMax <= 0 ? "unavailable" : primaryBudget.confidence === "high" ? "source_backed" : "partial";

  const estimatedBudget =
    primaryBudget.totalMax > 0
      ? { min: Math.round(primaryBudget.totalMin), max: Math.round(primaryBudget.totalMax), currency: primaryBudget.currency }
      : { min: 0, max: 0, currency: ctx.budget.currency };

  const primaryReason = `Recommended ${dayjs(balanced.startDate).format("MMM D")}–${dayjs(balanced.endDate).format("MMM D")}: ${balanced.reasonParts.join(", ") || "balanced score across weather, weekends, and seasonality"}.`;

  const priceSignals: SuggestionSignalDetail[] = [];
  if (primaryBudget.categories.transport.confidence !== "unavailable" && primaryBudget.categories.transport.max > 0) {
    priceSignals.push({
      type: "flight_price",
      label: "Transport estimate",
      explanation: "Includes a structured transport quote when your proxy returns fares.",
      strength: 0.72,
    });
  }
  if (primaryBudget.categories.accommodation.confidence !== "unavailable" && primaryBudget.categories.accommodation.max > 0) {
    priceSignals.push({
      type: "hotel_price",
      label: "Stay estimate",
      explanation: "Built only from listings that published numeric nightly ranges.",
      strength: 0.7,
    });
  }
  return {
    ...trip,
    estimatedBudget,
    budgetBreakdown: primaryBudget,
    budgetDisplayMode,
    recommendedDateWindow: {
      startDate: balanced.startDate,
      endDate: balanced.endDate,
      reason: primaryReason,
    },
    alternativeDateWindows: alternatives,
    heroImage,
    signalsDetailed: [...buildSignals(trip, ctx), ...priceSignals],
    priceDataFetchedAt: primaryBudget.fetchedAt,
    reasoning: `${trip.reasoning} ${primaryReason}`.replace(/\s+/g, " ").trim(),
  };
};

export const enrichHomeSuggestedTrips = async (trips: SuggestedTrip[], ctx: HomeSuggestionContext): Promise<SuggestedTrip[]> => {
  const settled = await Promise.allSettled(trips.map((t) => enrichHomeSuggestedTrip(t, ctx)));
  return settled.map((r, i) => (r.status === "fulfilled" ? r.value : trips[i]!));
};
