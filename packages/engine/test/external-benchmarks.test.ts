import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULTS, PARAM_META, PHYSICAL_CONSTANTS, radiatorM2PerKw, secElecJPerKg, secSubJPerKg, simulate } from "../src/index";

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

  test("fission radiator mass per area, from NASA's 40 kWe surface power design", () => {
    const item = benchmark("mason-2008-fsp-radiator");
    expect(item.kind).toBe("calibration");
    const i = item.inputs as Record<string, number>;
    // 615 kg over the 159 m^2 radiating area before FSP's 10% area margin.
    const arealKgPerM2 = i.heatRejectionMassKg! / (i.radiatingAreaWithMarginM2! / (1 + i.areaMargin!));
    expectRelative2(arealKgPerM2, item.expected as number, 0.001);
    expectRelative2(DEFAULTS.kRadiatorKgPerM2, arealKgPerM2, 0.002);
    // At FSP's temperatures and 27.4% gross conversion, the model's radiator
    // for 40 kWe is within 5% of FSP's area before margin, and so is its mass.
    const fsp = {
      Tsource: i.stirlingHotK!,
      Tsink: i.radiatorEffectiveK!,
      Tenv: i.sinkK!,
      etaMech: i.grossPowerKwe! / i.reactorThermalKw! / (1 - i.radiatorEffectiveK! / i.stirlingHotK!)
    };
    const areaM2 = radiatorM2PerKw({ ...DEFAULTS, ...fsp }) * i.userPowerKwe!;
    const fspAreaM2 = i.radiatingAreaWithMarginM2! / (1 + i.areaMargin!);
    expectRelative2(areaM2, fspAreaM2, 0.05);
    expectRelative2(areaM2 * DEFAULTS.kRadiatorKgPerM2, i.heatRejectionMassKg!, 0.05);
    // The engine charges that area to the fission system.
    const run = simulate(fsp);
    expectRelative2(run.power.radiatorMassKg, run.power.radiatorM2 * DEFAULTS.kRadiatorKgPerM2, 1e-12);
    expectRelative2(
      run.power.nuclearMassKg,
      DEFAULTS.MshieldKg + DEFAULTS.alphaSpecific * (run.energy.gridPowerW / 1000) + run.power.radiatorMassKg,
      1e-12
    );
  });

  test("electrolysis balance of plant: NASA's small lunar design sits above DOE's terrestrial systems", () => {
    const item = benchmark("doe-pem-electrolysis-bop");
    expect(item.kind).toBe("documentation-only");
    const i = item.inputs as Record<string, number>;
    const bop = [
      i.system2022KWhPerKg! / i.stack2022KWhPerKg! - 1,
      i.system2026KWhPerKg! / i.stack2026KWhPerKg! - 1,
      i.systemUltimateKWhPerKg! / i.stackUltimateKWhPerKg! - 1
    ];
    expectRelative2(bop[0]!, item.expected as number, 0.01);
    for (const value of bop) {
      expect(value).toBeGreaterThan(0.05);
      expect(value).toBeLessThan(DEFAULTS.fElectrolysisBop);
    }
    // The NASA-calibrated term is within a factor of two of DOE's.
    expect(DEFAULTS.fElectrolysisBop / bop[0]!).toBeLessThan(2);
    // It closes the old gap: stack power alone ran about 10% under NASA's 17.5 kW.
    const stackOnly = simulate({ site: "polar", polarProduct: "propellant", targetKgPerDay: 67.26, fElectrolysisBop: 0 });
    const stackKw = stackOnly.energy.balances.find((row) => row.id === "water-electrolysis-energy")!.electricalInputW / 1000;
    expectRelative2(stackKw * (1 + DEFAULTS.fElectrolysisBop), 17.5, 0.005);
    // Balance of plant leaves as heat: the water's chemical energy is the
    // stack's alone, and every added watt is rejected.
    const withBop = simulate({ site: "polar", polarProduct: "propellant", targetKgPerDay: 67.26 });
    const ledger = (r: typeof withBop) => r.energy.balances.find((row) => row.id === "water-electrolysis-energy")!;
    expectRelative2(ledger(withBop).usefulOutputW, ledger(stackOnly).usefulOutputW, 1e-12);
    expectRelative2(
      ledger(withBop).rejectedHeatW - ledger(stackOnly).rejectedHeatW,
      ledger(withBop).electricalInputW - ledger(stackOnly).electricalInputW,
      1e-9
    );
    expect(ledger(withBop).residualW).toBe(0);
  });

  test("polar excavation compares with the NASA mine: whole margined vehicles, not a different rate", () => {
    const item = benchmark("kleinhenz-paz-2020-polar-excavation");
    expect(item.kind).toBe("documentation-only");
    const expected = item.expected as Record<string, number>;
    const { excavation } = simulate({ site: "polar", ...item.inputs });
    // 398 t of icy regolith over the 223 production days, plus its overburden.
    expectRelative2(excavation.soilMovedKgPerDay, (67.26 / (0.05 * 0.75)) * 1.667, 1e-12);
    // The model lands the study's two whole RASSORs (v0.12); its 20% growth
    // margin closes the gap to the Fig. 8 bar.
    expect(excavation.excavatorCount).toBe(2);
    expect(excavation.fleetMassKg).toBe(132);
    expectRelative2(excavation.fleetMassKg * 1.2, expected.excavatorMassKg!, 0.05);
    // Mining power is the same order: within a factor of two.
    const miningPowerW = (DEFAULTS.eMining * excavation.soilMovedKgPerDay) / 86_400;
    expect(miningPowerW / expected.excavatorPowerW!).toBeGreaterThan(0.5);
    expect(miningPowerW / expected.excavatorPowerW!).toBeLessThan(2);
  });

  test("Sabatier block mass comes from NASA's Mars plant; the reactor alone is a small part of it", () => {
    const block = benchmark("kleinhenz-paz-2017-sabatier-block");
    expect(block.kind).toBe("calibration");
    const input = block.inputs as Record<string, number>;
    const methaneKgPerDay = input.methaneKg! / input.productionDays!;
    expectRelative((input.atmosphereProcessingKg! + input.methaneDryerKg!) / methaneKgPerDay, block);
    expectRelative(DEFAULTS.kSabatierMass, block);
    // The methane liquefier is a separate bar, charged in the cryo block.
    expectRelative2(DEFAULTS.kLiquefierCh4, input.methaneLiquefactionKg! / methaneKgPerDay, 0.05);
    const reactor = benchmark("pnnl-2005-sabatier-reactor");
    expect(reactor.kind).toBe("documentation-only");
    const r = reactor.inputs as Record<string, number>;
    const reactorMethaneKgPerDay = r.propellantKg! / (1 + r.oxygenToMethane!) / r.productionDays!;
    expectRelative2(r.reactorKg! / reactorMethaneKgPerDay, reactor.expected as number, 0.05);
    // The input's range reaches the reactor alone; the default carries the whole block.
    expect(PARAM_META.kSabatierMass.min).toBeLessThan(reactor.expected as number);
    expect(DEFAULTS.kSabatierMass / (reactor.expected as number)).toBeGreaterThan(10);
    // The loop's plant is the water electrolyzer plus this block on the methane made.
    const sabatier = simulate({ site: "polar", enableSabatier: true });
    const plant = sabatier.logistics.manifest.find((row) => row.subsystem === "reactor/plant")!.massKg;
    expectRelative2(
      plant,
      sabatier.thermal.extractorMassKg + DEFAULTS.kElectrolyzerMass * DEFAULTS.targetKgPerDay + DEFAULTS.kSabatierMass * sabatier.production.ch4KgPerDay,
      1e-12
    );
    const methaneStore = sabatier.cryo.inventories.find((item) => item.stream === "lch4")!;
    expectRelative2(methaneStore.liquefierMassKg, DEFAULTS.kLiquefierCh4 * sabatier.production.ch4KgPerDay, 1e-12);
  });

  test("one RASSOR moves Guerrero-Gonzalez & Zabel's 2.7 t/day on 100 m hauls", () => {
    const item = benchmark("guerrero-zabel-2023-rassor-rate");
    expect(item.kind).toBe("calibration");
    for (const [key, value] of Object.entries(item.inputs!)) expect(DEFAULTS[key as keyof typeof DEFAULTS], key).toBe(value);
    const { excavation } = simulate(item.inputs as Partial<typeof DEFAULTS>);
    // A 300 m loop at 0.27 m/s plus 9 min of digging and dumping is 27.5 min:
    // 34 whole trips in 16 h.
    expect(excavation.excavatorTripsPerDay).toBe(34);
    expectRelative(excavation.excavatorKgPerDay, item);
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
