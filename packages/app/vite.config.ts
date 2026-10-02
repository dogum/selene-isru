import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function packageVersion(relativePath: string): string {
  return (JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as { version: string }).version;
}

/** Commit that produced this build; "-dirty" marks uncommitted local changes. */
function buildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git describe --always --dirty --abbrev=7", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

// Stamped into every export so a file can be traced to the code that made it.
const BUILD_INFO = {
  app: packageVersion("./package.json"),
  engine: packageVersion("../engine/package.json"),
  commit: buildCommit()
};

// GitHub Pages serves the app from /<repo-name>/. The deploy workflow sets
// PAGES_BASE from the repository name; local production builds fall back to
// the canonical project slug.
export default defineConfig(({ mode }) => ({
  base: process.env.PAGES_BASE ?? (mode === "production" ? "/selene-isru/" : "/"),
  plugins: [react()],
  define: {
    __SELENE_BUILD__: JSON.stringify(BUILD_INFO)
  },
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
