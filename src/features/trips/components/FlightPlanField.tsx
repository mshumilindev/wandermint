import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TripDraft } from "../../../services/planning/tripGenerationService";
import {
  buildManualFlightSegment,
  detectLayovers,
  extractFlightNumbers,
  lookupItineraryByFlightNumbers,
} from "../../../services/flights/flightLookupService";
import { searchAirports } from "../../../services/flights/airportCatalog";
import type { Airport, FlightLookupResult, FlightSegment, LayoverAnalysis, LayoverFeasibility } from "../../../services/flights/flightTypes";
import { WizardSectionHeader } from "../../../shared/ui/wizard/WizardSectionHeader";

type FlightPlanFieldProps = {
  draft: TripDraft;
  patchDraft: (patch: Partial<TripDraft>) => void;
};

const formatTime = (value: string | undefined): string => {
  if (!value) {
    return "n/a";
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("MMM D, HH:mm") : value;
};

const formatSegmentLine = (segment: FlightSegment): string =>
  `${segment.flightNumber} · ${segment.departureAirport.code} -> ${segment.arrivalAirport.code}`;

const toIsoFromLocal = (local: string): string => {
  const d = dayjs(local);
  return d.isValid() ? d.toISOString() : local;
};

const badgeLabel: Record<LayoverFeasibility, string> = {
  unknown: "Needs more flight details",
  airport_only: "Airport only",
  short_airport_walk: "Stay inside airport",
  near_airport: "Near airport only",
  city_walk_possible: "Short city walk possible",
  city_visit_recommended: "City visit recommended",
  airport_transfer_connection: "Airport transfer risk",
};

export const FlightPlanField = ({ draft, patchDraft }: FlightPlanFieldProps): JSX.Element => {
  const { t } = useTranslation();
  const [lookupInput, setLookupInput] = useState(draft.flightLookupInput ?? draft.flightInfo.flightNumber ?? "");
  const [lookupDate, setLookupDate] = useState(draft.dateRange.start ?? "");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "partial" | "not_found" | "provider_unavailable" | "error">(
    "idle",
  );
  const [lookupResults, setLookupResults] = useState<FlightLookupResult[]>([]);
  const [manualFlightNo, setManualFlightNo] = useState("");
  const [manualDepCode, setManualDepCode] = useState("");
  const [manualArrCode, setManualArrCode] = useState("");
  const [manualDepTime, setManualDepTime] = useState("");
  const [manualArrTime, setManualArrTime] = useState("");

  const currentSegments = draft.layoverContext?.segments ?? [];
  const currentLayovers = draft.layoverContext?.layovers ?? [];
  const currentWarnings = draft.layoverContext?.warnings ?? [];
  const parsedNumbers = useMemo(() => extractFlightNumbers(lookupInput), [lookupInput]);

  const applySegments = (segments: FlightSegment[], status: FlightLookupResult["status"], warnings: string[], source: "flight_lookup" | "manual" | "mixed"): void => {
    const layovers = detectLayovers(segments);
    patchDraft({
      flightLookupInput: lookupInput,
      inboundFlight: segments[0],
      outboundFlight: segments.length > 1 ? segments[segments.length - 1] : undefined,
      layoverContext: {
        source,
        flightLookupStatus: status,
        segments,
        hasLayovers: layovers.length > 0,
        layovers,
        warnings,
        originalFlightNumbers: parsedNumbers,
      },
      flightInfo: {
        ...draft.flightInfo,
        flightNumber: parsedNumbers.join(", "),
        arrivalTime: segments[0]?.scheduledArrivalTime ?? segments[0]?.arrivalTime,
        departureTime: segments.at(-1)?.scheduledDepartureTime ?? segments.at(-1)?.departureTime,
      },
    });
  };

  const runLookup = async (): Promise<void> => {
    if (!lookupInput.trim()) {
      return;
    }
    setLookupState("loading");
    try {
      const result = await lookupItineraryByFlightNumbers({
        input: lookupInput,
        date: lookupDate || draft.dateRange.start,
      });
      setLookupResults(result.results);
      const aggregateStatus: FlightLookupResult["status"] = result.results.some((r) => r.status === "found")
        ? result.results.every((r) => r.status === "found")
          ? "found"
          : "partial"
        : result.results[0]?.status ?? "not_found";
      if (aggregateStatus === "not_found" || aggregateStatus === "provider_unavailable") {
        setLookupState(aggregateStatus);
      } else {
        setLookupState(aggregateStatus === "found" ? "found" : "partial");
      }
      if (result.segments.length > 0) {
        applySegments(result.segments, aggregateStatus, result.warnings, "flight_lookup");
      }
    } catch {
      setLookupState("error");
    }
  };

  const addManualSegment = (): void => {
    const dep = searchAirports(manualDepCode, 1)[0];
    const arr = searchAirports(manualArrCode, 1)[0];
    if (!dep || !arr || !manualFlightNo.trim() || !manualDepTime || !manualArrTime) {
      return;
    }
    const manual = buildManualFlightSegment({
      flightNumber: manualFlightNo,
      departureAirport: dep as Airport,
      arrivalAirport: arr as Airport,
      departureTime: toIsoFromLocal(manualDepTime),
      arrivalTime: toIsoFromLocal(manualArrTime),
    });
    const merged = [...currentSegments, manual];
    applySegments(merged, draft.layoverContext?.flightLookupStatus ?? "partial", [...currentWarnings, "Includes manual flight segment input."], draft.layoverContext ? "mixed" : "manual");
    setManualFlightNo("");
    setManualDepCode("");
    setManualArrCode("");
    setManualDepTime("");
    setManualArrTime("");
  };

  const showManualFallback =
    lookupState === "partial" || lookupState === "provider_unavailable" || lookupState === "not_found" || lookupState === "error";

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <WizardSectionHeader
        index={2}
        title={t("wizard.flightPlan.title")}
        subtitle="Add one or more flight numbers to detect layovers and airport timing."
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
        <FlightTakeoffIcon fontSize="inherit" />
        {t("wizard.flightPlan.subtitle")}
      </Typography>
      <TextField
        label="Flight number"
        placeholder="e.g. LO281 or BA847, BA177"
        value={lookupInput}
        onChange={(event) => setLookupInput(event.target.value.toUpperCase())}
        helperText="Add one or more flight numbers to detect layovers and airport timing."
      />
      <TextField
        label={t("wizard.flightPlan.flightDate")}
        type="date"
        InputLabelProps={{ shrink: true }}
        value={lookupDate}
        onChange={(event) => setLookupDate(event.target.value)}
      />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" disabled={lookupState === "loading" || parsedNumbers.length === 0} onClick={() => void runLookup()}>
          {lookupState === "loading" ? <CircularProgress size={18} /> : t("wizard.flightPlan.lookup")}
        </Button>
        <Chip size="small" label={`Parsed: ${parsedNumbers.join(", ") || "none"}`} />
      </Box>

      {lookupState === "provider_unavailable" ? (
        <Alert severity="info">Flight lookup is unavailable right now. You can still add flight segments manually.</Alert>
      ) : null}
      {lookupState === "not_found" ? <Alert severity="warning">No route found for these flight numbers/date.</Alert> : null}
      {lookupState === "error" ? <Alert severity="error">Flight lookup failed. You can continue with manual segment fallback.</Alert> : null}

      {currentSegments.length > 0 ? (
        <Stack spacing={1}>
          {currentSegments.map((segment) => (
            <Box key={segment.id} sx={{ p: 1.25, borderRadius: 2, border: "1px solid rgba(183,237,226,0.18)", display: "grid", gap: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {formatSegmentLine(segment)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {segment.departureAirport.name ?? segment.departureAirport.code} ({segment.departureAirport.code}) {"->"}{" "}
                {segment.arrivalAirport.name ?? segment.arrivalAirport.code} ({segment.arrivalAirport.code})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatTime(segment.scheduledDepartureTime ?? segment.departureTime)} - {formatTime(segment.scheduledArrivalTime ?? segment.arrivalTime)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Source: {segment.sourceProvider} · Confidence: {segment.dataConfidence} · Status: {segment.status ?? "unknown"}
              </Typography>
            </Box>
          ))}
        </Stack>
      ) : null}

      {currentLayovers.length > 0 ? <LayoverIntelligenceWidget layovers={currentLayovers} /> : null}
      {currentWarnings.length > 0 ? (
        <Alert severity="info">
          {currentWarnings.slice(0, 2).join(" ")}
        </Alert>
      ) : null}

      {showManualFallback ? (
        <>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
          <Typography variant="subtitle2">Manual segment fallback</Typography>
          <TextField label={t("wizard.flightPlan.flightNumber")} value={manualFlightNo} onChange={(event) => setManualFlightNo(event.target.value.toUpperCase())} />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
            <TextField label="Departure airport code" placeholder="WAW" value={manualDepCode} onChange={(event) => setManualDepCode(event.target.value.toUpperCase())} />
            <TextField label="Arrival airport code" placeholder="LHR" value={manualArrCode} onChange={(event) => setManualArrCode(event.target.value.toUpperCase())} />
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
            <TextField label={t("wizard.flightPlan.depTimeLocal")} type="datetime-local" InputLabelProps={{ shrink: true }} value={manualDepTime} onChange={(event) => setManualDepTime(event.target.value)} />
            <TextField label={t("wizard.flightPlan.arrTimeLocal")} type="datetime-local" InputLabelProps={{ shrink: true }} value={manualArrTime} onChange={(event) => setManualArrTime(event.target.value)} />
          </Box>
          <Button
            variant="contained"
            sx={{ width: "fit-content" }}
            onClick={addManualSegment}
            disabled={!manualFlightNo.trim() || !manualDepCode.trim() || !manualArrCode.trim() || !manualDepTime || !manualArrTime}
          >
            {t("wizard.flightPlan.saveManual")}
          </Button>
        </>
      ) : null}
    </Box>
  );
};

const LayoverIntelligenceWidget = ({ layovers }: { layovers: LayoverAnalysis[] }): JSX.Element => (
  <Box sx={{ display: "grid", gap: 1 }}>
    <Typography variant="subtitle2">Layover Intelligence</Typography>
    {layovers.map((layover) => (
      <Box key={layover.id} sx={{ p: 1.25, borderRadius: 2, border: "1px solid rgba(183,237,226,0.18)", display: "grid", gap: 0.6 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {layover.previousFlight.flightNumber} {"->"} {layover.airport.code} {"->"} {layover.nextFlight.flightNumber}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
          <Chip size="small" color="primary" label={badgeLabel[layover.feasibility]} />
          <Chip size="small" label={`Layover: ${layover.durationMinutes ?? "n/a"} min`} />
          <Chip size="small" label={`Usable: ${layover.usableFreeTimeMinutes ?? "n/a"} min`} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {layover.recommendationTitle}: {layover.recommendationDescription}
        </Typography>
        {layover.suggestedMiniPlan ? (
          <Typography variant="caption" color="text.secondary">
            Mini-plan: {layover.suggestedMiniPlan.title} ({layover.suggestedMiniPlan.durationMinutes} min)
          </Typography>
        ) : null}
      </Box>
    ))}
  </Box>
);
