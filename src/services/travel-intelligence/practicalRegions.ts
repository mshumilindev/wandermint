export type PracticalRegion =
  | "western_europe"
  | "central_europe"
  | "scandinavia"
  | "balkans"
  | "iberia"
  | "british_isles"
  | "east_asia"
  | "southeast_asia"
  | "northeast_us"
  | "west_coast_us"
  | "other";

const regionCountries: Record<Exclude<PracticalRegion, "other">, string[]> = {
  western_europe: ["france", "belgium", "netherlands", "luxembourg", "switzerland", "germany", "austria"],
  central_europe: ["poland", "czechia", "czech republic", "slovakia", "hungary", "austria", "germany"],
  scandinavia: ["norway", "sweden", "denmark", "finland", "iceland"],
  balkans: ["croatia", "serbia", "slovenia", "bosnia", "montenegro", "albania", "north macedonia", "bulgaria", "romania", "greece"],
  iberia: ["spain", "portugal", "andorra"],
  british_isles: ["united kingdom", "ireland", "england", "scotland", "wales"],
  east_asia: ["japan", "south korea", "china", "taiwan", "hong kong"],
  southeast_asia: ["thailand", "vietnam", "malaysia", "singapore", "indonesia", "philippines", "cambodia", "laos"],
  northeast_us: ["united states", "usa"],
  west_coast_us: ["united states", "usa"],
};

export const practicalRegions = {
  resolveCountryRegion: (country: string): PracticalRegion => {
    const normalized = country.trim().toLowerCase();
    const match = Object.entries(regionCountries).find(([, countries]) => countries.includes(normalized));
    return match?.[0] as PracticalRegion | undefined ?? "other";
  },

  isRegionCompatible: (fromCountry: string, toCountry: string): boolean => {
    const fromRegion = practicalRegions.resolveCountryRegion(fromCountry);
    const toRegion = practicalRegions.resolveCountryRegion(toCountry);
    return fromRegion !== "other" && fromRegion === toRegion;
  },
};
