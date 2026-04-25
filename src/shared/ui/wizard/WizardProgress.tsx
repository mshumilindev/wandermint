import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

type WizardProgressProps = {
  value: number;
  label?: string;
};

export const WizardProgress = ({ value, label }: WizardProgressProps): JSX.Element => (
  <Box sx={{ display: "grid", gap: 0.75 }}>
    {label ? (
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    ) : null}
    <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, value))} sx={{ height: 8, borderRadius: 99 }} />
  </Box>
);
