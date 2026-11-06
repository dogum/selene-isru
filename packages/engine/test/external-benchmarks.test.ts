import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { cableDesign, cableMassKg, conversionKgPerKwe, DEFAULTS, fissionEfficiency, fissionShieldKg, lineEfficiency, fissionScaleFactor, nuclearMassAtKwe, PARAM_META, PHYSICAL_CONSTANTS, radiatorFluxWPerM2, radiatorM2PerKw, secElecJPerKg, secSubJPerKg, shieldMassKg, simulate } from "../src/index";

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

  test("fission slope from NASA's surface Brayton systems, 100 to 500 kWe (v0.19)", () => {
    const item = benchmark("mason-2001-surface-brayton-scaling");
    expect(item.kind).toBe("calibration");
    const i = item.inputs as Record<string, number>;
    const mass100 = i.power100Kwe! * i.specificMass100KgPerKwe!;
    const mass500 = i.power500Kwe! * i.specificMass500KgPerKwe!;
    const marginal = (mass500 - mass100) / (i.power500Kwe! - i.power100Kwe!);
    expectRelative2(marginal, item.expected as number, 1e-9);
    // v0.21: the shield grows with power, so the model's marginal mass between the
    // two systems, shield included, is Mason's. v0.22: so does the reactor and
    // conversion's economy of scale; the model lands 2.55 t lighter at both.
    // v0.24: the radiator spans the gas cooler, so the refit lands 2.52 t lighter.
    // v0.25: the shield at its 1 km separation and the cable to the outpost; 2.55 t.
    // v0.27: the cable designed for its power; 2.46 t.
    const modelKg = (kwe: number) => nuclearMassAtKwe(DEFAULTS, kwe);
    const modelMarginal = (modelKg(i.power500Kwe!) - modelKg(i.power100Kwe!)) / (i.power500Kwe! - i.power100Kwe!);
    expectRelative2(modelMarginal, marginal, 0.001);
    expectRelative2(mass100 - modelKg(i.power100Kwe!), 2463, 0.01);
    expectRelative2(mass500 - modelKg(i.power500Kwe!), 2463, 0.01);
  });

  test("fission economy of scale from NASA's spacecraft Brayton systems, 0.1 to 10 MWe (v0.22)", () => {
    const item = benchmark("mason-2001-spacecraft-brayton-scaling");
    expect(item.kind).toBe("calibration");
    const i = item.inputs as Record<string, number>;
    const mass = [
      i.power100Kwe! * i.specificMass100KgPerKwe!,
      i.power1000Kwe! * i.specificMass1000KgPerKwe!,
      i.power10000Kwe! * i.specificMass10000KgPerKwe!
    ] as const;
    const exponent = Math.log10((mass[2] - mass[1]) / (mass[1] - mass[0]));
    expectRelative2(exponent, item.expected as number, 1e-3);
    expectRelative2(DEFAULTS.bFissionScale, exponent, 0.005);
    // Not fitted: the model's mass without its shield grows 9.4 times from 1 to
    // 10 MWe, against Mason's 8.9: its radiator stays linear.
    const variableKg = (kwe: number) =>
      nuclearMassAtKwe(DEFAULTS, kwe) -
      shieldMassKg(DEFAULTS.MshieldKg, DEFAULTS.QshieldRefKwt, DEFAULTS.nShield, kwe / fissionEfficiency(DEFAULTS));
    const fixed =
      mass[0] - ((mass[1] - mass[0]) / (i.power1000Kwe! ** exponent - i.power100Kwe! ** exponent)) * i.power100Kwe! ** exponent;
    const masonRatio = (mass[2] - fixed) / (mass[1] - fixed);
    expectRelative2(masonRatio, 8.88, 0.002);
    expectRelative2(variableKg(10000) / variableKg(1000), masonRatio, 0.08);
  });

  test("Stirling efficiency as a fraction of Carnot, from NASA's lunar Stirling designs (v0.23)", () => {
    const item = benchmark("mason-2006-lunar-stirling");
    expect(item.kind).toBe("calibration");
    const i = item.inputs as Record<string, number>;
    const nak = i.nakEfficiency! / (1 - i.nakColdK! / i.nakHotK!);
    const lithium = i.lithiumEfficiency! / (1 - i.lithiumColdK! / i.lithiumHotK!);
    expectRelative2(Math.sqrt(nak * lithium), item.expected as number, 0.001);
    expectRelative2(DEFAULTS.fCarnotStirling, item.expected as number, 0.005);
    for (const [hot, cold, eta] of [
      [i.nakHotK!, i.nakColdK!, i.nakEfficiency!],
      [i.lithiumHotK!, i.lithiumColdK!, i.lithiumEfficiency!]
    ] as const) {
      expectRelative2(fissionEfficiency({ ...DEFAULTS, fissionConverter: "stirling", Tsource: hot, Tsink: cold }), eta, 0.05);
    }
  });

  test("Stirling mass from NASA's Stirling systems, 0.1 to 10 MWe (v0.23)", () => {
    const item = benchmark("mason-2001-stirling-scaling");
    expect(item.kind).toBe("calibration");
    const i = item.inputs as Record<string, number>;
    const marginal = (500 * i.surface500SpecificKgPerKwe! - 100 * i.surface100SpecificKgPerKwe!) / 400;
    expectRelative2(marginal, item.expected as number, 1e-9);
    const stirling = { ...DEFAULTS, fissionConverter: "stirling" as const, Tsource: 1050, Tsink: 500 };
    expectRelative2((nuclearMassAtKwe(stirling, 500) - nuclearMassAtKwe(stirling, 100)) / 400, marginal, 0.001);
    const mass = [100 * i.spacecraft100SpecificKgPerKwe!, 1000 * i.spacecraft1000SpecificKgPerKwe!, 10000 * i.spacecraft10000SpecificKgPerKwe!] as const;
    const exponent = Math.log10((mass[2] - mass[1]) / (mass[1] - mass[0]));
    expectRelative2(exponent, 0.996, 0.001);
    expectRelative2(DEFAULTS.bStirlingScale, exponent, 0.005);
    // Not used in calibration: NASA FSP's Stirling conversion and power management per kWe.
    const fsp = (i.fspConversionKg! + i.fspPowerManagementKg!) / i.fspUserPowerKwe!;
    // v0.25: 21.06 kg/kWe, 7% under FSP's 22.6, with v0.25's heavy 3 kV conductor charged on its own.
    // v0.27: the cable designed for its power is lighter, so 21.96 kg/kWe, back within 5%.
    expectRelative2(DEFAULTS.kConversionStirlingKgPerKwe, fsp, 0.05);
    // Stirling is heavier than Brayton at megawatt scale, as Mason 2001 finds above 50 kWe.
    expectRelative2(nuclearMassAtKwe(stirling, 500) / nuclearMassAtKwe(DEFAULTS, 500), 1.2, 0.01);
  });

  test("fission shield and cable against separation, from NASA's 40 kWe surface power design (v0.25)", () => {
    const item = benchmark("mason-2025-fsp-separation");
    expect(item.kind).toBe("calibration");
    const i = item.inputs as Record<string, number>;
    const exponent = Math.log(i.shield05Kg! / i.shield2Kg!) / Math.log(i.separation2Km! / i.separation05Km!);
    expectRelative2(DEFAULTS.nShieldDistance, exponent, 0.005);
    expect(DEFAULTS.MshieldKg).toBe(i.shield1Kg);
    const at = (km: number) => ({ ...DEFAULTS, dSeparationKm: km });
    const cable = (km: number) => cableMassKg(at(km), i.userPowerKwe! / lineEfficiency(at(km)));
    expectRelative2(fissionShieldKg(at(i.separation05Km!), i.reactorThermalKwt!), i.shield05Kg!, 0.01);
    expectRelative2(fissionShieldKg(at(i.separation2Km!), i.reactorThermalKwt!), i.shield2Kg!, 0.01);
    // The cable grows as Mason's user interface pallet does: 385 kg/km by least squares.
    const xs = [i.separation05Km!, i.separation1Km!, i.separation2Km!];
    const ys = [i.pallet05Kg!, i.pallet1Kg!, i.pallet2Kg!];
    const mx = xs.reduce((a, b) => a + b, 0) / 3;
    const my = ys.reduce((a, b) => a + b, 0) / 3;
    const slope = xs.reduce((a, x, k) => a + (x - mx) * (ys[k]! - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    expectRelative2(cable(1), slope, 0.005);
    expectRelative2(cable(2) - cable(0.5), i.pallet2Kg! - i.pallet05Kg!, 0.02);
    // Not fitted: the shield-plus-cable minimum, against Mason's 1.8 km.
    const system = (km: number) => fissionShieldKg(at(km), i.reactorThermalKwt!) + cable(km);
    let best = 0.2;
    for (let k = 20; k < 500; k++) {
      if (system(k / 100) < system(best)) best = k / 100;
    }
    expectRelative2(best, i.optimumSeparationKm!, 0.05);
  });

  test("cable voltage and mass, from NASA's lunar transmission studies (v0.27)", () => {
    const item = benchmark("barth-pike-2022-cable-voltage");
    expect(item.kind).toBe("documentation-only");
    const i = item.inputs as Record<string, number>;
    const design = (kw: number, km: number, efficiency: number) =>
      cableDesign({ ...DEFAULTS, fCableLossPerKm: (1 - efficiency) / km, VCableMaxV: 30000 }, kw);
    const barth = design(i.barthPowerKw!, i.barthLengthKm!, i.barthEfficiency!);
    expectRelative2(barth.voltageV / 2, item.expected as number, 0.02);
    const oleson = design(i.olesonPowerKwe!, i.olesonLengthKm!, i.olesonEfficiency!);
    expect(oleson.conductorAreaM2).toBe(PHYSICAL_CONSTANTS.AConductorMinM2.value);
    expectRelative2(oleson.voltageV / 2, i.olesonOptimumVoltsToNeutral!, 0.12);
    const mass = (oleson.conductorKgPerKm + oleson.insulationKgPerKm + oleson.jacketKgPerKm) * i.olesonLengthKm!;
    expectRelative2(mass, i.olesonCableMassKg!, 0.15);
  });

  test("buried fission shield, from NASA FSP's emplaced reactor (v0.26)", () => {
    const item = benchmark("mason-2008-fsp-emplaced-shield");
    expect(item.kind).toBe("calibration");
    const i = item.inputs as Record<string, number>;
    expect(DEFAULTS.MshieldBuriedKg).toBe(i.shieldKg);
    expect(item.expected).toBe(i.shieldKg);
    expect(DEFAULTS.QshieldRefKwt).toBe(i.reactorThermalKwt);
    // The regolith shields the outpost, so separation does not size the shield.
    for (const km of [i.separationKm!, 1, 5]) {
      expect(fissionShieldKg({ ...DEFAULTS, fissionSiting: "buried", dSeparationKm: km }, i.reactorThermalKwt!)).toBe(i.shieldKg);
    }
    // Not reproduced: older on-board shields made landed systems about twice as heavy; the model's
    // surface shield is Mason 2025's directional shield, lighter at 1 km than the buried one.
    expectRelative2(fissionShieldKg(DEFAULTS, i.reactorThermalKwt!) / i.shieldKg!, 0.817, 0.002);
  });

  test("fission design point and a 50 kWe cross-check, from NASA's lunar Brayton study (v0.19)", () => {
    const item = benchmark("mason-2006-lunar-brayton-50kwe");
    expect(item.kind).toBe("documentation-only");
    const i = item.inputs as Record<string, number>;
    expect(DEFAULTS.Tsource).toBe(i.hotEndK);
    expect(DEFAULTS.Tsink).toBe(i.coldEndK);
    expectRelative2(fissionEfficiency(DEFAULTS), i.converterEfficiency!, 0.002);
    // v0.24: the radiator spans the gas cooler; its approach is fitted to Mason's flux,
    // 158.6 kWt over 140 m^2 before margin.
    const masonFlux = ((i.reactorThermalKwt! - i.converterOutputKwe!) * 1000) / (i.radiatorAreaWithMarginM2! / (1 + i.areaMargin!));
    expectRelative2(radiatorFluxWPerM2(DEFAULTS), masonFlux, 0.02);
    // Not calibrated: the model's radiator and system mass at 50 kWe, against Mason's before margin.
    // Since v0.24 it rejects less heat than Mason's system, so sizes 126 m^2 against 140.
    const areaM2 = radiatorM2PerKw(DEFAULTS) * i.outputKwe!;
    expectRelative2(areaM2, i.radiatorAreaWithMarginM2! / (1 + i.areaMargin!), 0.15);
    const massKg = nuclearMassAtKwe(DEFAULTS, i.outputKwe!);
    expectRelative2(i.systemMassWithMarginKg! / (1 + i.massMargin!), item.expected as number, 0.001);
    // v0.21: 3.0 t against 3.49 t, 14% light (10% before the shield scaled with power).
    // v0.22: 3.09 t, 12% light, with the small reactor's diseconomy of scale.
    // v0.24: 3.11 t, 11% light, with the radiator over the gas span.
    expectRelative2(massKg, item.expected as number, 0.15);
    expect(massKg).toBeLessThan(item.expected as number);
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
    // FSP is a Stirling: its 27.4% gross conversion as a fraction of Carnot, rejecting at
    // its 380 K effective radiator (v0.24; v0.20-v0.23 pinned it through a Brayton cycle).
    const temps = { Tsource: i.stirlingHotK!, Tsink: i.radiatorEffectiveK!, Tenv: i.sinkK! };
    const carnot = 1 - i.radiatorEffectiveK! / i.stirlingHotK!;
    const fsp = { ...temps, fissionConverter: "stirling" as const, fCarnotStirling: i.grossPowerKwe! / i.reactorThermalKw! / carnot };
    const areaM2 = radiatorM2PerKw({ ...DEFAULTS, ...fsp }) * i.userPowerKwe!;
    const fspAreaM2 = i.radiatingAreaWithMarginM2! / (1 + i.areaMargin!);
    expectRelative2(areaM2, fspAreaM2, 0.05);
    expectRelative2(areaM2 * DEFAULTS.kRadiatorKgPerM2, i.heatRejectionMassKg!, 0.05);
    // v0.18: the default reactor/conversion split is FSP's: the reactor is half
    // of reactor, conversion and power management at the default efficiency.
    const fspReactorShare = i.reactorMassKg! / (i.reactorMassKg! + i.conversionMassKg! + i.powerManagementMassKg!);
    const defaultReactorPerKwe = DEFAULTS.kReactorKgPerKwt / fissionEfficiency(DEFAULTS);
    expectRelative2(defaultReactorPerKwe / (defaultReactorPerKwe + DEFAULTS.kConversionKgPerKwe), fspReactorShare, 0.005);
    // The engine charges that area to the fission system.
    const run = simulate(fsp);
    expectRelative2(run.power.radiatorMassKg, run.power.radiatorM2 * DEFAULTS.kRadiatorKgPerM2, 1e-12);
    expectRelative2(
      run.power.nuclearMassKg,
      run.power.shieldMassKg +
        DEFAULTS.kReactorKgPerKwt * (run.power.fissionThermalW / 1000) * fissionScaleFactor(DEFAULTS, run.power.fissionThermalW / 1000) +
        conversionKgPerKwe({ ...DEFAULTS, ...fsp }, run.power.fissionThermalW / 1000) * ((run.energy.gridPowerW + run.power.cableLossW) / 1000) +
        run.power.radiatorMassKg +
        run.power.cableMassKg,
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
