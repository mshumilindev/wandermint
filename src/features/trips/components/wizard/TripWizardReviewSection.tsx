import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { Alert, Box, Button, Divider, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { TripDraft } from "../../../../services/planning/tripGenerationService";
import { formatBudgetAmountLabel } from "../../../../shared/lib/priceDisplay";
import { sanitizeUserFacingLine } from "../../../../shared/lib/userFacingText";
import type { UserPreferences } from "../../../../entities/user/model";
import { GlassPanel } from "../../../../shared/ui/GlassPanel";
import { WizardSectionHeader } from "./WizardSectionHeader";

interface TripWizardReviewSectionProps {
  draft: TripDraft;
  tripValidation: { isValid: boolean; message: string | null };
  preferences: UserPreferences | null;
  isGenerating: boolean;
  generateOptionTarget?: number;
  onGenerate: () => void;
  onExit: () => void;
}

export const TripWizardReviewSection = ({
  draft,
  tripValidation,
  preferences,
  isGenerating,
  generateOptionTarget,
  onGenerate,
  onExit,
}: TripWizardReviewSectionProps): JSX.Element => {
  const { t } = useTranslation();

  const routeLabel =
    draft.planningMode === "event_led"
      ? draft.anchorEvents.map((e) => `${e.city} (${sanitizeUserFacingLine(e.title)})`).join(" → ") || t("wizard.review.noAnchors")
      : draft.tripSegments.map((s) => `${s.city}, ${s.country}`.trim()).filter(Boolean).join(" → ") || t("wizard.review.noRoute");

  const anchorIsoDates =
    draft.planningMode === "event_led" && draft.anchorEvents.length > 0
      ? draft.anchorEvents.flatMap((e) => [e.startAt.slice(0, 10), (e.endAt ?? e.startAt).slice(0, 10)])
      : [];
  const eventLedStart = anchorIsoDates.length > 0 ? anchorIsoDates.reduce((a, b) => (a < b ? a : b)) : "";
  const eventLedEnd = anchorIsoDates.length > 0 ? anchorIsoDates.reduce((a, b) => (a > b ? a : b)) : "";

  const datesLabel =
    draft.planningMode === "event_led" && eventLedStart && eventLedEnd
      ? `${eventLedStart} → ${eventLedEnd}`
      : draft.dateRange.start && draft.dateRange.end
        ? `${draft.dateRange.start} → ${draft.dateRange.end}`
        : draft.tripSegments.some((s) => s.startDate && s.endDate)
          ? t("wizard.review.datesFromStops")
          : t("wizard.review.noDates");

  const budgetLabel = formatBudgetAmountLabel(draft.budget.amount, draft.budget.currency, {
    preferredCurrency: preferences?.currency ?? undefined,
    locale: preferences?.locale ?? undefined,
  });

  const paceLabel = `${t(`wizard.paceMarks.${draft.preferences.pace}`)} · ${t(`wizard.walkingMarks.${draft.preferences.walkingTolerance}`)}`;

  const mustSeeLine =
    (draft.mustSeePlaces?.length ?? 0) > 0
      ? (draft.mustSeePlaces ?? []).map((p) => p.label).join(" · ")
      : draft.preferences.mustSeeNotes.trim();
  const mustSeePreview = mustSeeLine
    ? sanitizeUserFacingLine(mustSeeLine.length > 160 ? `${mustSeeLine.slice(0, 160)}…` : mustSeeLine)
    : t("wizard.review.noMustSee");

  return (
    <GlassPanel
      elevated
      sx={{
        p: { xs: 2.5, md: 3 },
        display: "grid",
        gap: 2,
        border: "1px solid rgba(0, 180, 216, 0.35)",
        background: "linear-gradient(145deg, rgba(0, 180, 216, 0.08), rgba(3, 15, 23, 0.55))",
      }}
    >
      <WizardSectionHeader index={5} title={t("wizard.sections.reviewGenerate")} subtitle={t("wizard.sections.reviewGenerateSubtitle")} />

      {!tripValidation.isValid && tripValidation.message ? <Alert severity="warning">{tripValidation.message}</Alert> : null}

      <Box
        sx={{
          display: "grid",
          gap: 1.75,
          p: 2,
          borderRadius: 2,
          bgcolor: "rgba(3, 15, 23, 0.45)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <ReviewRow label={t("wizard.review.route")} value={routeLabel} />
        <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
        <ReviewRow label={t("wizard.review.dates")} value={datesLabel} />
        <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
        <ReviewRow
          label={t("wizard.review.budget")}
          value={`${budgetLabel} · ${t(`wizard.budgetStyles.${draft.budget.style}.title`)}${
            draft.budget.dailySoftLimit ? ` · ${t("wizard.review.dailyCap", { amount: draft.budget.dailySoftLimit, currency: draft.budget.currency })}` : ""
          }`}
        />
        <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
        <ReviewRow label={t("wizard.review.pace")} value={paceLabel} />
        <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
        <ReviewRow
          label={t("wizard.food")}
          value={
            (draft.foodPreferences?.length ?? 0) > 0
              ? sanitizeUserFacingLine(
                  (draft.foodPreferences ?? [])
                    .map((p) =>
                      p.type === "restaurant"
                        ? `${t("wizard.review.foodRestaurant")}: ${p.place.name}`
                        : `${t("wizard.review.foodIntent")}: ${p.label} (${p.normalizedTags.join(", ")})`,
                    )
                    .join(" · "),
                )
              : draft.preferences.foodInterests.length > 0
                ? sanitizeUserFacingLine(draft.preferences.foodInterests.join(", "))
                : t("wizard.review.noFood")
          }
          multiline
        />
        <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
        <ReviewRow label={t("wizard.mustSeeNotes")} value={mustSeePreview} multiline />
        {draft.planningMode === "event_led" && draft.anchorEvents.length > 0 ? (
          <>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                {t("wizard.review.anchorTimes")}
              </Typography>
              <Box sx={{ display: "grid", gap: 0.75 }}>
                {draft.anchorEvents.map((event) => (
                  <Typography key={event.id} variant="body2" color="text.primary">
                    {sanitizeUserFacingLine(event.title)} — {dayjs(event.startAt).format("ddd D MMM, HH:mm")} · {event.city}
                  </Typography>
                ))}
              </Box>
            </Box>
          </>
        ) : null}
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "space-between", alignItems: "center" }}>
        <Button color="inherit" onClick={onExit}>
          {t("wizard.exitToTrips")}
        </Button>
        <Button variant="contained" disabled={!tripValidation.isValid || isGenerating} startIcon={<AutoAwesomeOutlinedIcon />} onClick={onGenerate} size="large">
          {t("wizard.generate", { count: generateOptionTarget ?? 3 })}
        </Button>
      </Box>
    </GlassPanel>
  );
};

const ReviewRow = ({ label, value, multiline }: { label: string; value: string; multiline?: boolean }): JSX.Element => (
  <Box>
    <Typography variant="caption" color="primary.light" sx={{ fontWeight: 600, letterSpacing: "0.04em" }}>
      {label}
    </Typography>
    <Typography variant="body2" color="text.primary" sx={{ mt: 0.35, whiteSpace: multiline ? "pre-wrap" : "normal" }}>
      {value}
    </Typography>
  </Box>
);
