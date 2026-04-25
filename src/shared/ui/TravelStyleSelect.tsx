import { Box, MenuItem, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TravelStyle } from "../../theme/travelStyleConfig";
import { getTravelStylePresentation, TRAVEL_STYLE_ORDER, travelStyleConfig } from "../../theme/travelStyleConfig";

interface TravelStyleSelectProps {
  label: string;
  value: TravelStyle;
  onChange: (next: TravelStyle) => void;
  disabled?: boolean;
  fullWidth?: boolean;
}

export const TravelStyleSelect = ({
  label,
  value,
  onChange,
  disabled,
  fullWidth = true,
}: TravelStyleSelectProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <TextField
      select
      fullWidth={fullWidth}
      label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as TravelStyle)}
      SelectProps={{
        MenuProps: {
          PaperProps: {
            sx: {
              mt: 1,
              p: 1,
              background: "var(--wm-dropdown-surface)",
              border: "1px solid var(--wm-dropdown-border)",
              boxShadow: "var(--wm-dropdown-shadow)",
              backdropFilter: "var(--wm-blur-panel)",
            },
          },
        },
        renderValue: (selectedValue) => {
          const presentation = getTravelStylePresentation(String(selectedValue));
          const Icon = presentation.Icon;
          return (
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                px: "12px",
                py: "6px",
                borderRadius: "999px",
                background: presentation.gradientPill,
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(10px)",
                boxShadow: presentation.glow,
                maxWidth: "100%",
              }}
            >
              <Icon sx={{ fontSize: 18, color: presentation.iconColor, flexShrink: 0 }} />
              <Typography component="span" sx={{ color: presentation.color, fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.2 }}>
                {t(presentation.labelKey)}
              </Typography>
            </Box>
          );
        },
      }}
    >
      {TRAVEL_STYLE_ORDER.map((style) => {
        const presentation = travelStyleConfig[style];
        const Icon = presentation.Icon;
        const isSelected = value === style;
        return (
          <MenuItem
            key={style}
            value={style}
            selected={isSelected}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              borderRadius: 2,
              mb: 0.5,
              py: 1.1,
              px: 1.25,
              background: isSelected ? presentation.gradientMenuSelected : "transparent",
              border: isSelected ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent",
              boxShadow: isSelected ? presentation.glowSelected : "none",
              transition: "background 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
              "&:hover": {
                background: presentation.gradientMenuHover,
                boxShadow: presentation.glow,
              },
              "&.Mui-selected": {
                background: presentation.gradientMenuSelected,
                border: "1px solid rgba(255,255,255,0.16)",
                boxShadow: presentation.glowSelected,
              },
              "&.Mui-selected:hover": {
                background: presentation.gradientMenuSelected,
              },
            }}
          >
            <Icon sx={{ fontSize: 18, color: presentation.iconColor, flexShrink: 0 }} />
            <Box
              component="span"
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background: presentation.color,
                boxShadow: presentation.glow,
              }}
            />
            <Typography sx={{ flex: 1, color: "var(--wm-travel-style-text)", fontWeight: isSelected ? 700 : 500 }}>
              {t(presentation.labelKey)}
            </Typography>
          </MenuItem>
        );
      })}
    </TextField>
  );
};
