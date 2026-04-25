import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import { Alert, Box, Button, LinearProgress, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ACHIEVEMENT_DEFINITIONS } from "../achievement.definitions";
import { getAchievementDisplayTarget } from "../achievementEngine";
import type { Achievement } from "../achievement.types";
import type { AchievementProgressDocument } from "../achievementRepository";
import { achievementRepository } from "../achievementRepository";
import { AchievementCatalogIcon } from "../achievementUi";
import { TravelerJourneyView, useTravelerJourneyData } from "../../traveler-journey";

type Row = { def: Achievement; doc: AchievementProgressDocument | null };

const Section = ({
  title,
  icon,
  rows,
  emptyHint,
}: {
  title: string;
  icon: ReactNode;
  rows: Row[];
  emptyHint?: string;
}): JSX.Element => (
  <GlassPanel sx={{ p: 2, display: "grid", gap: 1.25 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {icon}
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        ({rows.length})
      </Typography>
    </Box>
    {rows.length === 0 && emptyHint ? (
      <Typography variant="body2" color="text.secondary">
        {emptyHint}
      </Typography>
    ) : null}
    <Box sx={{ display: "grid", gap: 1.25 }}>
      {rows.map(({ def, doc }, index) => {
        const target = doc?.target ?? getAchievementDisplayTarget(def);
        const progress = doc?.progress ?? 0;
        const ratio = target > 0 ? Math.min(1, progress / target) : 0;
        const unlocked = Boolean(doc?.unlocked);
        const isLast = index === rows.length - 1;
        return (
          <Box
            key={def.key}
            sx={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 1.25,
              alignItems: "start",
              py: 0.5,
              borderBottom: isLast ? "none" : "1px solid",
              borderColor: "divider",
            }}
          >
            <AchievementCatalogIcon name={def.icon} />
            <Box sx={{ minWidth: 0, display: "grid", gap: 0.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                <Typography variant="body2" fontWeight={700}>
                  {def.title}
                </Typography>
                {unlocked ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "success.main" }} aria-label="Unlocked" />
                ) : null}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                {def.description}
              </Typography>
              <Box sx={{ display: "grid", gap: 0.35, pt: 0.25 }}>
                <LinearProgress variant="determinate" value={ratio * 100} sx={{ height: 4, borderRadius: 99 }} />
                <Typography variant="caption" color="text.secondary">
                  {unlocked
                    ? `${progress} / ${target}`
                    : `${Math.min(progress, target)} / ${target}`}
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  </GlassPanel>
);

export const AchievementsPage = (): JSX.Element => {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const ensureTrips = useTripsStore((s) => s.ensureTrips);
  const tripIds = useTripsStore((s) => s.tripIds);
  const tripsById = useTripsStore((s) => s.tripsById);
  const ensurePreferences = useUserPreferencesStore((s) => s.ensurePreferences);
  const trackingEnabled = useUserPreferencesStore((s) => {
    const p = s.preferences;
    if (!p) {
      return true;
    }
    return p.trackAchievements !== false;
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (userId) {
      void ensurePreferences(userId);
    }
  }, [ensurePreferences, userId]);

  useEffect(() => {
    if (userId) {
      void ensureTrips(userId);
    }
  }, [ensureTrips, userId]);

  const tripsForJourney = useMemo(
    () => tripIds.map((id) => tripsById[id]).filter((row): row is NonNullable<typeof row> => Boolean(row)),
    [tripIds, tripsById],
  );
  const { journey, countriesByTripId } = useTravelerJourneyData(userId || undefined, tripsForJourney);

  const load = useCallback(async (): Promise<void> => {
    if (!userId) {
      setRows([]);
      return;
    }
    setStatus("loading");
    try {
      const docs = await achievementRepository.listByUserId(userId);
      const byKey = new Map(docs.map((d) => [d.achievementKey, d]));
      setRows(
        ACHIEVEMENT_DEFINITIONS.map((def) => ({
          def,
          doc: byKey.get(def.key) ?? null,
        })),
      );
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setRows([]);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { unlocked, inProgress, locked } = useMemo(() => {
    const unlockedR: Row[] = [];
    const inProgressR: Row[] = [];
    const lockedR: Row[] = [];
    for (const row of rows) {
      const u = Boolean(row.doc?.unlocked);
      const p = row.doc?.progress ?? 0;
      if (u) {
        unlockedR.push(row);
      } else if (p > 0) {
        inProgressR.push(row);
      } else {
        lockedR.push(row);
      }
    }
    return { unlocked: unlockedR, inProgress: inProgressR, locked: lockedR };
  }, [rows]);

  return (
    <Box sx={{ display: "grid", gap: 2.5 }}>
      <SectionHeader title={t("achievements.screenTitle")} subtitle={t("achievements.screenSubtitle")} />
      {userId ? (
        <TravelerJourneyView journey={journey} countriesByTripId={countriesByTripId} variant="strip" />
      ) : null}
      {!trackingEnabled ? (
        <Alert
          severity="info"
          action={
            <Button component={Link} to="/settings" color="inherit" size="small">
              {t("achievements.openPreferences")}
            </Button>
          }
        >
          {t("achievements.trackingPausedBanner")}
        </Alert>
      ) : null}
      {status === "error" ? (
        <GlassPanel sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t("achievements.loadError")}
          </Typography>
        </GlassPanel>
      ) : null}
      {status === "loading" && rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("common.loading")}
        </Typography>
      ) : null}
      <Section
        title={t("achievements.sectionUnlocked")}
        icon={<CheckCircleRoundedIcon color="success" fontSize="small" />}
        rows={unlocked}
        emptyHint={t("achievements.emptyUnlocked")}
      />
      <Section
        title={t("achievements.sectionInProgress")}
        icon={<RadioButtonUncheckedRoundedIcon color="action" fontSize="small" />}
        rows={inProgress}
        emptyHint={t("achievements.emptyInProgress")}
      />
      <Section
        title={t("achievements.sectionLocked")}
        icon={<LockRoundedIcon color="disabled" fontSize="small" />}
        rows={locked}
        emptyHint={undefined}
      />
    </Box>
  );
};
