export interface PricingBandRanges {
  lean: [number, number];
  balanced: [number, number];
  premium: [number, number];
}

export interface PricingProfile {
  countryMatchers: string[];
  cityMatchers?: string[];
  currency: string;
  meal: PricingBandRanges;
  cafe: PricingBandRanges;
  drinks: PricingBandRanges;
  museum: PricingBandRanges;
  attraction: PricingBandRanges;
  cinema: PricingBandRanges;
  localTransit: PricingBandRanges;
  taxiBase: PricingBandRanges;
  taxiPerKm: PricingBandRanges;
  rest: PricingBandRanges;
}

export const pricingProfiles: PricingProfile[] = [
  {
    countryMatchers: ["poland"],
    cityMatchers: ["warsaw", "krakow", "wroclaw", "gdansk", "poznan", "lodz"],
    currency: "PLN",
    meal: { lean: [24, 40], balanced: [40, 78], premium: [78, 160] },
    cafe: { lean: [10, 18], balanced: [18, 32], premium: [32, 58] },
    drinks: { lean: [14, 26], balanced: [26, 44], premium: [44, 80] },
    museum: { lean: [12, 20], balanced: [20, 40], premium: [40, 70] },
    attraction: { lean: [0, 24], balanced: [18, 50], premium: [50, 95] },
    cinema: { lean: [18, 24], balanced: [24, 38], premium: [38, 60] },
    localTransit: { lean: [4, 6], balanced: [6, 8], premium: [8, 12] },
    taxiBase: { lean: [10, 14], balanced: [14, 18], premium: [18, 24] },
    taxiPerKm: { lean: [2.4, 3], balanced: [3, 3.8], premium: [3.8, 5] },
    rest: { lean: [0, 0], balanced: [0, 12], premium: [12, 24] },
  },
  {
    countryMatchers: ["japan"],
    cityMatchers: ["tokyo", "kyoto", "osaka", "yokohama", "kobe"],
    currency: "JPY",
    meal: { lean: [1200, 2200], balanced: [2200, 4800], premium: [4800, 12000] },
    cafe: { lean: [500, 900], balanced: [900, 1800], premium: [1800, 3200] },
    drinks: { lean: [800, 1600], balanced: [1600, 3200], premium: [3200, 7600] },
    museum: { lean: [600, 1200], balanced: [1200, 2200], premium: [2200, 4200] },
    attraction: { lean: [0, 1200], balanced: [1000, 2800], premium: [2800, 6500] },
    cinema: { lean: [1800, 2200], balanced: [2200, 2800], premium: [2800, 3800] },
    localTransit: { lean: [180, 260], balanced: [260, 380], premium: [380, 560] },
    taxiBase: { lean: [500, 650], balanced: [650, 820], premium: [820, 1000] },
    taxiPerKm: { lean: [220, 280], balanced: [280, 340], premium: [340, 420] },
    rest: { lean: [0, 0], balanced: [0, 900], premium: [900, 2200] },
  },
  {
    countryMatchers: ["czech republic", "czechia"],
    cityMatchers: ["prague", "praha", "brno"],
    currency: "CZK",
    meal: { lean: [180, 300], balanced: [300, 560], premium: [560, 1200] },
    cafe: { lean: [70, 130], balanced: [130, 220], premium: [220, 380] },
    drinks: { lean: [90, 180], balanced: [180, 320], premium: [320, 620] },
    museum: { lean: [120, 220], balanced: [220, 380], premium: [380, 720] },
    attraction: { lean: [0, 180], balanced: [180, 420], premium: [420, 820] },
    cinema: { lean: [180, 240], balanced: [240, 340], premium: [340, 480] },
    localTransit: { lean: [30, 40], balanced: [40, 60], premium: [60, 90] },
    taxiBase: { lean: [55, 70], balanced: [70, 95], premium: [95, 130] },
    taxiPerKm: { lean: [18, 24], balanced: [24, 30], premium: [30, 40] },
    rest: { lean: [0, 0], balanced: [0, 120], premium: [120, 260] },
  },
  {
    countryMatchers: ["united kingdom", "uk", "england", "northern ireland", "scotland", "wales"],
    cityMatchers: ["london", "belfast", "manchester", "edinburgh", "glasgow"],
    currency: "GBP",
    meal: { lean: [14, 24], balanced: [24, 55], premium: [55, 120] },
    cafe: { lean: [4, 8], balanced: [8, 16], premium: [16, 28] },
    drinks: { lean: [6, 14], balanced: [14, 28], premium: [28, 60] },
    museum: { lean: [0, 12], balanced: [12, 24], premium: [24, 45] },
    attraction: { lean: [0, 16], balanced: [16, 34], premium: [34, 72] },
    cinema: { lean: [8, 14], balanced: [14, 22], premium: [22, 34] },
    localTransit: { lean: [2, 4], balanced: [4, 6], premium: [6, 9] },
    taxiBase: { lean: [5, 7], balanced: [7, 10], premium: [10, 14] },
    taxiPerKm: { lean: [1.7, 2.2], balanced: [2.2, 2.8], premium: [2.8, 3.6] },
    rest: { lean: [0, 0], balanced: [0, 6], premium: [6, 14] },
  },
  {
    countryMatchers: ["ireland"],
    cityMatchers: ["dublin", "cork", "galway"],
    currency: "EUR",
    meal: { lean: [16, 26], balanced: [26, 58], premium: [58, 128] },
    cafe: { lean: [4, 8], balanced: [8, 15], premium: [15, 26] },
    drinks: { lean: [6, 14], balanced: [14, 28], premium: [28, 54] },
    museum: { lean: [0, 14], balanced: [14, 24], premium: [24, 42] },
    attraction: { lean: [0, 18], balanced: [18, 38], premium: [38, 72] },
    cinema: { lean: [9, 14], balanced: [14, 20], premium: [20, 28] },
    localTransit: { lean: [2, 3], balanced: [3, 5], premium: [5, 7] },
    taxiBase: { lean: [5, 7], balanced: [7, 10], premium: [10, 14] },
    taxiPerKm: { lean: [1.8, 2.2], balanced: [2.2, 2.8], premium: [2.8, 3.6] },
    rest: { lean: [0, 0], balanced: [0, 6], premium: [6, 14] },
  },
  {
    countryMatchers: [
      "france",
      "germany",
      "italy",
      "spain",
      "portugal",
      "austria",
      "belgium",
      "netherlands",
      "greece",
      "finland",
      "slovakia",
      "slovenia",
      "estonia",
      "latvia",
      "lithuania",
      "luxembourg",
      "malta",
      "cyprus",
      "croatia",
    ],
    currency: "EUR",
    meal: { lean: [14, 24], balanced: [24, 52], premium: [52, 115] },
    cafe: { lean: [3, 7], balanced: [7, 14], premium: [14, 24] },
    drinks: { lean: [5, 12], balanced: [12, 24], premium: [24, 48] },
    museum: { lean: [0, 12], balanced: [12, 22], premium: [22, 40] },
    attraction: { lean: [0, 18], balanced: [18, 38], premium: [38, 74] },
    cinema: { lean: [8, 12], balanced: [12, 18], premium: [18, 26] },
    localTransit: { lean: [2, 3], balanced: [3, 5], premium: [5, 7] },
    taxiBase: { lean: [4, 6], balanced: [6, 9], premium: [9, 13] },
    taxiPerKm: { lean: [1.6, 2.1], balanced: [2.1, 2.7], premium: [2.7, 3.5] },
    rest: { lean: [0, 0], balanced: [0, 5], premium: [5, 12] },
  },
  {
    countryMatchers: ["united states", "usa"],
    currency: "USD",
    meal: { lean: [14, 24], balanced: [24, 56], premium: [56, 130] },
    cafe: { lean: [4, 8], balanced: [8, 16], premium: [16, 28] },
    drinks: { lean: [6, 15], balanced: [15, 28], premium: [28, 60] },
    museum: { lean: [0, 18], balanced: [18, 32], premium: [32, 60] },
    attraction: { lean: [0, 20], balanced: [20, 44], premium: [44, 84] },
    cinema: { lean: [10, 16], balanced: [16, 24], premium: [24, 34] },
    localTransit: { lean: [2, 3], balanced: [3, 5], premium: [5, 8] },
    taxiBase: { lean: [5, 8], balanced: [8, 12], premium: [12, 16] },
    taxiPerKm: { lean: [1.8, 2.4], balanced: [2.4, 3.1], premium: [3.1, 4] },
    rest: { lean: [0, 0], balanced: [0, 6], premium: [6, 14] },
  },
];

export const fallbackPricingProfile: PricingProfile = {
  countryMatchers: [],
  currency: "EUR",
  meal: { lean: [12, 20], balanced: [20, 40], premium: [40, 90] },
  cafe: { lean: [3, 6], balanced: [6, 12], premium: [12, 20] },
  drinks: { lean: [4, 10], balanced: [10, 20], premium: [20, 42] },
  museum: { lean: [0, 10], balanced: [10, 20], premium: [20, 36] },
  attraction: { lean: [0, 14], balanced: [14, 28], premium: [28, 56] },
  cinema: { lean: [7, 10], balanced: [10, 16], premium: [16, 24] },
  localTransit: { lean: [2, 3], balanced: [3, 5], premium: [5, 7] },
  taxiBase: { lean: [4, 6], balanced: [6, 9], premium: [9, 12] },
  taxiPerKm: { lean: [1.4, 1.8], balanced: [1.8, 2.4], premium: [2.4, 3] },
  rest: { lean: [0, 0], balanced: [0, 5], premium: [5, 10] },
};
