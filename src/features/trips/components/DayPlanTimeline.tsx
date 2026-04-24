import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import type { DayPlan } from "../../../entities/day-plan/model";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { getCountryFlagEmoji } from "../../../shared/ui/CountryFlag";
import { ActivityBlockCard } from "./ActivityBlockCard";
import { MovementLegRow } from "./MovementLegRow";

interface DayPlanTimelineProps {
  dayPlans: DayPlan[];
  openLabel?: string;
  doneLabel: string;
  skippedLabel: string;
}

export const DayPlanTimeline = ({ dayPlans, openLabel, doneLabel, skippedLabel }: DayPlanTimelineProps): JSX.Element => {
  const navigate = useNavigate();
  const groupedPlans = dayPlans.reduce<Array<{ segmentId: string; cityLabel: string; countryLabel?: string; days: DayPlan[] }>>((groups, dayPlan) => {
    const currentGroup = groups.at(-1);
    if (currentGroup && currentGroup.segmentId === dayPlan.segmentId) {
      currentGroup.days.push(dayPlan);
      return groups;
    }

    return [
      ...groups,
      {
        segmentId: dayPlan.segmentId,
        cityLabel: dayPlan.cityLabel,
        countryLabel: dayPlan.countryLabel,
        days: [dayPlan],
      },
    ];
  }, []);

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {groupedPlans.map((group) => (
        <Box key={group.segmentId} sx={{ display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", px: 0.25 }}>
            <Typography variant="overline" color="primary.main">
              {group.cityLabel}
            </Typography>
            {group.countryLabel ? <MetadataPill label={`${getCountryFlagEmoji(group.countryLabel) ?? ""} ${group.countryLabel}`.trim()} tone="teal" /> : null}
            <MetadataPill label={`${group.days.length} ${group.days.length === 1 ? "day" : "days"}`} />
          </Box>
          {group.days.map((dayPlan) => (
            <GlassPanel key={dayPlan.id} sx={{ p: 2.5, display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    {dayPlan.date} · {dayPlan.cityLabel}
                  </Typography>
                  <Typography variant="h6">{dayPlan.theme}</Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <StatusBadge status={dayPlan.completionStatus} />
                  <MetadataPill label={dayPlan.validationStatus} tone={dayPlan.validationStatus === "fresh" ? "teal" : "amber"} />
                  {openLabel ? (
                    <Button variant="outlined" onClick={() => void navigate({ to: "/trips/$tripId/day/$dayId", params: { tripId: dayPlan.tripId, dayId: dayPlan.id } })}>
                      {openLabel}
                    </Button>
                  ) : null}
                </Box>
              </Box>
              <Box sx={{ display: "grid", gap: 1.5 }}>
                {dayPlan.blocks.slice(0, openLabel ? 2 : dayPlan.blocks.length).map((block, index, visibleBlocks) => (
                  <Box key={block.id} sx={{ display: "grid", gap: 1.25 }}>
                    <ActivityBlockCard block={block} doneLabel={doneLabel} skippedLabel={skippedLabel} />
                    {index < visibleBlocks.length - 1
                      ? (() => {
                          const nextBlock = visibleBlocks[index + 1];
                          const leg = dayPlan.movementLegs?.find((item) => item.fromBlockId === block.id && item.toBlockId === nextBlock?.id);
                          return leg ? <MovementLegRow leg={leg} /> : null;
                        })()
                      : null}
                  </Box>
                ))}
              </Box>
            </GlassPanel>
          ))}
        </Box>
      ))}
    </Box>
  );
};
