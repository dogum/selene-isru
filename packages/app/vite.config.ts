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
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three-runtime";
          if (id.includes("node_modules/d3-")) return "analysis-charts";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react-runtime";
          if (id.includes("node_modules/zustand")) return "state-runtime";
          return undefined;
        }
      }
    }
  },
  test: {
    environment: "jsdom"
  }
}));
