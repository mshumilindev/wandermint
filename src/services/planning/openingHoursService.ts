import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import type { ActivityBlock, PlaceSnapshot } from "../../entities/activity/model";
import { resolveOpeningHoursFromLabel } from "../../features/places/opening-hours/openingHoursResolver";
import { validatePlanWindowAgainstOpeningHours } from "../../features/places/opening-hours/openingHoursValidator";
import { normalizeItineraryCategory } from "./itineraryCompositionService";

dayjs.extend(utc);
dayjs.extend(timezone);

type OpeningHoursFit = "open" | "closed" | "unknown";

const resolveParsingTimezone = (explicit?: string): string => {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }
  const guessed = dayjs.tz.guess();
  if (guessed && guessed.length > 0) {
    return guessed;
  }
  return typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";
};

const checkOpeningHours = (
  openingHoursLabel: string | undefined,
  date: string,
  startTime: string,
  endTime: string,
  timezone?: string,
): OpeningHoursFit => {
  const tz = resolveParsingTimezone(timezone);
  const hours = resolveOpeningHoursFromLabel(openingHoursLabel, tz);
  const startIso = dayjs.tz(`${date}T${startTime}`, tz).toISOString();
  const endIso = dayjs.tz(`${date}T${endTime}`, tz).toISOString();
  const result = validatePlanWindowAgainstOpeningHours(hours, startIso, endIso);
  return result.status === "open" ? "open" : result.status === "closed" ? "closed" : "unknown";
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const isSamePlace = (left: PlaceSnapshot, right: PlaceSnapshot): boolean =>
  (left.providerPlaceId && right.providerPlaceId && left.provider === right.provider && left.providerPlaceId === right.providerPlaceId) ||
  normalizeText(left.name) === normalizeText(right.name);

const replacePlaceText = (value: string, fromName: string, toName: string): string =>
  value.includes(fromName) ? value.replaceAll(fromName, toName) : value;

const chooseOpenReplacement = (
  block: ActivityBlock,
  date: string,
  candidatePlaces: PlaceSnapshot[],
  timezone?: string,
): PlaceSnapshot | null => {
  const desiredCategory = normalizeItineraryCategory(block);
  const available = candidatePlaces
    .filter((place) => !block.place || !isSamePlace(place, block.place))
    .filter((place, index, values) => values.findIndex((item) => isSamePlace(item, place)) === index)
    .filter((place) => checkOpeningHours(place.openingHoursLabel, date, block.startTime, block.endTime, timezone) === "open");

  const categoryWeighted = available.sort((left, right) => {
    const leftScore = normalizeText(left.name).includes(desiredCategory) ? 1 : 0;
    const rightScore = normalizeText(right.name).includes(desiredCategory) ? 1 : 0;
    return rightScore - leftScore;
  });

  return categoryWeighted[0] ?? null;
};

export const openingHoursService = {
  getOpeningHoursFit: checkOpeningHours,
  chooseOpenCandidate: (
    places: PlaceSnapshot[],
    date: string,
    startTime: string,
    endTime: string,
    timezone?: string,
  ): PlaceSnapshot | null => {
    const openPlaces = places.filter((place) => checkOpeningHours(place.openingHoursLabel, date, startTime, endTime, timezone) === "open");
    if (openPlaces.length > 0) {
      return openPlaces[0] ?? null;
    }

    const unknownPlaces = places.filter((place) => checkOpeningHours(place.openingHoursLabel, date, startTime, endTime, timezone) === "unknown");
    return unknownPlaces[0] ?? null;
  },
  enrichBlockWithOpenReplacement: (
    block: ActivityBlock,
    date: string,
    timezone?: string,
    additionalPlaces: PlaceSnapshot[] = [],
  ): ActivityBlock => {
    if (!block.place) {
      return block;
    }

    const fit = checkOpeningHours(block.place.openingHoursLabel, date, block.startTime, block.endTime, timezone);
    if (fit !== "closed") {
      return block;
    }

    const replacement = chooseOpenReplacement(
      block,
      date,
      [
        ...block.alternatives.map((alternative) => alternative.place).filter((place): place is PlaceSnapshot => Boolean(place)),
        ...block.sourceSnapshots,
        ...additionalPlaces,
      ],
      timezone,
    );

    if (!replacement) {
      return block;
    }

    return {
      ...block,
      title: block.place ? replacePlaceText(block.title, block.place.name, replacement.name) : block.title,
      description: block.place ? replacePlaceText(block.description, block.place.name, replacement.name) : block.description,
      place: replacement,
      sourceSnapshots: [replacement, ...block.sourceSnapshots.filter((place) => !isSamePlace(place, replacement))],
    };
  },
};
