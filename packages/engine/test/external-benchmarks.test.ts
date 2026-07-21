import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULTS, secElecJPerKg, secSubJPerKg } from "../src/index";

const J_PER_KWH = 3_600_000;
const suite = JSON.parse(
  readFileSync(new URL("./fixtures/external-benchmarks.json", import.meta.url), "utf8")
) as {
  benchmarks: Array<{
    id: string;
    kind: string;
    inputs?: Record<string, number>;
    expected: number | string | Record<string, number>;
    relativeTolerance?: number;
  }>;
};

function benchmark(id: string): (typeof suite.benchmarks)[number] {
  const found = suite.benchmarks.find((item) => item.id === id);
  if (found === undefined) throw new Error(`Missing benchmark ${id}`);
  return found;
}

function expectRelative(actual: number, item: ReturnType<typeof benchmark>): void {
  expect(typeof item.expected).toBe("number");
  const expected = item.expected as number;
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * (item.relativeTolerance ?? 0));
}

describe("external analytical benchmarks (separate from implementation parity)", () => {
  test("Faraday oxygen SEC anchor", () => {
    const item = benchmark("faraday-o2-default");
    expectRelative(
      secElecJPerKg(item.inputs!.cellVoltageV!, item.inputs!.currentEfficiency!) / J_PER_KWH,
      item
    );
  });

  test.each(["polar-sublimation-5wt", "polar-sublimation-0p5wt"])("%s", (id) => {
    const item = benchmark(id);
    const input = item.inputs!;
    expectRelative(
      secSubJPerKg(
        input.iceMassFraction!,
        input.regolithHeatCapacity!,
        input.startTemperatureK!,
        input.sublimationTemperatureK!
      ) / J_PER_KWH,
      item
    );
  });

  test("polar defaults identify their site-profile anchor", () => {
    const item = benchmark("shackleton-rim-profile");
    const expected = item.expected as Record<string, number>;
    expect(DEFAULTS.polarIlluminationFraction).toBe(expected.illuminationFraction);
    expect(DEFAULTS.polarLongestShadowHours).toBe(expected.longestShadowHours);
  });

  test("open benchmarks remain visibly unresolved", () => {
    expect(benchmark("mli-layer-density-units").kind).toBe("open");
  });
});
