import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventLookupResult } from "../../../entities/events/eventLookup.model";
import type { FestivalSelection } from "../../../entities/events/eventLookup.model";

interface FestivalDatesDialogProps {
  open: boolean;
  result: EventLookupResult | null;
  onClose: () => void;
  onConfirm: (selection: FestivalSelection) => void;
}

const enumerateDates = (start?: string, end?: string): string[] => {
  if (!start) {
    return [];
  }
  const s = dayjs(start);
  const e = end ? dayjs(end) : s;
  if (!s.isValid() || !e.isValid()) {
    return [start];
  }
  const out: string[] = [];
  let cur = s.startOf("day");
  const last = e.startOf("day");
  let guard = 0;
  while ((cur.isBefore(last) || cur.isSame(last)) && guard < 40) {
    out.push(cur.format("YYYY-MM-DD"));
    cur = cur.add(1, "day");
    guard += 1;
  }
  return out.length > 0 ? out : [start];
};

export const FestivalDatesDialog = ({ open, result, onClose, onConfirm }: FestivalDatesDialogProps): JSX.Element => {
  const { t } = useTranslation();
  const dates = useMemo(
    () => enumerateDates(result?.startDate, result?.endDate ?? result?.startDate),
    [result?.id, result?.startDate, result?.endDate],
  );
  const [mode, setMode] = useState<"all_days" | "specific_days">("specific_days");
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      const first = dates[0];
      setMode("specific_days");
      setPicked(first ? [first] : []);
    }
  }, [open, result?.id, dates]);

  const originalStart = result?.startDate ?? "";
  const originalEnd = result?.endDate ?? result?.startDate ?? "";

  const handleConfirm = (): void => {
    if (!result?.startDate) {
      onClose();
      return;
    }
    const rawDates = mode === "all_days" ? dates : picked.length > 0 ? picked : dates[0] ? [dates[0]] : [result.startDate];
    const selection: FestivalSelection = {
      mode,
      selectedDates: [...rawDates].filter(Boolean).sort(),
      originalStartDate: originalStart,
      originalEndDate: originalEnd,
    };
    onConfirm(selection);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("events.festivalDatesTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t("events.festivalDatesBody", { title: result?.title ?? "" })}
          </Typography>
          <RadioGroup value={mode} onChange={(_, v) => setMode(v as "all_days" | "specific_days")}>
            <FormControlLabel value="all_days" control={<Radio />} label={t("events.festivalAllDays")} />
            <FormControlLabel value="specific_days" control={<Radio />} label={t("events.festivalPickDays")} />
          </RadioGroup>
          {mode === "specific_days" ? (
            <ToggleButtonGroup
              value={picked}
              exclusive={false}
              onChange={(_, next) => setPicked(Array.isArray(next) ? next : next ? [next] : [])}
              sx={{ flexWrap: "wrap", gap: 0.5 }}
            >
              {dates.map((d) => (
                <ToggleButton key={d} value={d} size="small" sx={{ textTransform: "none" }}>
                  {d}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={handleConfirm}>
          {t("common.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
