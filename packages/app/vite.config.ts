import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// GitHub Pages serves the app from /<repo-name>/. The deploy workflow sets
// PAGES_BASE from the repository name; local production builds fall back to
// the canonical project slug.
export default defineConfig(({ mode }) => ({
  base: process.env.PAGES_BASE ?? (mode === "production" ? "/selene-isru/" : "/"),
  plugins: [react()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 800
  },
  test: {
    environment: "jsdom"
  }
}));
