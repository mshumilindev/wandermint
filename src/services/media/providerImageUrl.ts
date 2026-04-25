/**
 * Best-effort URL tweaks so hero images look sharp on retina / wide cards.
 * Safe no-ops when the URL does not match a known pattern.
 */
export const preferHigherResolutionImageUrl = (url: string, minWidth: number): string => {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    // Commons / Wikipedia: handled elsewhere (srcset, originalimage).
    if (parsed.hostname.includes("wikimedia.org") || parsed.hostname.includes("wikipedia.org")) {
      return trimmed;
    }

    const cap = 4096;
    const target = Math.min(cap, Math.max(minWidth, 960));

    const widthParam = parsed.searchParams.get("width") ?? parsed.searchParams.get("w");
    if (widthParam) {
      const current = Number(widthParam);
      if (Number.isFinite(current) && current > 0 && current < target) {
        if (parsed.searchParams.has("width")) {
          parsed.searchParams.set("width", String(target));
        } else {
          parsed.searchParams.set("w", String(target));
        }
        return parsed.toString();
      }
    }

    // Ticketmaster / LiveNation style: .../tablet_16_9_1024.jpg → request larger raster segment when present.
    const tm = /(tablet|retina|original|artist_page)_(\d+)_(\d+)_(\d+)\.(jpg|jpeg|png|webp)$/i;
    const m = parsed.pathname.match(tm);
    if (m) {
      const kind = m[1];
      const a = m[2];
      const b = m[3];
      const w = Number(m[4]);
      const ext = m[5];
      if (Number.isFinite(w) && w < target) {
        const nextW = Math.min(cap, Math.max(target, Math.round(w * 1.6)));
        const nextPath = parsed.pathname.replace(tm, `${kind}_${a}_${b}_${nextW}.${ext}`);
        if (nextPath !== parsed.pathname) {
          parsed.pathname = nextPath;
          return parsed.toString();
        }
      }
    }

    return trimmed;
  } catch {
    return trimmed;
  }
};
