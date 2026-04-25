import { createClientId } from "../../../shared/lib/id";
import { nowIso } from "../../firebase/timestampMapper";
import type { AccommodationCandidate } from "../accommodationTypes";
import type { AccommodationSearchContext } from "../accommodationTypes";

/** Typed manual base — no network; used when other providers are empty. */
export const searchStaticAccommodationFallback = async (ctx: AccommodationSearchContext): Promise<AccommodationCandidate[]> => {
  const q = ctx.query.trim();
  if (q.length < 2) {
    return [];
  }
  const label = [ctx.city, ctx.country].filter(Boolean).join(", ");
  return [
    {
      id: createClientId("acc-static"),
      provider: "static_fallback",
      providerId: `manual:${q}`,
      name: q,
      city: ctx.city,
      country: ctx.country,
      categories: ["custom_base"],
      sourceUpdatedAt: nowIso(),
      relevanceScore: 0.2,
      estimatedPrice: { certainty: "unknown" },
    },
    ...(label
      ? [
          {
            id: createClientId("acc-static-hint"),
            provider: "static_fallback" as const,
            providerId: `near:${label}`,
            name: `${q} (${label})`,
            city: ctx.city,
            country: ctx.country,
            categories: ["custom_base", "hint"],
            sourceUpdatedAt: nowIso(),
            relevanceScore: 0.25,
            estimatedPrice: { certainty: "unknown" as const },
          },
        ]
      : []),
  ];
};
