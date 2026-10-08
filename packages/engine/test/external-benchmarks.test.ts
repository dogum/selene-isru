import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULTS, PARAM_META, PHYSICAL_CONSTANTS, secElecJPerKg, secSubJPerKg, simulate } from "../src/index";

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

function expectRelative2(actual: number, expected: number, relTol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relTol);
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

  test("polar excavation compares with the NASA mine: whole margined vehicles, not a different rate", () => {
    const item = benchmark("kleinhenz-paz-2020-polar-excavation");
    expect(item.kind).toBe("documentation-only");
    const expected = item.expected as Record<string, number>;
    const { excavation } = simulate({ site: "polar", ...item.inputs });
    // 398 t of icy regolith over the 223 production days, plus its overburden.
    expectRelative2(excavation.soilMovedKgPerDay, (67.26 / (0.05 * 0.75)) * 1.667, 1e-12);
    // A RASSOR moves 2.7 t/day and weighs 66 kg (Guerrero-Gonzalez & Zabel
    // 2023): the study's two whole vehicles with 20% growth margin reproduce
    // its Fig. 8 bar, so the gap is rounding and margin.
    const wholeVehicles = Math.ceil(excavation.soilMovedKgPerDay / 2700);
    expect(wholeVehicles).toBe(2);
    expectRelative2(wholeVehicles * 66 * 1.2, expected.excavatorMassKg!, 0.05);
    // The model's continuous, unmargined fleet is lighter, by less than 2.5x.
    expect(excavation.fleetMassKg).toBeLessThan(expected.excavatorMassKg!);
    expect(excavation.fleetMassKg).toBeGreaterThan(expected.excavatorMassKg! / 2.5);
    // Mining power is the same order: within a factor of two.
    const miningPowerW = (DEFAULTS.eMining * excavation.soilMovedKgPerDay) / 86_400;
    expect(miningPowerW / expected.excavatorPowerW!).toBeGreaterThan(0.5);
    expect(miningPowerW / expected.excavatorPowerW!).toBeLessThan(2);
  });

  test("ilmenite bed mass reproduces Eagle's no-separation trade", () => {
    const item = benchmark("eagle-1988-no-separation-trade");
    const input = item.inputs!;
    const reactor = (ilmConcentrateGrade: number) =>
      simulate({ equatorialProcess: "ilmenite", targetKgPerDay: input.targetKgPerDay!, fIlmenite: input.soilGrade!, ilmConcentrateGrade })
        .ilmenite!.reactorMassKg;
    // A grade equal to the soil's is no separation: the sized soil is fed whole.
    expectRelative(reactor(input.soilGrade!) - reactor(input.concentrateGrade!), item);
  });

  test("the ilmenite activation energy defaults to Zhao & Shadman's, inside a range that holds the other anchors", () => {
    const item = benchmark("ilmenite-reduction-activation-energy");
    const expected = item.expected as Record<string, number>;
    expect(DEFAULTS.EaIlmReduction / 1000).toBeCloseTo(expected.zhaoShadmanKJPerMol!, 1);
    // Eagle's cited complete-reduction times, 2 h at 873 K and 0.25 h at 1,073 K.
    const fromTimes = (PHYSICAL_CONSTANTS.R.value * Math.log(2 / 0.25)) / (1 / 873 - 1 / 1073) / 1000;
    expectRelative2(fromTimes, expected.eagleCitedTimesKJPerMol!, 0.005);
    // A bed held near gas equilibrium: Eagle's per-pass 10.5% at 1,000 °C and 7% at 900 °C.
    const fromEquilibrium = (PHYSICAL_CONSTANTS.R.value * Math.log(10.5 / 7)) / (1 / 1173 - 1 / 1273) / 1000;
    expectRelative2(fromEquilibrium, expected.gasLimitedBedKJPerMol!, 0.01);
    const bounds = PARAM_META.EaIlmReduction;
    for (const value of [fromEquilibrium, fromTimes, expected.zhaoShadmanKJPerMol!, expected.briggsSaccoKJPerMol!]) {
      expect(value * 1000).toBeGreaterThanOrEqual(bounds.min!);
      expect(value * 1000).toBeLessThanOrEqual(bounds.max!);
    }
  });

  test("the basalt chain and comminution reproduce Eagle's basalt plants", () => {
    const item = benchmark("eagle-1988-basalt-feed");
    const expected = item.expected as Record<string, number>;
    const o2 = item.inputs!.runningO2KgPerDay!;
    const ilmenite = simulate({ equatorialProcess: "ilmenite", ilmFeed: "basalt", targetKgPerDay: o2 }).ilmenite!;
    const actual: Record<string, number> = {
      basaltFedPerKgO2: ilmenite.basaltFedKgPerDay / o2,
      minedPerKgO2: ilmenite.soilPerKgO2,
      beneficiationKW: (ilmenite.secBeneficiation_JPerKg * o2) / 86_400 / 1000,
      beneficiationMassKg: ilmenite.beneficiationMassKg
    };
    for (const [key, value] of Object.entries(expected)) {
      expectRelative2(actual[key]!, value, item.relativeTolerance!);
    }
  });

  test("basalt against soil: the power ratio follows Eagle, the mass ratio is disclosed", () => {
    const expected = benchmark("eagle-1988-basalt-vs-soil").expected as Record<string, number>;
    const run = (ilmFeed: "soil" | "basalt") => simulate({ equatorialProcess: "ilmenite", ilmFeed, targetKgPerDay: 3044.1 });
    const soil = run("soil");
    const basalt = run("basalt");
    expectRelative2(basalt.energy.gridPowerW / soil.energy.gridPowerW, expected.powerRatio!, 0.05);
    const massRatio = basalt.logistics.totalInfraMassKg / soil.logistics.totalInfraMassKg;
    expect(massRatio).toBeLessThan(1);
    expect(massRatio).toBeGreaterThan(expected.landedMassRatio!);
  });

  test("Bond's law puts grinding alone well under the calibrated comminution energy", () => {
    const item = benchmark("bond-law-basalt-grinding");
    const grindingKJPerKg = (10 * 20.41 * (1 / Math.sqrt(100) - 1 / Math.sqrt(100_000)) * 3.6);
    expectRelative2(grindingKJPerKg, item.expected as number, 0.01);
    expect(grindingKJPerKg * 1000).toBeLessThan(DEFAULTS.eIlmComminution);
  });

  test("open benchmarks remain visibly unresolved", () => {
    expect(benchmark("mli-layer-density-units").kind).toBe("open");
  });
});
