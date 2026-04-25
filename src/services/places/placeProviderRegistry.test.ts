import { describe, expect, it } from "vitest";
import type { PlaceCandidate } from "./placeTypes";
import { mergePlaceCandidates } from "./placeProviderRegistry";

const c = (provider: PlaceCandidate["provider"], providerId: string, name: string): PlaceCandidate => ({
  id: `${provider}:${providerId}`,
  provider,
  providerId,
  name,
  categories: ["test"],
});

describe("mergePlaceCandidates", () => {
  it("dedupes by provider+id and preserves first provider ordering", () => {
    const merged = mergePlaceCandidates([
      [c("google_places", "1", "A"), c("osm", "99", "B")],
      [c("osm", "99", "B dup"), c("osm", "100", "C")],
    ]);
    expect(merged.map((x) => x.providerId)).toEqual(["1", "99", "100"]);
  });
});
