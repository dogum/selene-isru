import { DEFAULTS, normalizeParams, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { briefGrid, optimize, GOALS } from "../src/analysis/brief";
import { boundedRange, clampToBounds, paramBounds } from "../src/analysis/bounds";
import { COMPARE_METRICS, deltaTone } from "../src/analysis/compare";
import { oneAtATimeSensitivity } from "../src/analysis/sensitivity";
import { FRONTIER_PARAMS, sweepValues } from "../src/analysis/sweep";

const SITES: SimParams["site"][] = ["equatorial", "polar"];

function expectInBounds(key: keyof SimParams, values: number[]): void {
  const bounds = paramBounds(key);
  expect(bounds, `${String(key)} should be a bounded numeric input`).not.toBeNull();
  for (const value of values) {
    expect(value, `${String(key)}=${value}`).toBeGreaterThanOrEqual(bounds!.min);
    expect(value, `${String(key)}=${value}`).toBeLessThanOrEqual(bounds!.max);
  }
}

function clampWarnings(params: Partial<SimParams>): string[] {
  return normalizeParams(params).warnings
    .filter((warning) => warning.id === "param-clamped")
    .map((warning) => warning.message);
}

describe("analysis grids stay inside the engine bounds", () => {
  it("reads bounds from PARAM_META and clamps to them", () => {
    expect(paramBounds("reserveDays")).toEqual({ min: 5, max: 120 });
    expect(paramBounds("site")).toBeNull();
    expect(clampToBounds("etaCurrent", 1.008)).toBe(0.99);
    expect(boundedRange("shieldDesignM", 0.1, 5)).toEqual({ min: 0.5, max: 5 });
  });

  it("declares every frontier axis inside the engine range", () => {
    for (const param of FRONTIER_PARAMS) {
      expectInBounds(param.key, [param.min, param.max]);
    }
  });

  it("never generates a frontier value the engine would clamp", () => {
    for (const param of FRONTIER_PARAMS) {
      for (const n of [1, 25, 49]) {
        const values = sweepValues(param, n);
        expectInBounds(param.key, values);
        expect(clampWarnings({ [param.key]: values[values.length - 1] })).toEqual([]);
      }
    }
  });

  it("keeps every brief search level inside the engine range", () => {
    for (const site of SITES) {
      const grid = briefGrid(site);
      expectInBounds("reserveDays", grid.reserves);
      expectInBounds("etaCell", grid.pvEfficiencies);
      expectInBounds("alphaSpecific", grid.nuclearSpecificMass);
      expectInBounds(site === "equatorial" ? "Vcell" : "chiIce", grid.processA);
      expectInBounds(site === "equatorial" ? "etaCurrent" : "cpRegCold", grid.processB);
    }
  });

  it("applies brief candidates exactly as they were simulated and labelled", () => {
    for (const goal of GOALS) {
      const { candidates } = optimize(DEFAULTS, goal.constraints);
      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(clampWarnings(candidate.params)).toEqual([]);
        expect(normalizeParams(candidate.params).params.reserveDays).toBe(candidate.params.reserveDays);
      }
    }
  });
});

describe("one-at-a-time sensitivity", () => {
  const sec = (result: ReturnType<typeof simulate>): number => result.energy.secTotal_kWhPerKg;

  it("caps a step that would leave the engine range and says so", () => {
    // Default etaCurrent is 0.9; +12% would request 1.008 against a 0.99 maximum.
    const [row] = oneAtATimeSensitivity(DEFAULTS, [{ key: "etaCurrent", rel: 0.12 }], sec);
    expect(row!.highInput).toBe(0.99);
    expect(row!.lowInput).toBeCloseTo(0.792, 12);
    expect(row!.capped).toBe(true);
    const capped = simulate({ ...DEFAULTS, etaCurrent: 0.99 });
    const base = simulate(DEFAULTS);
    expect(row!.high).toBeCloseTo(((sec(capped) - sec(base)) / sec(base)) * 100, 9);
  });

  it("leaves in-range steps uncapped and ranks by swing", () => {
    const rows = oneAtATimeSensitivity(
      DEFAULTS,
      [
        { key: "Nmli", rel: 0.15 },
        { key: "Vcell", rel: 0.08 }
      ],
      sec
    );
    expect(rows.map((row) => row.capped)).toEqual([false, false]);
    expect(rows[0]!.swing).toBeGreaterThanOrEqual(rows[1]!.swing);
    expect(rows[0]!.key).toBe("Vcell");
  });
});

describe("A/B compare delta tone", () => {
  it("colours each metric by the direction that improves the design", () => {
    const better = Object.fromEntries(COMPARE_METRICS.map((metric) => [metric.label, metric.better]));
    expect(better).toEqual({
      "SEC TOTAL": "lower",
      "GRID POWER": "lower",
      MISSIONS: "lower",
      "PLANT-MASS EQUIV.": "lower",
      "LEVERAGE L": "higher",
      OUTPUT: "neutral"
    });
    expect(deltaTone(-1, "lower")).toBe("good");
    expect(deltaTone(1, "lower")).toBe("warn");
    // Before the fix a leverage drop rendered as an improvement.
    expect(deltaTone(-1, "higher")).toBe("warn");
    expect(deltaTone(1, "higher")).toBe("good");
    expect(deltaTone(0, "lower")).toBe("neutral");
    expect(deltaTone(-5, "neutral")).toBe("neutral");
  });
});
