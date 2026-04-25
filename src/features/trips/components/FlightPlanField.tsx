import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchAirports } from "../../../services/flights/airportCatalog";
import type { Airport } from "../../../services/flights/flightTypes";
import { buildManualFlightSegment, resolveFlightByNumber } from "../../../services/flights/flightLookupService";
import type { TripDraft } from "../../../services/planning/tripGenerationService";

type FlightPlanFieldProps = {
  draft: TripDraft;
  patchDraft: (patch: Partial<TripDraft>) => void;
};

const toIsoFromLocal = (local: string): string => {
  const d = dayjs(local);
  return d.isValid() ? d.toISOString() : local;
};

export const FlightPlanField = ({ draft, patchDraft }: FlightPlanFieldProps): JSX.Element => {
  const { t } = useTranslation();
  const [inFlightNo, setInFlightNo] = useState(draft.flightInfo.flightNumber ?? "");
  const [inFlightDate, setInFlightDate] = useState(draft.dateRange.start ?? "");
  const [inLookupLoading, setInLookupLoading] = useState(false);
  const [manualDep, setManualDep] = useState<Airport | null>(null);
  const [manualArr, setManualArr] = useState<Airport | null>(null);
  const [manualDepTime, setManualDepTime] = useState("");
  const [manualArrTime, setManualArrTime] = useState("");

  const [outFlightNo, setOutFlightNo] = useState("");
  const [outFlightDate, setOutFlightDate] = useState(draft.dateRange.end ?? "");
  const [outLookupLoading, setOutLookupLoading] = useState(false);
  const [outManualDep, setOutManualDep] = useState<Airport | null>(null);
  const [outManualArr, setOutManualArr] = useState<Airport | null>(null);
  const [outManualDepTime, setOutManualDepTime] = useState("");
  const [outManualArrTime, setOutManualArrTime] = useState("");

  const inboundSummary = useMemo(() => {
    const f = draft.inboundFlight;
    if (!f) {
      return "";
    }
    return `${f.flightNumber} ${f.departureAirport.iataCode}→${f.arrivalAirport.iataCode}`;
  }, [draft.inboundFlight]);

  const outboundSummary = useMemo(() => {
    const f = draft.outboundFlight;
    if (!f) {
      return "";
    }
    return `${f.flightNumber} ${f.departureAirport.iataCode}→${f.arrivalAirport.iataCode}`;
  }, [draft.outboundFlight]);

  const applyInbound = (segment: ReturnType<typeof buildManualFlightSegment>): void => {
    patchDraft({
      inboundFlight: segment,
      flightInfo: {
        ...draft.flightInfo,
        flightNumber: segment.flightNumber,
        arrivalTime: segment.arrivalTime,
      },
    });
    setInFlightNo(segment.flightNumber);
  };

  const clearInbound = (): void => {
    patchDraft({
      inboundFlight: undefined,
      flightInfo: {
        ...draft.flightInfo,
        flightNumber: "",
        arrivalTime: undefined,
      },
    });
    setManualDep(null);
    setManualArr(null);
    setManualDepTime("");
    setManualArrTime("");
  };

  const applyOutbound = (segment: ReturnType<typeof buildManualFlightSegment>): void => {
    patchDraft({
      outboundFlight: segment,
      flightInfo: {
        ...draft.flightInfo,
        departureTime: segment.departureTime,
      },
    });
    setOutFlightNo(segment.flightNumber);
  };

  const clearOutbound = (): void => {
    patchDraft({
      outboundFlight: undefined,
      flightInfo: {
        ...draft.flightInfo,
        departureTime: undefined,
      },
    });
    setOutManualDep(null);
    setOutManualArr(null);
    setOutManualDepTime("");
    setOutManualArrTime("");
  };

  const lookupInbound = async (): Promise<void> => {
    setInLookupLoading(true);
    try {
      const seg = await resolveFlightByNumber({
        flightNumber: inFlightNo,
        flightDate: inFlightDate || draft.dateRange.start,
      });
      if (seg) {
        applyInbound(seg);
      }
    } finally {
      setInLookupLoading(false);
    }
  };

  const saveManualInbound = (): void => {
    if (!manualDep || !manualArr || !manualDepTime || !manualArrTime || !inFlightNo.trim()) {
      return;
    }
    const segment = buildManualFlightSegment({
      flightNumber: inFlightNo.trim(),
      departureAirport: manualDep,
      arrivalAirport: manualArr,
      departureTime: toIsoFromLocal(manualDepTime),
      arrivalTime: toIsoFromLocal(manualArrTime),
    });
    applyInbound(segment);
  };

  const lookupOutbound = async (): Promise<void> => {
    setOutLookupLoading(true);
    try {
      const seg = await resolveFlightByNumber({
        flightNumber: outFlightNo,
        flightDate: outFlightDate || draft.dateRange.end,
      });
      if (seg) {
        applyOutbound(seg);
      }
    } finally {
      setOutLookupLoading(false);
    }
  };

  const saveManualOutbound = (): void => {
    if (!outManualDep || !outManualArr || !outManualDepTime || !outManualArrTime || !outFlightNo.trim()) {
      return;
    }
    const segment = buildManualFlightSegment({
      flightNumber: outFlightNo.trim(),
      departureAirport: outManualDep,
      arrivalAirport: outManualArr,
      departureTime: toIsoFromLocal(outManualDepTime),
      arrivalTime: toIsoFromLocal(outManualArrTime),
    });
    applyOutbound(segment);
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <FlightTakeoffIcon fontSize="small" />
        {t("wizard.flightPlan.title")}
      </Typography>
      <Typography variant="caption" color="text.disabled">
        {t("wizard.flightPlan.subtitle")}
      </Typography>

      <Box sx={{ display: "grid", gap: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {t("wizard.flightPlan.inbound")}
        </Typography>
        {inboundSummary ? (
          <Typography variant="body2" color="primary.light">
            {inboundSummary}
          </Typography>
        ) : null}
        <TextField
          label={t("wizard.flightPlan.flightNumber")}
          value={inFlightNo}
          onChange={(e) => setInFlightNo(e.target.value.toUpperCase())}
          placeholder="BA123"
        />
        <TextField
          label={t("wizard.flightPlan.flightDate")}
          type="date"
          InputLabelProps={{ shrink: true }}
          value={inFlightDate}
          onChange={(e) => setInFlightDate(e.target.value)}
        />
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Button variant="outlined" size="small" disabled={inLookupLoading || inFlightNo.trim().length < 3} onClick={() => void lookupInbound()}>
            {inLookupLoading ? <CircularProgress size={18} /> : t("wizard.flightPlan.lookup")}
          </Button>
          {draft.inboundFlight ? (
            <Button size="small" color="inherit" onClick={clearInbound}>
              {t("wizard.flightPlan.clear")}
            </Button>
          ) : null}
        </Box>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
        <Typography variant="caption" color="text.secondary">
          {t("wizard.flightPlan.manualInbound")}
        </Typography>
        <Autocomplete
          options={searchAirports("")}
          getOptionLabel={(o) => `${o.iataCode} — ${o.name}`}
          value={manualDep}
          onChange={(_e, v) => setManualDep(v)}
          renderInput={(params) => <TextField {...params} label={t("wizard.flightPlan.depAirport")} />}
          filterOptions={(_opts, state) => searchAirports(state.inputValue, 24)}
        />
        <Autocomplete
          options={searchAirports("")}
          getOptionLabel={(o) => `${o.iataCode} — ${o.name}`}
          value={manualArr}
          onChange={(_e, v) => setManualArr(v)}
          renderInput={(params) => <TextField {...params} label={t("wizard.flightPlan.arrAirport")} />}
          filterOptions={(_opts, state) => searchAirports(state.inputValue, 24)}
        />
        <TextField
          label={t("wizard.flightPlan.depTimeLocal")}
          type="datetime-local"
          InputLabelProps={{ shrink: true }}
          value={manualDepTime}
          onChange={(e) => setManualDepTime(e.target.value)}
        />
        <TextField
          label={t("wizard.flightPlan.arrTimeLocal")}
          type="datetime-local"
          InputLabelProps={{ shrink: true }}
          value={manualArrTime}
          onChange={(e) => setManualArrTime(e.target.value)}
        />
        <Button
          variant="contained"
          size="small"
          sx={{ alignSelf: "flex-start" }}
          onClick={saveManualInbound}
          disabled={!manualDep || !manualArr || !inFlightNo.trim() || !manualDepTime || !manualArrTime}
        >
          {t("wizard.flightPlan.saveManual")}
        </Button>
      </Box>

      <Box sx={{ display: "grid", gap: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {t("wizard.flightPlan.outbound")}
        </Typography>
        {outboundSummary ? (
          <Typography variant="body2" color="primary.light">
            {outboundSummary}
          </Typography>
        ) : null}
        <TextField label={t("wizard.flightPlan.flightNumber")} value={outFlightNo} onChange={(e) => setOutFlightNo(e.target.value.toUpperCase())} />
        <TextField
          label={t("wizard.flightPlan.flightDate")}
          type="date"
          InputLabelProps={{ shrink: true }}
          value={outFlightDate}
          onChange={(e) => setOutFlightDate(e.target.value)}
        />
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Button variant="outlined" size="small" disabled={outLookupLoading || outFlightNo.trim().length < 3} onClick={() => void lookupOutbound()}>
            {outLookupLoading ? <CircularProgress size={18} /> : t("wizard.flightPlan.lookup")}
          </Button>
          {draft.outboundFlight ? (
            <Button size="small" color="inherit" onClick={clearOutbound}>
              {t("wizard.flightPlan.clear")}
            </Button>
          ) : null}
        </Box>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
        <Typography variant="caption" color="text.secondary">
          {t("wizard.flightPlan.manualOutbound")}
        </Typography>
        <Autocomplete
          options={searchAirports("")}
          getOptionLabel={(o) => `${o.iataCode} — ${o.name}`}
          value={outManualDep}
          onChange={(_e, v) => setOutManualDep(v)}
          renderInput={(params) => <TextField {...params} label={t("wizard.flightPlan.depAirport")} />}
          filterOptions={(_opts, state) => searchAirports(state.inputValue, 24)}
        />
        <Autocomplete
          options={searchAirports("")}
          getOptionLabel={(o) => `${o.iataCode} — ${o.name}`}
          value={outManualArr}
          onChange={(_e, v) => setOutManualArr(v)}
          renderInput={(params) => <TextField {...params} label={t("wizard.flightPlan.arrAirport")} />}
          filterOptions={(_opts, state) => searchAirports(state.inputValue, 24)}
        />
        <TextField
          label={t("wizard.flightPlan.depTimeLocal")}
          type="datetime-local"
          InputLabelProps={{ shrink: true }}
          value={outManualDepTime}
          onChange={(e) => setOutManualDepTime(e.target.value)}
        />
        <TextField
          label={t("wizard.flightPlan.arrTimeLocal")}
          type="datetime-local"
          InputLabelProps={{ shrink: true }}
          value={outManualArrTime}
          onChange={(e) => setOutManualArrTime(e.target.value)}
        />
        <Button
          variant="contained"
          size="small"
          sx={{ alignSelf: "flex-start" }}
          onClick={saveManualOutbound}
          disabled={!outManualDep || !outManualArr || !outFlightNo.trim() || !outManualDepTime || !outManualArrTime}
        >
          {t("wizard.flightPlan.saveManual")}
        </Button>
      </Box>
    </Box>
  );
};
