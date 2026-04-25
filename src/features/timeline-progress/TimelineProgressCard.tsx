import { Chip, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../shared/ui/GlassPanel";
import type { TimelineProgress, TimelineProgressStatus } from "./timelineProgress.types";

type TimelineProgressCardProps = {
  progress: TimelineProgress;
  /** IANA timezone for optional wall-clock hints on current/next. */
  timeZone?: string;
};

const statusChipColor = (
  status: TimelineProgressStatus,
): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
  switch (status) {
    case "finished":
      return "success";
    case "ahead":
      return "info";
    case "on_track":
      return "success";
    case "delayed":
      return "warning";
    case "not_started":
      return "default";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
};

const formatWallTime = (iso: string, timeZone: string | undefined): string | null => {
  if (!timeZone) {
    return null;
  }
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return null;
  }
  return d.toLocaleTimeString(undefined, { timeZone, hour: "2-digit", minute: "2-digit" });
};

export const TimelineProgressCard = ({ progress, timeZone }: TimelineProgressCardProps): JSX.Element => {
  const { t } = useTranslation();
  const statusLabel = useMemo(() => t(`timelineProgress.status.${progress.status}`), [progress.status, t]);
  const chipColor = statusChipColor(progress.status);

  return (
    <GlassPanel sx={{ p: 2, display: "grid", gap: 1.25 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          {t("timelineProgress.title")}
        </Typography>
        <Chip size="small" label={statusLabel} color={chipColor} variant={progress.status === "on_track" || progress.status === "finished" ? "outlined" : "filled"} />
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {t("timelineProgress.counts", {
          completed: progress.completedCount,
          skipped: progress.skippedCount,
          remaining: progress.remainingCount,
        })}
      </Typography>
      {progress.delayMinutes > 0 ? (
        <Typography variant="body2" color="warning.main">
          {t("timelineProgress.delayMinutes", { count: progress.delayMinutes })}
        </Typography>
      ) : null}
      {progress.currentItem ? (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t("timelineProgress.current", { title: progress.currentItem.title })}
          {formatWallTime(progress.currentItem.plannedStartTime, timeZone) && formatWallTime(progress.currentItem.plannedEndTime, timeZone)
            ? ` · ${formatWallTime(progress.currentItem.plannedStartTime, timeZone)}–${formatWallTime(progress.currentItem.plannedEndTime, timeZone)}`
            : ""}
        </Typography>
      ) : null}
      {progress.nextItem && progress.nextItem.id !== progress.currentItem?.id ? (
        <Typography variant="caption" color="text.secondary">
          {t("timelineProgress.next", { title: progress.nextItem.title })}
        </Typography>
      ) : null}
    </GlassPanel>
  );
};
