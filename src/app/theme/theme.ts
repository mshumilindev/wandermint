import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#21dcc3",
      contrastText: "#030f17",
    },
    secondary: {
      main: "#ffb740",
      contrastText: "#f3efe7",
    },
    background: {
      default: "#080b0e",
      paper: "rgba(17, 26, 34, 0.72)",
    },
    text: {
      primary: "#f3efe7",
      secondary: "#a9b2b8",
    },
    success: {
      main: "#70b887",
    },
    warning: {
      main: "#d9a24a",
    },
    error: {
      main: "#d66f6a",
    },
  },
  typography: {
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    h1: { fontWeight: 700, letterSpacing: 0 },
    h2: { fontWeight: 700, letterSpacing: 0 },
    h3: { fontWeight: 700, letterSpacing: 0 },
    h4: { fontWeight: 700, letterSpacing: 0 },
    h5: { fontWeight: 700, letterSpacing: 0 },
    h6: { fontWeight: 700, letterSpacing: 0 },
    button: { fontWeight: 700, letterSpacing: 0, textTransform: "none" },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: "100vh",
          colorScheme: "dark",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: "8px",
          minHeight: 42,
          boxShadow: "none",
          transition: "border-color 180ms ease, box-shadow 180ms ease, background 180ms ease, transform 180ms ease",
        },
        containedPrimary: {
          background: "linear-gradient(135deg, #21dcc3, #0a8686)",
          color: "#030f17",
          "&:hover": {
            boxShadow: "0 12px 28px rgba(33, 220, 195, 0.22)",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid var(--wm-glass-border)",
          backdropFilter: "var(--wm-blur-panel)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background:
            "radial-gradient(circle at 12% 0%, rgba(33, 220, 195, 0.10), transparent 30%), linear-gradient(180deg, rgba(4, 12, 18, 0.9), rgba(3, 8, 13, 0.78))",
          backdropFilter: "var(--wm-blur-header)",
          borderColor: "var(--wm-glass-border)",
          boxShadow: "var(--wm-shadow-panel)",
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          background: "var(--wm-dropdown-surface)",
          backgroundImage: "none",
          border: "1px solid var(--wm-dropdown-border)",
          boxShadow: "var(--wm-dropdown-shadow)",
          backdropFilter: "blur(18px) saturate(138%)",
          color: "var(--wm-color-text-primary)",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          marginTop: 8,
          borderRadius: 10,
          background: "var(--wm-dropdown-surface)",
          backgroundImage: "none",
          border: "1px solid var(--wm-dropdown-border)",
          boxShadow: "var(--wm-dropdown-shadow)",
          backdropFilter: "blur(18px) saturate(138%)",
        },
        list: {
          padding: 6,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 38,
          borderRadius: 8,
          color: "var(--wm-color-text-primary)",
          "&:hover": {
            background: "var(--wm-dropdown-surface-hover)",
          },
          "&.Mui-focusVisible": {
            background: "rgba(33, 220, 195, 0.16)",
          },
          "&.Mui-selected": {
            background: "var(--wm-dropdown-surface-selected)",
            color: "var(--wm-color-text-primary)",
          },
          "&.Mui-selected:hover": {
            background: "linear-gradient(135deg, rgba(33, 220, 195, 0.25), rgba(217, 162, 74, 0.13))",
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: "var(--wm-color-text-secondary)",
        },
        select: {
          "&:focus": {
            backgroundColor: "transparent",
          },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          marginTop: 8,
          borderRadius: 10,
          background: "var(--wm-dropdown-surface)",
          backgroundImage: "none",
          border: "1px solid var(--wm-dropdown-border)",
          boxShadow: "var(--wm-dropdown-shadow)",
          backdropFilter: "blur(18px) saturate(138%)",
          color: "var(--wm-color-text-primary)",
        },
        listbox: {
          padding: 6,
          "& .MuiAutocomplete-option": {
            minHeight: 38,
            borderRadius: 8,
            color: "var(--wm-color-text-primary)",
          },
          "& .MuiAutocomplete-option.Mui-focused": {
            backgroundColor: "rgba(33, 220, 195, 0.14)",
          },
          "& .MuiAutocomplete-option[aria-selected='true']": {
            background: "var(--wm-dropdown-surface-selected)",
          },
          "& .MuiAutocomplete-option[aria-selected='true'].Mui-focused": {
            background: "linear-gradient(135deg, rgba(33, 220, 195, 0.25), rgba(217, 162, 74, 0.13))",
          },
        },
        noOptions: {
          color: "var(--wm-color-text-secondary)",
        },
        loading: {
          color: "var(--wm-color-text-secondary)",
        },
        popupIndicator: {
          color: "var(--wm-color-text-secondary)",
        },
        clearIndicator: {
          color: "var(--wm-color-text-secondary)",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          background:
            "radial-gradient(circle at 15% 0%, rgba(33, 220, 195, 0.055), transparent 34%), linear-gradient(145deg, rgba(8, 15, 22, 0.74), rgba(5, 9, 14, 0.58))",
          backdropFilter: "var(--wm-blur-panel)",
          borderRadius: "10px",
          transition: "box-shadow 180ms ease, border-color 180ms ease",
          "& input[type='date']::-webkit-calendar-picker-indicator, & input[type='month']::-webkit-calendar-picker-indicator, & input[type='time']::-webkit-calendar-picker-indicator, & input[type='datetime-local']::-webkit-calendar-picker-indicator":
            {
              cursor: "pointer",
              opacity: 0.92,
              filter:
                "invert(82%) sepia(19%) saturate(1046%) hue-rotate(119deg) brightness(96%) contrast(92%)",
            },
          "& fieldset": {
            borderColor: "rgba(183, 237, 226, 0.16)",
          },
          "&:hover fieldset": {
            borderColor: "rgba(33, 220, 195, 0.34)",
          },
          "&.Mui-focused": {
            boxShadow: "0 0 0 3px rgba(33, 220, 195, 0.1), 0 0 26px rgba(33, 220, 195, 0.08)",
          },
          "&.Mui-focused fieldset": {
            borderColor: "#21dcc3",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: "8px",
        },
      },
    },
  },
});
