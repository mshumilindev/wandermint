import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface WizardSectionHeaderProps {
  index: number;
  title: string;
  subtitle?: string;
}

export const WizardSectionHeader = ({ index, title, subtitle }: WizardSectionHeaderProps): JSX.Element => (
  <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", mb: 2.5 }}>
    <Box
      sx={{
        width: 40,
        minWidth: 40,
        height: 40,
        borderRadius: 2,
        bgcolor: "primary.main",
        color: "primary.contrastText",
        display: "grid",
        placeItems: "center",
        fontWeight: 700,
        fontSize: "1rem",
        boxShadow: "0 8px 24px rgba(0, 180, 216, 0.25)",
      }}
    >
      {index}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: "break-word" }}>
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  </Box>
);
