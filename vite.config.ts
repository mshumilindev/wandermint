import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          mui: ["@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"],
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          tanstack: ["@tanstack/react-router", "@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
