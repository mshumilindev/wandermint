import { Alert, Box, Grid, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import type { TravelAnalyticsBundle } from "../analytics.types";

const CHART_HEIGHT = 280;

const pct0to100 = (rate: number): string => {
  if (!Number.isFinite(rate)) {
    return "—";
  }
  return `${Math.round(Math.min(1, Math.max(0, rate)) * 1000) / 10}%`;
};

const ChartShell = ({
  title,
  description,
  showNotEnough,
  notEnoughText,
  showEmpty,
  emptyText,
  flexible,
  children,
}: {
  title: string;
  description: string;
  showNotEnough: boolean;
  notEnoughText: string;
  showEmpty: boolean;
  emptyText: string;
  /** When set, chart area grows with content (tables, long lists) instead of a fixed chart height. */
  flexible?: boolean;
  children: ReactNode;
}): JSX.Element => (
  <GlassPanel sx={{ p: 2.5, display: "grid", gap: 1.25, minWidth: 0 }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
      {title}
    </Typography>
    <Typography variant="body2" color="text.secondary">
      {description}
    </Typography>
    {showNotEnough ? (
      <Typography variant="body2" color="text.secondary">
        {notEnoughText}
      </Typography>
    ) : showEmpty ? (
      <Typography variant="body2" color="text.secondary">
        {emptyText}
      </Typography>
    ) : flexible ? (
      <Box sx={{ width: "100%", minWidth: 0 }}>{children}</Box>
    ) : (
      <Box sx={{ width: "100%", height: CHART_HEIGHT, minHeight: CHART_HEIGHT }}>{children}</Box>
    )}
  </GlassPanel>
);

type Props = {
  bundle: TravelAnalyticsBundle;
  /** Shown above the grid when a time/country filter is active (aggregate charts stay all-time). */
  filterNote?: string | null;
};

export const AnalyticsChartSections = ({ bundle, filterNote }: Props): JSX.Element => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { charts, summary } = bundle;
  const notEnough = t("analytics.charts.notEnoughTrips");

  const axisTick = { fill: theme.palette.text.secondary, fontSize: 11 };
  const axisStroke = theme.palette.divider;
  const tooltipPaper = {
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 1,
    color: theme.palette.text.primary,
  };

  const radarRows = useMemo(
    () =>
      charts.styleRadar.map((d) => ({
        ...d,
        axisLabel: t(`analytics.charts.styleAxis.${d.axisKey}`),
      })),
    [charts.styleRadar, t],
  );

  const geoMerged = useMemo(
    () =>
      charts.cumulativeCountries.map((c, i) => ({
        x: c.x,
        countries: typeof c.count === "number" && Number.isFinite(c.count) ? c.count : 0,
        cities: typeof charts.cumulativeCities[i]?.count === "number" && Number.isFinite(charts.cumulativeCities[i]?.count)
          ? (charts.cumulativeCities[i]?.count as number)
          : 0,
        tripTitle: c.tripTitle,
      })),
    [charts.cumulativeCountries, charts.cumulativeCities],
  );

  const bucketPie = useMemo(() => {
    const { visited, remaining } = charts.bucket;
    return [
      { name: t("analytics.charts.bucketVisited"), value: Math.max(0, visited) },
      { name: t("analytics.charts.bucketRemaining"), value: Math.max(0, remaining) },
    ].filter((r) => r.value > 0);
  }, [charts.bucket, t]);

  const pieColors = [theme.palette.success.main, theme.palette.action.disabled];

  const styleHasAnyDone = radarRows.some((r) => (r.done ?? 0) > 0);

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {filterNote ? (
        <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
          {filterNote}
        </Alert>
      ) : null}
      <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <ChartShell
          title={t("analytics.charts.completionOverTimeTitle")}
          description={t("analytics.charts.completionOverTimeDesc")}
          showNotEnough={!charts.thresholds.hasCompletionLine}
          notEnoughText={notEnough}
          showEmpty={charts.completionOverTime.length === 0}
          emptyText={t("analytics.charts.genericEmpty")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.completionOverTime} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={axisStroke} />
              <XAxis dataKey="x" tick={axisTick} stroke={axisStroke} interval="preserveStartEnd" />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                width={44}
                tick={axisTick}
                stroke={axisStroke}
              />
              <Tooltip
                contentStyle={tooltipPaper}
                formatter={(value: number) => [pct0to100(typeof value === "number" ? value : 0), t("analytics.charts.completionRate")]}
                labelFormatter={(_, items) => {
                  const row = items?.[0]?.payload as { tripTitle?: string } | undefined;
                  return row?.tripTitle ?? "";
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="completionRate" name={t("analytics.charts.completionRate")} stroke={theme.palette.primary.main} strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      </Grid>

      <Grid item xs={12} md={6}>
        <ChartShell
          title={t("analytics.charts.plannedVsCompletedTitle")}
          description={t("analytics.charts.plannedVsCompletedDesc")}
          showNotEnough={!charts.thresholds.hasPlannedVsCompleted}
          notEnoughText={notEnough}
          showEmpty={charts.plannedVsCompleted.length === 0}
          emptyText={t("analytics.charts.genericEmpty")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={charts.plannedVsCompleted}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              barCategoryGap={6}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={axisStroke} />
              <XAxis type="number" tick={axisTick} stroke={axisStroke} />
              <YAxis type="category" dataKey="tripTitle" width={100} tick={axisTick} stroke={axisStroke} interval={0} />
              <Tooltip contentStyle={tooltipPaper} />
              <Legend />
              <Bar dataKey="planned" name={t("analytics.charts.planned")} fill={theme.palette.info.main} />
              <Bar dataKey="completed" name={t("analytics.charts.completed")} fill={theme.palette.success.main} />
              <Bar dataKey="skipped" name={t("analytics.charts.skipped")} fill={theme.palette.warning.main} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
      </Grid>

      <Grid item xs={12} md={6}>
        <ChartShell
          title={t("analytics.charts.categoryStackTitle")}
          description={t("analytics.charts.categoryStackDesc")}
          showNotEnough={!charts.thresholds.hasCategoryStack}
          notEnoughText={notEnough}
          showEmpty={charts.categoryStack.length === 0}
          emptyText={t("analytics.charts.categoryEmpty")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.categoryStack} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={axisStroke} />
              <XAxis dataKey="name" tick={{ ...axisTick, fontSize: 10 }} angle={-28} textAnchor="end" height={56} interval={0} stroke={axisStroke} />
              <YAxis tick={axisTick} stroke={axisStroke} />
              <Tooltip contentStyle={tooltipPaper} />
              <Legend />
              <Bar dataKey="done" name={t("analytics.charts.done")} stackId="s" fill={theme.palette.success.main} />
              <Bar dataKey="skipped" name={t("analytics.charts.skipped")} stackId="s" fill={theme.palette.warning.main} />
              <Bar dataKey="pending" name={t("analytics.charts.pending")} stackId="s" fill={theme.palette.action.disabled} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
      </Grid>

      <Grid item xs={12} md={6}>
        <ChartShell
          title={t("analytics.charts.skipByCategoryTitle")}
          description={t("analytics.charts.skipByCategoryDesc")}
          showNotEnough={!charts.thresholds.hasSkipByCategory}
          notEnoughText={notEnough}
          showEmpty={charts.skipByCategory.length === 0}
          emptyText={t("analytics.charts.skipCategoryEmpty")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.skipByCategory} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={axisStroke} />
              <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tick={axisTick} stroke={axisStroke} />
              <YAxis type="category" dataKey="name" width={96} tick={axisTick} stroke={axisStroke} />
              <Tooltip
                contentStyle={tooltipPaper}
                formatter={(value: number, _n, item) => {
                  const payload = item?.payload as { skipped?: number; total?: number } | undefined;
                  const sk = payload?.skipped ?? 0;
                  const tot = payload?.total ?? 0;
                  return [`${pct0to100(typeof value === "number" ? value : 0)} (${sk}/${tot})`, t("analytics.charts.skipRate")];
                }}
              />
              <Bar dataKey="skipRate" name={t("analytics.charts.skipRate")} fill={theme.palette.error.light} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
      </Grid>

      <Grid item xs={12} md={6}>
        <ChartShell
          title={t("analytics.charts.delayOverTimeTitle")}
          description={t("analytics.charts.delayOverTimeDesc")}
          showNotEnough={!charts.thresholds.hasDelayLine}
          notEnoughText={notEnough}
          showEmpty={charts.delayOverTime.length === 0}
          emptyText={t("analytics.charts.genericEmpty")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.delayOverTime} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={axisStroke} />
              <XAxis dataKey="x" tick={axisTick} stroke={axisStroke} interval="preserveStartEnd" />
              <YAxis
                tick={axisTick}
                stroke={axisStroke}
                width={40}
                label={{ value: t("analytics.charts.minutes"), angle: -90, position: "insideLeft", fill: theme.palette.text.secondary }}
              />
              <Tooltip
                contentStyle={tooltipPaper}
                formatter={(value: number) => [`${typeof value === "number" && Number.isFinite(value) ? value : 0} ${t("analytics.charts.minShort")}`, t("analytics.charts.delay")]}
                labelFormatter={(_, items) => {
                  const row = items?.[0]?.payload as { tripTitle?: string } | undefined;
                  return row?.tripTitle ?? "";
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="delayMinutes" name={t("analytics.charts.delay")} stroke={theme.palette.secondary.main} strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      </Grid>

      <Grid item xs={12}>
        <GlassPanel sx={{ p: 2.5, display: "grid", gap: 1.25, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            {t("analytics.charts.geoTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("analytics.charts.geoDesc")}
          </Typography>
          <Stack direction="row" gap={2} flexWrap="wrap">
            <Typography variant="body2">{t("analytics.charts.geoCountriesStat", { count: summary.countriesVisited })}</Typography>
            <Typography variant="body2">{t("analytics.charts.geoCitiesStat", { count: summary.citiesVisited })}</Typography>
          </Stack>
          {!charts.thresholds.hasCumulativeGeo ? (
            <Typography variant="body2" color="text.secondary">
              {notEnough}
            </Typography>
          ) : geoMerged.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("analytics.charts.geoEmpty")}
            </Typography>
          ) : (
            <Box sx={{ width: "100%", height: CHART_HEIGHT, minHeight: CHART_HEIGHT }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={geoMerged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={axisStroke} />
                  <XAxis dataKey="x" tick={axisTick} stroke={axisStroke} interval="preserveStartEnd" />
                  <YAxis tick={axisTick} stroke={axisStroke} width={36} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipPaper}
                    labelFormatter={(_, items) => {
                      const row = items?.[0]?.payload as { tripTitle?: string } | undefined;
                      return row?.tripTitle ?? "";
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="countries" name={t("analytics.charts.countriesLine")} stroke={theme.palette.primary.main} dot={false} />
                  <Line type="monotone" dataKey="cities" name={t("analytics.charts.citiesLine")} stroke={theme.palette.info.main} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}
        </GlassPanel>
      </Grid>

      <Grid item xs={12} md={6}>
        <GlassPanel sx={{ p: 2.5, display: "grid", gap: 1.25, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            {t("analytics.charts.bucketTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("analytics.charts.bucketDesc")}
          </Typography>
          {!charts.thresholds.hasBucketChart ? (
            <Typography variant="body2" color="text.secondary">
              {t("analytics.charts.bucketNotEnough")}
            </Typography>
          ) : bucketPie.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("analytics.charts.bucketEmpty")}
            </Typography>
          ) : (
            <>
              <Typography variant="body2">
                {t("analytics.charts.bucketSummaryLine", {
                  total: charts.bucket.total,
                  visited: charts.bucket.visited,
                  remaining: charts.bucket.remaining,
                })}
              </Typography>
              <Box sx={{ width: "100%", height: CHART_HEIGHT, minHeight: CHART_HEIGHT }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={bucketPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={96} label>
                      {bucketPie.map((_, i) => (
                        <Cell key={String(i)} fill={pieColors[i % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipPaper} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <LinearProgress
                variant="determinate"
                value={charts.bucket.total > 0 ? (charts.bucket.visited / charts.bucket.total) * 100 : 0}
                sx={{ height: 10, borderRadius: 99 }}
                color="success"
              />
            </>
          )}
        </GlassPanel>
      </Grid>

      <Grid item xs={12}>
        <ChartShell
          title={t("analytics.charts.paceTitle")}
          description={t("analytics.charts.paceDesc")}
          showNotEnough={!charts.thresholds.hasPaceAccuracy}
          notEnoughText={notEnough}
          showEmpty={charts.paceAccuracy.length === 0}
          emptyText={t("analytics.charts.genericEmpty")}
          flexible
        >
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{t("analytics.charts.paceColTrip")}</TableCell>
                  <TableCell>{t("analytics.charts.paceColSelected")}</TableCell>
                  <TableCell>{t("analytics.charts.paceColActual")}</TableCell>
                  <TableCell align="right">{t("analytics.charts.paceColCompletion")}</TableCell>
                  <TableCell align="right">{t("analytics.charts.paceColDelay")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {charts.paceAccuracy.map((row) => (
                  <TableRow key={row.tripId}>
                    <TableCell sx={{ maxWidth: 200 }}>{row.tripTitle}</TableCell>
                    <TableCell>{t(`analytics.behavior.pace.${row.selected}`)}</TableCell>
                    <TableCell>{t(`analytics.behavior.pace.${row.actual}`)}</TableCell>
                    <TableCell align="right">{pct0to100(row.completionRate)}</TableCell>
                    <TableCell align="right">
                      {Number.isFinite(row.delayMinutes) ? `${row.delayMinutes} ${t("analytics.charts.minShort")}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </ChartShell>
      </Grid>

      <Grid item xs={12}>
        <ChartShell
          title={t("analytics.charts.styleTitle")}
          description={t("analytics.charts.styleDesc")}
          showNotEnough={false}
          notEnoughText=""
          showEmpty={!styleHasAnyDone}
          emptyText={t("analytics.charts.styleEmpty")}
        >
          <ResponsiveContainer width="100%" height="100%">
            {charts.thresholds.hasStyleRadar ? (
              <RadarChart data={radarRows} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke={theme.palette.divider} />
                <PolarAngleAxis dataKey="axisLabel" tick={{ ...axisTick, fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, radarRows[0]?.fullMark ?? 1]} tick={{ ...axisTick, fontSize: 10 }} />
                <Radar name={t("analytics.charts.styleDoneLabel")} dataKey="done" stroke={theme.palette.primary.main} fill={theme.palette.primary.main} fillOpacity={0.35} />
                <Legend />
                <Tooltip contentStyle={tooltipPaper} />
              </RadarChart>
            ) : (
              <BarChart layout="vertical" data={radarRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={axisStroke} />
                <XAxis type="number" tick={axisTick} stroke={axisStroke} />
                <YAxis type="category" dataKey="axisLabel" width={88} tick={axisTick} stroke={axisStroke} />
                <Tooltip contentStyle={tooltipPaper} />
                <Bar dataKey="done" name={t("analytics.charts.styleDoneLabel")} fill={theme.palette.primary.light} radius={[0, 4, 4, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </ChartShell>
      </Grid>

      <Grid item xs={12}>
        <ChartShell
          title={t("analytics.charts.achievementsTitle")}
          description={t("analytics.charts.achievementsDesc")}
          showNotEnough={!charts.thresholds.hasAchievementBars}
          notEnoughText={t("analytics.charts.achievementsAllUnlocked")}
          showEmpty={charts.achievements.length === 0}
          emptyText={t("analytics.charts.achievementsEmpty")}
          flexible
        >
          <Stack spacing={1.25} sx={{ maxHeight: 420, overflowY: "auto", pr: 0.5 }}>
            {charts.achievements.map((a) => {
              const pct = a.target > 0 ? Math.min(100, (a.progress / a.target) * 100) : 0;
              return (
                <Box key={a.key} sx={{ display: "grid", gap: 0.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                    <Typography variant="body2" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {a.progress} / {a.target}
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 99 }} />
                </Box>
              );
            })}
          </Stack>
        </ChartShell>
      </Grid>
    </Grid>
    </Box>
  );
};
