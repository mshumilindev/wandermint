/** Mirrors `planExplanationSchema` in `services/ai/schemas.ts` so generated options and UI stay aligned. */
import type { PlanExplanation } from "../../services/ai/schemas";

export type { PlanExplanation };

/**
 * Short surface for cards; {@link PlanExplanationUiModel.detailed} is the full audit trail.
 */
export type PlanExplanationUiModel = {
  conciseHeadline: string;
  conciseBullets: string[];
  detailed: PlanExplanation;
};

const truncateAt = (text: string, max: number): string => {
  const t = text.trim();
  if (t.length <= max) {
    return t;
  }
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${lastSpace > 20 ? slice.slice(0, lastSpace) : slice}…`;
};

export const buildPlanExplanationUi = (detailed: PlanExplanation): PlanExplanationUiModel => {
  const bullets: string[] = [];
  for (const line of detailed.includedBecause) {
    if (bullets.length >= 2) {
      break;
    }
    bullets.push(truncateAt(line, 110));
  }
  for (const line of detailed.risks) {
    if (bullets.length >= 4) {
      break;
    }
    bullets.push(truncateAt(line, 110));
  }
  for (const line of detailed.excludedBecause) {
    if (bullets.length >= 4) {
      break;
    }
    bullets.push(truncateAt(line, 110));
  }
  return {
    conciseHeadline: truncateAt(detailed.summary, 160),
    conciseBullets: bullets.slice(0, 4),
    detailed,
  };
};
