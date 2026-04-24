const collapseWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const technicalSentencePatterns = [
  /public place data suggests/i,
  /provider[- ]?(internal|data)?/i,
  /opening hours are not published yet/i,
  /hours unavailable/i,
  /no strong public source match was found yet/i,
  /weak provider grounding/i,
  /source data is partial/i,
  /\bn\/a\b/i,
  /\bnot available\b/i,
];

const cleanLooseFragments = (value: string): string => {
  let next = value;
  next = next.replace(/Opening hours are not published yet[.,]?/gi, "");
  next = next.replace(/Public place data suggests[.,]?/gi, "");
  next = next.replace(/provider[- ]?(internal|data)?/gi, "");
  next = next.replace(/with hours listed as [^.]+\./gi, "");
  next = next.replace(/with timing to double-check before you go\./gi, "");
  next = next.replace(/No strong public source match was found yet,?\s*/gi, "");
  next = next.replace(/so WanderMint should treat it as a preference and propose grounded alternatives\.?/gi, "");
  next = next.replace(/source data is partial\.?/gi, "");
  next = next.replace(/\bN\/A\b/gi, "");
  next = next.replace(/\bnot available\b/gi, "");
  next = next.replace(/\s+\/\s+/g, " / ");
  next = next.replace(/\s+\./g, ".");
  next = next.replace(/\s+,/g, ",");
  next = next.replace(/,\s*,/g, ",");
  next = next.replace(/\(\s*\)/g, "");
  return next;
};

const splitSentences = (value: string): string[] =>
  value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);

export const sanitizeUserFacingDescription = (value: string): string => {
  const cleaned = cleanLooseFragments(value);
  const safeSentences = splitSentences(cleaned).filter((sentence) => !technicalSentencePatterns.some((pattern) => pattern.test(sentence)));
  const rebuilt = safeSentences.join(" ");
  return collapseWhitespace(rebuilt).replace(/:\s*$/, "");
};

export const sanitizeUserFacingLine = (value: string): string => sanitizeUserFacingDescription(value).replace(/:\s*$/, "");

export const sanitizeOptionalUserFacingDescription = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const sanitized = sanitizeUserFacingDescription(value);
  return sanitized.length > 0 ? sanitized : null;
};
