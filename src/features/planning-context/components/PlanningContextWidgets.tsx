import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import { Alert, Box, Chip, Skeleton, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { buildPlanningContextWidgets } from "../planningContextBuilder";
import type { BaseLocation, PlanningContextWidgetModel } from "../planningContext.types";

interface PlanningContextWidgetsProps {
  flow: "right_now" | "create_plan";
  locations: BaseLocation[];
  startDate?: string;
  endDate?: string;
  budgetAmount?: number;
}

const fmtHour = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const PlanningContextWidgets = ({ flow, locations, startDate, endDate, budgetAmount }: PlanningContextWidgetsProps): JSX.Element | null => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PlanningContextWidgetModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locationKey = useMemo(() => locations.map((l) => `${l.id}|${l.label}|${l.coordinates?.lat ?? ""}|${l.coordinates?.lng ?? ""}`).join("||"), [locations]);

  useEffect(() => {
    if (locations.length === 0) {
      setData(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void buildPlanningContextWidgets({ flow, locations, startDate, endDate, budgetAmount })
      .then((ctx) => {
        if (active) {
          setData(ctx);
        }
      })
      .catch(() => {
        if (active) {
          setError("Context widgets are temporarily unavailable.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [flow, locationKey, startDate, endDate, budgetAmount, locations]);

  if (locations.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: "grid", gap: 1.25 }}>
      {error ? <Alert severity="info">{error}</Alert> : null}
      {loading ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={72} />
        </Box>
      ) : null}
      {data ? (
        <>
          <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
            <Chip size="small" label={`Window: ${data.timeWindow.totalDays} day${data.timeWindow.totalDays === 1 ? "" : "s"}`} />
            <Chip size="small" label={`Mobility: ${data.mobility.mode}`} />
            <Chip size="small" label={`Budget: ${data.budget}`} />
            <Chip size="small" icon={<WbSunnyOutlinedIcon fontSize="small" />} label={data.openNowHints.suggestedCategories.slice(0, 3).join(" · ")} />
          </Box>
          {flow === "right_now" ? (
            <Box sx={{ display: "grid", gap: 1 }}>
              {data.locations.map((row) => (
                <Box key={row.location.id} sx={{ border: "1px solid rgba(183, 237, 226, 0.14)", borderRadius: 2, p: 1.2, background: "rgba(4, 14, 20, 0.36)" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {row.location.label ?? [row.location.city, row.location.country].filter(Boolean).join(", ")}
                  </Typography>
                  {row.weather?.current ? (
                    <Typography variant="body2" color="text.secondary">
                      Now: {Math.round(row.weather.current.temperature)}°C · {row.weather.current.condition}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Weather unavailable for this location
                    </Typography>
                  )}
                  {row.weather?.hourly?.length ? (
                    <Box sx={{ display: "flex", gap: 0.6, overflowX: "auto", mt: 0.8 }}>
                      {row.weather.hourly.map((h) => (
                        <Chip key={h.time} size="small" label={`${fmtHour(h.time)} · ${Math.round(h.temperature)}°`} />
                      ))}
                    </Box>
                  ) : null}
                  {row.daylight ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.7 }}>
                      Sunrise {fmtHour(row.daylight.sunrise.toISOString())} · Sunset {fmtHour(row.daylight.sunset.toISOString())}
                    </Typography>
                  ) : null}
                </Box>
              ))}
            </Box>
          ) : (
            <Box sx={{ display: "grid", gap: 1.1 }}>
              {data.locations.map((row) => (
                <Box key={row.location.id} sx={{ border: "1px solid rgba(183, 237, 226, 0.14)", borderRadius: 2, p: 1.2, background: "rgba(4, 14, 20, 0.36)" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.8 }}>
                    {row.location.label ?? [row.location.city, row.location.country].filter(Boolean).join(", ")}
                  </Typography>
                  {row.weather?.daily?.length ? (
                    <Box sx={{ display: "flex", gap: 0.8, overflowX: "auto" }}>
                      {row.weather.daily.slice(0, 7).map((day) => (
                        <Box
                          key={`${row.location.id}-${day.date}`}
                          sx={{
                            minWidth: 136,
                            borderRadius: 1.6,
                            border: "1px solid rgba(183, 237, 226, 0.12)",
                            background: "rgba(6, 18, 26, 0.5)",
                            p: 0.9,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {day.date}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {Math.round(day.max)}° / {Math.round(day.min)}°
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {day.condition}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Weather unavailable for this location
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </>
      ) : null}
    </Box>
  );
};
