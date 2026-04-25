import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Alert, Box, Button, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { ActivityBlock, ActivityCompletionStatus } from "../../../entities/activity/model";
import type { SafetyAssessment } from "../../../features/safety/safety.types";
import { shouldSurfaceSafetyWarning } from "../../../features/safety/safetyRules";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { formatCostRangeLabel } from "../../../shared/lib/priceDisplay";
import { sanitizeOptionalUserFacingDescription, sanitizeUserFacingLine } from "../../../shared/lib/userFacingText";
import { getStepPresentation } from "../lib/stepPresentation";
import { FoodCultureBadge } from "../../food-culture/components/FoodCultureBadge";
import type { ActivityOverlayEntry, InsertedPlanStub } from "../visited/planOverlayModel";
import { isEffectivelySkipped, isEffectivelyVisited } from "../visited/planVisitOverlayHelpers";

interface ActivityBlockCardProps {
  block: ActivityBlock;
  doneLabel: string;
  skippedLabel: string;
  /** When true, cost and estimate pills are hidden (shared read-only view). */
  hideCosts?: boolean;
  onStatusChange?: (status: ActivityCompletionStatus) => void;
  /** Raw structural assessment; UI hides when the user has acknowledged. */
  safetyAssessment?: SafetyAssessment | null;
  onSafetyAcknowledge?: () => void;
  /** Local overlay (visited / skipped) — does not replace canonical block data. */
  visitOverlay?: ActivityOverlayEntry;
  insertedAfter?: InsertedPlanStub[];
  /** One-shot emphasis when a remote viewer’s copy just synced a completion change. */
  statusHighlight?: boolean;
}

const completionPulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.45); }
  70% { box-shadow: 0 0 0 12px rgba(46, 204, 113, 0); }
  100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); }
`;

export const ActivityBlockCard = ({
  block,
  doneLabel,
  skippedLabel,
  hideCosts = false,
  onStatusChange,
  safetyAssessment,
  onSafetyAcknowledge,
  visitOverlay,
  insertedAfter,
  statusHighlight = false,
}: ActivityBlockCardProps): JSX.Element => {
  const { t } = useTranslation();
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const cleanTitle = sanitizeUserFacingLine(block.title);
  const cleanDescription = sanitizeOptionalUserFacingDescription(block.description);
  const presentation = getStepPresentation(block);
  const effectiveVisited = isEffectivelyVisited(block, visitOverlay);
  const effectiveSkipped = isEffectivelySkipped(block, visitOverlay);
  const costLabel = formatCostRangeLabel(block.estimatedCost, {
    preferredCurrency: preferences?.currency,
    locale: preferences?.locale,
  });
  const showEstimatedCost =
    block.estimatedCost.certainty === "estimated" || block.estimatedCost.certainty === "unknown";

  const showSafety =
    safetyAssessment != null && shouldSurfaceSafetyWarning(safetyAssessment) && !block.safetyWarningAcknowledged;

  const safetyReasonKey =
    safetyAssessment && safetyAssessment.reasons[0]
      ? (`trips.safety.reasons.${safetyAssessment.reasons[0]}` as const)
      : "trips.safety.generic";

  return (
    <GlassPanel
      sx={{
        p: 2,
        display: "grid",
        gap: 1.5,
        opacity: effectiveSkipped ? 0.62 : 1,
        background: `linear-gradient(135deg, ${presentation.accentSoft} 0%, rgba(4, 11, 19, 0.82) 22%, rgba(4, 11, 19, 0.88) 100%)`,
        borderColor: presentation.accentGlow,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 14px 34px rgba(0,0,0,0.28), 0 0 0 1px ${presentation.accentGlow}`,
        ...(statusHighlight
          ? {
              animation: `${completionPulse} 0.9s ease-out 1`,
            }
          : {}),
      }}
    >
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "minmax(112px, 32%) minmax(0, 1fr)" },
        gap: 1.5,
        alignItems: "start",
      }}
    >
      <Box sx={{ width: "100%", maxWidth: { sm: 200 }, justifySelf: { xs: "stretch", sm: "start" } }}>
        <EntityPreviewImage
          entityId={`activity:${block.id}`}
          variant="activityThumb"
          title={block.place?.name ?? cleanTitle}
          locationHint={
            [block.place?.city, block.place?.country].filter(Boolean).join(", ") ||
            block.place?.address ||
            cleanTitle
          }
          categoryHint={block.category}
          latitude={block.place?.latitude}
          longitude={block.place?.longitude}
          alt={`${cleanTitle} · ${[block.place?.city, block.place?.country].filter(Boolean).join(", ") || block.place?.name || cleanTitle}`}
        />
      </Box>
      <Box sx={{ display: "grid", gap: 1.25, minWidth: 0 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box sx={{ display: "grid", gap: 0.75 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  color: presentation.accent,
                  background: presentation.accentSoft,
                  boxShadow: `0 0 0 1px ${presentation.accentGlow}`,
                  flexShrink: 0,
                }}
              >
                {presentation.icon}
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {block.startTime} - {block.endTime}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
              <Typography
                variant="h6"
                sx={{
                  lineHeight: 1.15,
                  textDecoration: effectiveSkipped ? "line-through" : "none",
                }}
              >
                {cleanTitle}
              </Typography>
              {block.place?.planningSource === "bucket_list" ? (
                <MetadataPill label={t("trips.bucketListBadge")} tone="teal" />
              ) : null}
            </Box>
            {block.place?.name && block.place.name !== cleanTitle ? (
              <Typography variant="body2" color="text.secondary">
                {block.place.name}
              </Typography>
            ) : null}
          </Box>
          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexShrink: 0 }}>
            {effectiveVisited ? (
              <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 22 }} aria-label={t("trips.pacing.markVisited")} />
            ) : null}
            <StatusBadge status={block.completionStatus} />
          </Box>
        </Box>
        {cleanDescription ? (
          <Typography variant="body2" color="text.secondary">
            {cleanDescription}
          </Typography>
        ) : null}
        {block.type === "meal" && block.foodCultureNotes && block.foodCultureNotes.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {block.foodCultureNotes.map((note) => (
              <FoodCultureBadge key={note} variant="local_tip" label={note} />
            ))}
          </Box>
        ) : null}
        {showSafety ? (
          <Alert
            severity={safetyAssessment?.riskLevel === "high" ? "warning" : "info"}
            variant="outlined"
            sx={{ borderRadius: 2, textAlign: "left" }}
            action={
              onSafetyAcknowledge ? (
                <Button color="inherit" size="small" onClick={onSafetyAcknowledge}>
                  {t("trips.safety.acknowledge")}
                </Button>
              ) : undefined
            }
          >
            {(() => {
              const translated = t(safetyReasonKey);
              return translated === safetyReasonKey ? t("trips.safety.generic") : translated;
            })()}
          </Alert>
        ) : null}
      </Box>
    </Box>
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <MetadataPill icon={presentation.icon} label={presentation.label} tone="teal" />
      <MetadataPill label={block.type} tone="teal" />
      <MetadataPill label={block.priority} tone={block.priority === "must" ? "amber" : "default"} />
      {!hideCosts ? <MetadataPill label={costLabel} /> : null}
      {!hideCosts && showEstimatedCost ? <MetadataPill label={t("common.estimated")} tone="default" /> : null}
      {block.locked ? <MetadataPill icon={<LockOutlinedIcon />} label={t("trips.locked")} tone="amber" /> : null}
      {(insertedAfter ?? []).map((row) => (
        <MetadataPill key={row.id} label={`${t("trips.pacing.addedBadge")} · ${row.title}`} tone="teal" />
      ))}
    </Box>
    {onStatusChange ? (
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button startIcon={<CheckCircleOutlineRoundedIcon />} variant="outlined" onClick={() => onStatusChange("done")}>
          {doneLabel}
        </Button>
        <Button variant="text" onClick={() => onStatusChange("skipped")}>
          {skippedLabel}
        </Button>
      </Box>
    ) : null}
    </GlassPanel>
  );
};
