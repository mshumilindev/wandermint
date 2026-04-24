import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import { Box, LinearProgress, Typography } from "@mui/material";
import { GlassPanel } from "./GlassPanel";

export interface AiProgressStage {
  key: string;
  label: string;
}

interface AiProgressPanelProps {
  title: string;
  subtitle?: string;
  progress: number;
  activeKey: string | null;
  stages: AiProgressStage[];
  trailingLabel?: string;
}

const clampProgress = (value: number): number =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

export const AiProgressPanel = ({
  title,
  subtitle,
  progress,
  activeKey,
  stages,
  trailingLabel,
}: AiProgressPanelProps): JSX.Element => (
  <GlassPanel
    elevated
    sx={{
      p: 2.25,
      display: "grid",
      gap: 1.5,
      background:
        "linear-gradient(135deg, rgba(8, 23, 35, 0.82), rgba(10, 19, 27, 0.72)), radial-gradient(circle at top right, rgba(79, 219, 202, 0.12), transparent 36%), radial-gradient(circle at bottom left, rgba(245, 162, 72, 0.12), transparent 32%)",
      overflow: "hidden",
      position: "relative",
      "&::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.05) 20%, transparent 44%)",
        animation: "wmAiPanelSweep 5.6s linear infinite",
        pointerEvents: "none",
      },
      "@keyframes wmAiPanelSweep": {
        "0%": { transform: "translateX(-100%)" },
        "100%": { transform: "translateX(140%)" },
      },
    }}
  >
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "start" }}>
      <Box sx={{ display: "grid", gap: 0.35 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeOutlinedIcon sx={{ color: "primary.main", fontSize: 18 }} />
          <Typography variant="subtitle1">{title}</Typography>
        </Box>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {trailingLabel ? (
        <Typography variant="caption" color="primary.main" sx={{ whiteSpace: "nowrap" }}>
          {trailingLabel}
        </Typography>
      ) : null}
    </Box>

    <Box sx={{ display: "grid", gap: 0.8 }}>
      <LinearProgress
        variant="determinate"
        value={clampProgress(progress)}
        sx={{
          height: 8,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.08)",
          "& .MuiLinearProgress-bar": {
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(79,219,202,0.92), rgba(245,162,72,0.92))",
          },
        }}
      />
      <Box
        sx={{
          display: "grid",
          gap: 0.8,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        {stages.map((stage, index) => {
          const activeIndex = stages.findIndex((item) => item.key === activeKey);
          const isDone = activeIndex > index;
          const isActive = activeKey === stage.key;
          return (
            <Box
              key={stage.key}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.15,
                py: 0.9,
                borderRadius: 2,
                border: "1px solid rgba(183, 237, 226, 0.12)",
                background: isActive
                  ? "rgba(79, 219, 202, 0.1)"
                  : isDone
                    ? "rgba(245, 162, 72, 0.08)"
                    : "rgba(255,255,255,0.03)",
                transition: "background 180ms ease, border-color 180ms ease",
              }}
            >
              {isDone ? (
                <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "secondary.main" }} />
              ) : (
                <RadioButtonUncheckedRoundedIcon
                  sx={{ fontSize: 18, color: isActive ? "primary.main" : "text.secondary" }}
                />
              )}
              <Typography
                variant="body2"
                sx={{
                  color: isActive || isDone ? "text.primary" : "text.secondary",
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {stage.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  </GlassPanel>
);
