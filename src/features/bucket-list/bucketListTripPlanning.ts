import type { PlaceSnapshot } from "../../entities/activity/model";
import type { TripSegment } from "../../entities/trip/model";
import { bucketListRepository } from "./bucketListRepository";
import type { BucketListItem } from "./bucketList.types";
import { runEnrichmentForBucketListItem } from "./bucketListService";
import {
  bucketListItemCityCountry,
  bucketListItemToPlanningPlaceSnapshot,
} from "./bucketListNormalize";

const textNearSegment = (item: BucketListItem, segments: readonly TripSegment[]): boolean => {
  const { city, country } = bucketListItemCityCountry(item);
  const c = city?.trim().toLowerCase();
  const co = country?.trim().toLowerCase();
  if (!c && !co) {
    return false;
  }
  return segments.some((s) => {
    const sc = s.city.trim().toLowerCase();
    const sn = s.country.trim().toLowerCase();
    if (c && (sc.includes(c) || c.includes(sc))) {
      return true;
    }
    if (co && (sn.includes(co) || co.includes(sn))) {
      return true;
    }
    return false;
  });
};

const titleMatchesSegmentCity = (item: BucketListItem, segments: readonly TripSegment[]): boolean => {
  const t = item.title.trim().toLowerCase();
  if (!t) {
    return false;
  }
  return segments.some((s) => {
    const c = s.city.trim().toLowerCase();
    return c.length >= 3 && t.includes(c);
  });
};

/**
 * Bucket list rows relevant to this trip’s geography (not visited; Rule 1 independent of trip entity).
 */
export const loadBucketListItemsForTripPlanning = async (
  userId: string,
  segments: readonly TripSegment[],
): Promise<BucketListItem[]> => {
  if (!userId.trim() || segments.length === 0) {
    return [];
  }
  const all = await bucketListRepository.listByUserId(userId);
  return all.filter((row) => {
    if (row.visited) {
      return false;
    }
    return textNearSegment(row, segments) || titleMatchesSegmentCity(row, segments);
  });
};

export { bucketListItemToPlanningPlaceSnapshot };

const placeDedupeKey = (p: PlaceSnapshot): string => {
  const id = p.providerPlaceId?.trim();
  if (id) {
    return `id:${id}`;
  }
  const name = p.name.trim().toLowerCase();
  const city = (p.city ?? "").trim().toLowerCase();
  return `nm:${name}|${city}`;
};

/**
 * Injects bucket-derived snapshots **first**, then generic provider places, deduped (Rule 4 / dedupe).
 */
export const mergePlanningPlacesBucketFirst = (bucketPlaces: readonly PlaceSnapshot[], genericPlaces: readonly PlaceSnapshot[]): PlaceSnapshot[] => {
  const out: PlaceSnapshot[] = [];
  const seen = new Set<string>();
  for (const p of [...bucketPlaces, ...genericPlaces]) {
    const k = placeDedupeKey(p);
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(p);
  }
  return out;
};

export const buildBucketListPlanningPromptClause = (items: readonly BucketListItem[]): string => {
  if (items.length === 0) {
    return "";
  }
  const lines = items.slice(0, 24).map((it) => {
    switch (it.payload.type) {
      case "destination": {
        const l = it.payload.location;
        const coord = l.coordinates ? ` @${l.coordinates.lat.toFixed(5)},${l.coordinates.lng.toFixed(5)}` : "";
        return `- [destination] ${l.city}, ${l.country}${coord}`;
      }
      case "place": {
        const p = it.payload.place;
        const coord = p.coordinates ? ` @${p.coordinates.lat.toFixed(5)},${p.coordinates.lng.toFixed(5)}` : "";
        return `- [place] ${p.name} (${p.provider}:${p.providerId})${coord}`;
      }
      case "experience":
        return `- [experience wish] ${it.payload.label}`;
      case "event": {
        const e = it.payload.event;
        const coord = e.coordinates ? ` @${e.coordinates.lat.toFixed(5)},${e.coordinates.lng.toFixed(5)}` : "";
        return `- [event] ${e.title}${e.startDateTime ? ` @${e.startDateTime}` : ""}${coord}`;
      }
    }
  });
  return [
    `User bucket list (${items.length} relevant, not yet visited): prefer weaving these in over generic discovery when geography and time allow.`,
    "Do not force every bucket item into the plan if the day becomes infeasible — respect pacing and timeline feasibility.",
    "Structured bucket rows are typed — honor destination vs named place vs event window vs experience wish; do not collapse them into invented venues.",
    ...lines,
  ].join("\n");
};

export const fireBucketListEnrichmentForPlanning = (items: readonly BucketListItem[]): void => {
  for (const it of items) {
    if (it.entityId?.trim()) {
      runEnrichmentForBucketListItem(it);
    }
  }
};
