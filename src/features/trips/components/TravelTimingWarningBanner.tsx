import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BetterDateWindow, TravelTimingDateRange, TravelTimingInsight } from "../../../services/planning/timing/travelTimingTypes";
import { analyzeTravelTiming, suggestBetterDates } from "../../../services/planning/timing/travelTimingService";
import { formatUserFriendlyDateRange } from "../../../shared/lib/dateDisplay";

export type TravelTimingWarningBannerProps = {
  country: string;
  city?: string;
  destinationLabel?: string;
  dateRange: TravelTimingDateRange;
  /** When set, "Apply" on a suggested window calls this with the new range. */
  onApplyDateRange?: (range: TravelTimingDateRange) => void;
};

const maxSeverity = (insights: TravelTimingInsight[]): "critical" | "warning" | "info" | null => {
  if (insights.some((i) => i.severity === "critical")) {
    return "critical";
  }
  if (insights.some((i) => i.severity === "warning")) {
    return "warning";
  }
  if (insights.some((i) => i.severity === "info")) {
    return "info";
  }
  return null;
};

const alertSeverity = (s: "critical" | "warning" | "info"): "error" | "warning" | "info" =>
  s === "critical" ? "error" : s;

export const TravelTimingWarningBanner = ({
  country,
  city,
  destinationLabel,
  dateRange,
  onApplyDateRange,
}: TravelTimingWarningBannerProps): JSX.Element | null => {
  const { t } = useTranslation();
  const fingerprint = useMemo(
    () => `${country.trim()}|${(city ?? "").trim()}|${dateRange.start}|${dateRange.end}`,
    [country, city, dateRange.end, dateRange.start],
  );
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<BetterDateWindow[]>([]);

  useEffect(() => {
    setDismissedFor(null);
  }, [fingerprint]);

  const insights = useMemo(() => {
    if (!country.trim() || !dateRange.start?.trim() || !dateRange.end?.trim()) {
      return [];
    }
    return analyzeTravelTiming({ country, city, destinationLabel, dateRange });
  }, [country, city, dateRange, destinationLabel]);

  useEffect(() => {
    if (!suggestOpen) {
      return;
    }
    setAlternatives(
      suggestBetterDates({
        country,
        city,
        destinationLabel,
        currentDateRange: dateRange,
      }),
    );
  }, [suggestOpen, country, city, destinationLabel, dateRange]);

  if (insights.length === 0) {
    return null;
  }

  if (dismissedFor === fingerprint) {
    return null;
  }

  const top = maxSeverity(insights);
  if (!top) {
    return null;
  }

  const applyWindow = (w: BetterDateWindow): void => {
    onApplyDateRange?.({ start: w.start, end: w.end });
    setSuggestOpen(false);
  };

  return (
    <>
      <Alert
        severity={alertSeverity(top)}
        sx={{ alignItems: "flex-start" }}
        action={
          <IconButton size="small" aria-label={t("travelTiming.dismiss")} onClick={() => setDismissedFor(fingerprint)}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        }
      >
        <AlertTitle>{t("travelTiming.title")}</AlertTitle>
        <Box sx={{ display: "grid", gap: 1, pr: 1 }}>
          {insights.map((ins) => (
            <Box key={`${ins.type}-${ins.message.slice(0, 48)}`}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {ins.message}
              </Typography>
              {ins.recommendation ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  {ins.recommendation}
                </Typography>
              ) : null}
            </Box>
          ))}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
            {onApplyDateRange ? (
              <Button size="small" variant="outlined" startIcon={<EventAvailableOutlinedIcon />} onClick={() => setSuggestOpen(true)}>
                {t("travelTiming.suggestBetterCta")}
              </Button>
            ) : null}
          </Box>
        </Box>
      </Alert>

      <Dialog open={suggestOpen} onClose={() => setSuggestOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t("travelTiming.suggestDialogTitle")}</DialogTitle>
        <DialogContent>
          {alternatives.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("travelTiming.suggestEmpty")}
            </Typography>
          ) : (
            <List disablePadding>
              {alternatives.map((w) => (
                <ListItem key={w.id} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={() => applyWindow(w)}
                    sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    <ListItemText
                      primary={w.label}
                      secondary={`${formatUserFriendlyDateRange(w.start, w.end)}\n${w.rationale}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestOpen(false)}>{t("common.cancel")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
