const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Unguessable token for public trip share URLs (256-bit). */
export const generateShareToken = (): string => {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
    return hex(bytes);
  }
  return `t_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
};
