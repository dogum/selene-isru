import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULTS, secElecJPerKg, secSubJPerKg, simulate } from "../src/index";

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

  test("polar defaults sit inside the best-site darkness range", () => {
    const expected = benchmark("connecting-ridge-best-site").expected as Record<string, number>;
    expect(DEFAULTS.polarLongestShadowHours).toBeLessThanOrEqual(expected.longestDarknessDaysMax! * 24);
    expect(DEFAULTS.polarIlluminationFraction).toBeLessThan(expected.illuminationFraction2m!);
  });

  test("polar extraction calibration reproduces the NASA baseline case", () => {
    const item = benchmark("kleinhenz-paz-2020-polar-water");
    const expected = item.expected as Record<string, number>;
    const result = simulate({ site: "polar", ...item.inputs });
    const tolerance = item.relativeTolerance ?? 0;
    const heaterPowerKW =
      ((result.thermal.secSub_JPerKg! + result.thermal.heaterLoss_JPerKg!) * item.inputs!.targetKgPerDay!) / 86_400 / 1000;
    expect(Math.abs(result.thermal.extractorMassKg - expected.extractorMassKg!)).toBeLessThanOrEqual(expected.extractorMassKg! * tolerance);
    expect(Math.abs(heaterPowerKW - expected.heaterPowerKW!)).toBeLessThanOrEqual(expected.heaterPowerKW! * tolerance);
  });

  test("polar propellant calibration reproduces the NASA baseline", () => {
    const item = benchmark("kleinhenz-paz-2020-polar-propellant");
    const expected = item.expected as Record<string, number>;
    const result = simulate({ site: "polar", polarProduct: "propellant", ...item.inputs });
    const stream = (name: string) => result.cryo.inventories.find((inventory) => inventory.stream === name)!;
    const plant = result.logistics.manifest.find((row) => row.subsystem === "reactor/plant")!.massKg;
    const actual: Record<string, number> = {
      electrolysisPowerKW: result.energy.balances.find((row) => row.id === "water-electrolysis-energy")!.electricalInputW / 1000,
      h2LiquefactionPowerKW: stream("lh2").conditioningPowerW / 1000,
      o2LiquefactionPowerKW: stream("lox").conditioningPowerW / 1000,
      electrolyzerMassKg: plant - result.thermal.extractorMassKg,
      h2LiquefierMassKg: stream("lh2").liquefierMassKg,
      o2LiquefierMassKg: stream("lox").liquefierMassKg
    };
    for (const [key, value] of Object.entries(expected)) {
      expect(Math.abs(actual[key]! - value), key).toBeLessThanOrEqual(value * item.relativeTolerance!);
    }
  });

  test("open benchmarks remain visibly unresolved", () => {
    expect(benchmark("mli-layer-density-units").kind).toBe("open");
  });
});
