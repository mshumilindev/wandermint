import { Typography } from "@mui/material";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { usePrivacySettingsStore } from "../../../app/store/usePrivacySettingsStore";
import type { EventLookupResult } from "../../../entities/events/eventLookup.model";
import type { FestivalSelection } from "../../../entities/events/eventLookup.model";
import type { MemoryAnchorEvent } from "../../../entities/travel-memory/model";
import type { TravelMemory } from "../../../entities/travel-memory/model";
import { applyEventLookupToMemoryAnchor, isMultiDayEventResult } from "../../../services/events/applyEventLookup";
import { countryLabelToIsoCode } from "../../../shared/ui/CountryFlag";
import { FestivalDatesDialog } from "../../trips/events/FestivalDatesDialog";
import { EventLookupResultsPanel } from "../../trips/events/EventLookupResultsPanel";
import { useEventLookup } from "../../trips/events/useEventLookup";

interface MemoryAnchorEventLookupPanelProps {
  anchor: MemoryAnchorEvent;
  locks: Set<string>;
  memoryDatePrecision: TravelMemory["datePrecision"];
  memoryStartDate: string;
  memoryEndDate: string;
  memoryCity: string;
  memoryCountry: string;
  t: TFunction;
  onMerged: (next: MemoryAnchorEvent, replaceAll: boolean) => void;
}

const buildLookupQuery = (anchor: MemoryAnchorEvent): string =>
  [anchor.title, anchor.artistName, anchor.festivalName, anchor.venue]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

export const MemoryAnchorEventLookupPanel = ({
  anchor,
  locks,
  memoryDatePrecision,
  memoryStartDate,
  memoryEndDate,
  memoryCity,
  memoryCountry,
  t,
  onMerged,
}: MemoryAnchorEventLookupPanelProps): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const privacySettings = usePrivacySettingsStore((state) => state.settings);
  const ensurePrivacySettings = usePrivacySettingsStore((state) => state.ensurePrivacySettings);
  const [festivalOpen, setFestivalOpen] = useState(false);
  const [pending, setPending] = useState<EventLookupResult | null>(null);
  const [pendingReplaceAll, setPendingReplaceAll] = useState(false);

  const query = useMemo(() => buildLookupQuery(anchor), [anchor.title, anchor.artistName, anchor.festivalName, anchor.venue]);

  const searchCountry = countryLabelToIsoCode(anchor.country.trim() || memoryCountry) ?? undefined;
  const searchCity = anchor.city.trim() || memoryCity.trim() || undefined;

  useEffect(() => {
    if (user?.id) {
      void ensurePrivacySettings(user.id);
    }
  }, [ensurePrivacySettings, user?.id]);

  const { results, warnings, loading, error } = useEventLookup({
    query,
    mode: "past",
    city: searchCity,
    country: searchCountry,
    startDate: memoryStartDate,
    endDate: memoryEndDate,
    enabled: query.length >= 3,
    externalSearchAllowed: privacySettings?.allowExternalEventSearch === true,
  });

  const merge = (result: EventLookupResult, replaceAll: boolean, festivalSelection?: FestivalSelection): void => {
    const next = applyEventLookupToMemoryAnchor(anchor, result, {
      replaceAll,
      locks,
      festivalSelection,
    });
    onMerged(next, replaceAll);
  };

  const handlePick = (result: EventLookupResult, replaceAll: boolean): void => {
    if (isMultiDayEventResult(result)) {
      setPending(result);
      setPendingReplaceAll(replaceAll);
      setFestivalOpen(true);
      return;
    }
    merge(result, replaceAll);
  };

  const handleFestivalConfirm = (selection: FestivalSelection): void => {
    if (pending) {
      merge(pending, pendingReplaceAll, selection);
    }
    setPending(null);
  };

  return (
    <>
      {memoryDatePrecision === "month" ? (
        <Typography variant="caption" color="warning.light" sx={{ display: "block", mb: 0.5 }}>
          {t("events.pastDatesApproxHint")}
        </Typography>
      ) : null}
      {query.length < 3 ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {t("events.typeMoreChars")}
        </Typography>
      ) : null}
      {query.length >= 3 && privacySettings && !privacySettings.allowExternalEventSearch ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
          {t("privacy.eventSearchDisabledShort")}
        </Typography>
      ) : null}
      <EventLookupResultsPanel mode="past" results={results} loading={loading} error={error} warnings={warnings} onPick={handlePick} />
      <FestivalDatesDialog
        open={festivalOpen}
        result={pending}
        onClose={() => {
          setFestivalOpen(false);
          setPending(null);
        }}
        onConfirm={handleFestivalConfirm}
      />
    </>
  );
};
