import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Alert, Box, Button, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { UnifiedPlanSuggestion } from "../pacing/planSuggestionEngine";
import { cooldownKeyFor, suggestionFingerprint } from "../pacing/planSuggestionEngine";
import type { VisitMarkSource } from "../visited/planOverlayModel";

interface PlanSuggestionBarProps {
  suggestion: UnifiedPlanSuggestion;
  onDismiss: (fingerprint: string, cooldownKey: string) => void;
  onMarkVisited: (activityKey: string, source: VisitMarkSource) => void;
  onSkip: (activityKey: string) => void;
  onInsert: (afterActivityKey: string, title: string, category: string, durationMinutes: number) => void;
  onRest: (variant: "park" | "cafe") => void;
}

export const PlanSuggestionBar = ({
  suggestion,
  onDismiss,
  onMarkVisited,
  onSkip,
  onInsert,
  onRest,
}: PlanSuggestionBarProps): JSX.Element => {
  const { t } = useTranslation();

  const dismiss = (fp: string, cd: string): void => {
    onDismiss(fp, cd);
  };

  if (suggestion.kind === "visit_prompt") {
    const fp = suggestionFingerprint("visit_prompt", suggestion.activityKey);
    const cd = cooldownKeyFor("visit_prompt", suggestion.activityKey);
    const source: VisitMarkSource =
      suggestion.role === "active" ? "suggested_time_location" : suggestion.role === "next" ? "suggested_location" : "suggested_time";
    return (
      <Alert
        severity="info"
        sx={{ py: 1.25, alignItems: "flex-start" }}
        action={
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, justifyContent: "flex-end" }}>
            <Button size="small" variant="contained" onClick={() => onMarkVisited(suggestion.activityKey, source)}>
              {t("trips.pacing.markVisited")}
            </Button>
            <Button size="small" color="inherit" onClick={() => dismiss(fp, cd)} aria-label={t("trips.pacing.dismiss")}>
              <CloseRoundedIcon fontSize="small" />
            </Button>
          </Box>
        }
      >
        <Typography variant="body2">{suggestion.message}</Typography>
      </Alert>
    );
  }

  if (suggestion.kind === "skip_prompt") {
    const fp = suggestionFingerprint("skip_prompt", suggestion.activityKey);
    const cd = cooldownKeyFor("skip_prompt");
    return (
      <Alert
        severity="warning"
        sx={{ py: 1.25 }}
        action={
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            <Button size="small" variant="outlined" onClick={() => onSkip(suggestion.activityKey)}>
              {t("trips.pacing.skip")}
            </Button>
            <Button size="small" color="inherit" onClick={() => dismiss(fp, cd)} aria-label={t("trips.pacing.dismiss")}>
              <CloseRoundedIcon fontSize="small" />
            </Button>
          </Box>
        }
      >
        <Typography variant="body2">{suggestion.message}</Typography>
      </Alert>
    );
  }

  if (suggestion.kind === "insert_prompt") {
    const fp = suggestionFingerprint("insert_prompt", suggestion.afterActivityKey);
    const cd = cooldownKeyFor("insert_prompt");
    return (
      <Alert
        severity="success"
        sx={{ py: 1.25 }}
        action={
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => onInsert(suggestion.afterActivityKey, suggestion.title, suggestion.category, suggestion.durationMinutes)}
            >
              {t("trips.pacing.add")}
            </Button>
            <Button size="small" color="inherit" onClick={() => dismiss(fp, cd)} aria-label={t("trips.pacing.dismiss")}>
              <CloseRoundedIcon fontSize="small" />
            </Button>
          </Box>
        }
      >
        <Typography variant="body2">{suggestion.message}</Typography>
      </Alert>
    );
  }

  const fp = suggestionFingerprint("rest_prompt", suggestion.variant);
  const cd = cooldownKeyFor("rest_prompt");
  return (
    <Alert
      severity="info"
      sx={{ py: 1.25 }}
      action={
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          <Button size="small" variant="outlined" onClick={() => onRest(suggestion.variant)}>
            {t("trips.pacing.takeBreak")}
          </Button>
          <Button size="small" color="inherit" onClick={() => dismiss(fp, cd)} aria-label={t("trips.pacing.dismiss")}>
            <CloseRoundedIcon fontSize="small" />
          </Button>
        </Box>
      }
    >
      <Typography variant="body2">{suggestion.message}</Typography>
    </Alert>
  );
};
