import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { simulate } from "../src/index";
import type { SimParams } from "../src/types";

interface GoldenVector {
  name: string;
  params: Partial<SimParams>;
  result: unknown;
}

interface GoldenFile {
  schemaVersion: number;
  seed: number;
  vectors: GoldenVector[];
}

const golden = JSON.parse(
  readFileSync(new URL("./golden_vectors.json", import.meta.url), "utf8")
) as GoldenFile;

describe("python golden parity", () => {
  test("fixture shape is the expected deterministic harness", () => {
    expect(golden.schemaVersion).toBe(1);
    expect(golden.seed).toBe(42);
    expect(golden.vectors).toHaveLength(208);
  });

  test.each(golden.vectors)("$name", (vector) => {
    const actual = simulate(vector.params);
    compareLeaves(actual, vector.result, vector.name);
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
