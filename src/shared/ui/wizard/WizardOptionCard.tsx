import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

type WizardOptionCardProps = {
  selected?: boolean;
  title: string;
  description?: string;
  icon?: ReactNode;
  onClick?: () => void;
};

export const WizardOptionCard = ({ selected, title, description, icon, onClick }: WizardOptionCardProps): JSX.Element => (
  <Box
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={(e) => {
      if (!onClick) {
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    }}
    sx={{
      p: 2,
      borderRadius: 2,
      cursor: onClick ? "pointer" : "default",
      border: "1px solid",
      borderColor: selected ? "primary.main" : "rgba(255,255,255,0.08)",
      background: selected ? "rgba(0, 180, 216, 0.12)" : "rgba(3, 15, 23, 0.35)",
      display: "grid",
      gridTemplateColumns: icon ? "auto 1fr" : "1fr",
      gap: 1.5,
      alignItems: "start",
      transition: "border-color 0.2s, background 0.2s",
      "&:hover": onClick ? { borderColor: "primary.light" } : undefined,
    }}
  >
    {icon}
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.5, wordBreak: "break-word" }}>
          {description}
        </Typography>
      ) : null}
    </Box>
  </Box>
);
