import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULTS, sampleUncertainty, simulateTimeseries } from "../src/index";
import type { SimParams, TimeseriesOptions, UncertaintySpec } from "../src/types";

interface TimeseriesVector {
  name: string;
  params: Partial<SimParams>;
  opts: Partial<TimeseriesOptions>;
  result: unknown;
}

interface UncertaintyVector {
  name: string;
  base: Partial<SimParams>;
  spec: UncertaintySpec[];
  opts: { n: number; seed: number };
  result: unknown;
}

interface DynamicsFile {
  schemaVersion: number;
  seed: number;
  timeseries: TimeseriesVector[];
  uncertainty: UncertaintyVector[];
}

const dynamics = JSON.parse(
  readFileSync(new URL("./dynamics_vectors.json", import.meta.url), "utf8")
) as DynamicsFile;

function expectRel(actual: number, expected: number, relTol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relTol);
}

describe("phase 2 dynamics parity", () => {
  test("fixture shape is deterministic", () => {
    expect(dynamics.schemaVersion).toBe(1);
    expect(dynamics.seed).toBe(42);
    expect(dynamics.timeseries).toHaveLength(3);
    expect(dynamics.uncertainty).toHaveLength(2);
  });

  test.each(dynamics.timeseries)("$name timeseries", (vector) => {
    compareLeaves(simulateTimeseries(vector.params, vector.opts), vector.result, vector.name);
  });

  test.each(dynamics.uncertainty)("$name uncertainty", (vector) => {
    compareLeaves(sampleUncertainty(vector.base, vector.spec, vector.opts), vector.result, vector.name);
  });
});

describe("phase 2 dynamics regression anchors", () => {
  test("solar-selected cycle respects one lunar night of storage", () => {
    const solarParams: Partial<SimParams> = {
      targetKgPerDay: 10,
      MshieldKg: 8000,
      Rarray: 5,
      SEstorage: 1500,
      alphaSpecific: 90
    };
    const result = simulateTimeseries(solarParams, { cycles: 1, samplesPerCycle: 12 });
    expect(result.points).toHaveLength(13);
    expectRel(result.summary.minSoC, 1 - DEFAULTS.DoD, 1e-12);
    expectRel(result.summary.dutyCycle, 1, 1e-12);
    expectRel(result.summary.curtailedFraction, 0, 1e-12);
    expect(result.summary.tankPeakKg).toBeGreaterThan(0);
  });

  test("fixed-seed uncertainty output remains deterministic", () => {
    const result = sampleUncertainty(
      {},
      [
        { key: "targetKgPerDay", rel: 0.08 },
        { key: "eMining", rel: 0.15 }
      ],
      { n: 32, seed: 42 }
    );
    expect(result.plantMassThroughputDays.p10).toBeLessThanOrEqual(result.plantMassThroughputDays.p50);
    expect(result.plantMassThroughputDays.p50).toBeLessThanOrEqual(result.plantMassThroughputDays.p90);
    expect(result.secTotal.p10).toBeLessThanOrEqual(result.secTotal.p50);
    expect(result.secTotal.p50).toBeLessThanOrEqual(result.secTotal.p90);
    expectRel(result.plantMassThroughputDays.p50, 58.93253207974891, 1e-12);
    expectRel(result.secTotal.p50, 24.777402251765626, 1e-12);
  });
});

function compareLeaves(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === "number") {
    expect(typeof actual, path).toBe("number");
    const actualNumber = actual as number;
    const absTol = 1e-12;
    const relTol = 1e-9;
    const tolerance = Math.max(absTol, Math.abs(expected) * relTol);
    expect(Math.abs(actualNumber - expected), path).toBeLessThanOrEqual(tolerance);
    return;
  }

  if (expected === null || typeof expected === "string" || typeof expected === "boolean") {
    expect(actual, path).toBe(expected);
    return;
  }

  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    const actualArray = actual as unknown[];
    expect(actualArray.length, path).toBe(expected.length);
    for (let i = 0; i < expected.length; i += 1) {
      compareLeaves(actualArray[i], expected[i], `${path}[${i}]`);
    }
    return;
  }

  expect(typeof actual, path).toBe("object");
  expect(actual, path).not.toBeNull();
  const expectedRecord = expected as Record<string, unknown>;
  const actualRecord = actual as Record<string, unknown>;
  expect(Object.keys(actualRecord).sort(), path).toEqual(Object.keys(expectedRecord).sort());
  for (const key of Object.keys(expectedRecord)) {
    compareLeaves(actualRecord[key], expectedRecord[key], `${path}.${key}`);
  }
}
