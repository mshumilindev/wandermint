import type { AnalyzeTravelTimingInput, TravelTimingInsight } from "./travelTimingTypes";

const severityRank = (s: TravelTimingInsight["severity"]): number => (s === "critical" ? 0 : s === "warning" ? 1 : 2);

/**
 * Sorts and de-duplicates identical lines. Does not invent new risks or destinations.
 * (Room for a future LLM pass that only rephrases existing strings under a flag.)
 */
export const refineTravelTimingInsights = (
  insights: TravelTimingInsight[],
  _context: AnalyzeTravelTimingInput,
): TravelTimingInsight[] => {
  void _context;
  const seen = new Set<string>();
  const out: TravelTimingInsight[] = [];
  for (const ins of insights) {
    const key = `${ins.type}|${ins.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(ins);
  }
  return out.sort((a, b) => {
    const d = severityRank(a.severity) - severityRank(b.severity);
    if (d !== 0) {
      return d;
    }
    return b.confidence - a.confidence;
  });
};
