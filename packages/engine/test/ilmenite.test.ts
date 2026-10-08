import { describe, expect, test } from "vitest";
import { DEFAULTS, PHYSICAL_CONSTANTS, ilmeniteConversion, ilmeniteOxygenFraction, normalizeParams, simulate } from "../src/index";
import { simulateConstruction } from "../src/modules/construction";
import type { SimParams } from "../src/types";

function expectRel(actual: number, expected: number, relTol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1e-9, Math.abs(expected) * relTol));
}

const ILMENITE: Partial<SimParams> = { equatorialProcess: "ilmenite" };
const J_PER_KWH = 3_600_000;

describe("ilmenite reduction", () => {
  test("the soil chain reproduces Eagle 1988 Table 6-1", () => {
    const { ilmenite } = simulate(ILMENITE);
    const perKgO2 = (kgPerDay: number) => kgPerDay / 1000;
    // 9.484 t ilmenite reduced, 10.54 t fed, 143.38 t soil in the size window,
    // and 326.82 t mined per t of oxygen.
    expectRel(1 / ilmeniteOxygenFraction(), 9.484, 1e-3);
    expectRel(perKgO2(ilmenite!.ilmeniteReducedKgPerDay), 9.484, 1e-3);
    expectRel(perKgO2(ilmenite!.sizedSoilKgPerDay), 143.38, 2e-3);
    expectRel(ilmenite!.soilPerKgO2, 326.82, 2e-3);
    // At 90 wt% the concentrate carries the fed ilmenite, 10.54 t per t.
    expectRel(perKgO2(ilmenite!.concentrateKgPerDay) * 0.9, 10.54, 1e-3);
  });

  test("every process node conserves mass and every watt is allocated", () => {
    for (const input of [ILMENITE, { ...ILMENITE, fIlmenite: 0.005, targetKgPerDay: 20000 }, { ...ILMENITE, ilmConcentrateGrade: 0.1 }]) {
      const result = simulate(input);
      expect(result.materials.balances.map((balance) => balance.id)).toEqual([
        "ilmenite-beneficiation",
        "ilmenite-reduction",
        "water-electrolysis"
      ]);
      expect(result.materials.maxAbsResidualKgPerDay).toBe(0);
      expect(result.energy.maxAbsResidualW).toBe(0);
      expect(result.warnings.some((warning) => warning.id === "material-balance" || warning.id === "energy-balance")).toBe(false);
    }
  });

  test("the energy lines are the chain's terms per kg of oxygen", () => {
    const params = normalizeParams(ILMENITE).params;
    const result = simulate(params);
    const ilmenite = result.ilmenite!;
    const line = (from: string, to: string) =>
      result.energy.flows.find((flow) => flow.from === from && flow.to === to)!.kWhPerKg * J_PER_KWH;
    expectRel(line("mine", "beneficiation"), params.eMining * ilmenite.soilPerKgO2, 1e-12);
    expectRel(line("beneficiation", "reduction"), params.eIlmBeneficiation * ilmenite.soilPerKgO2, 1e-12);
    const concentratePerKgO2 = ilmenite.concentrateKgPerDay / params.targetKgPerDay;
    const sensible = concentratePerKgO2 * 1080 * (params.TIlmReactor - params.Tambient) * (1 - params.etaIlmHeatRecovery);
    const reaction = 294_000 * ilmenite.ilmeniteReducedKgPerDay / params.targetKgPerDay;
    expectRel(line("reduction", "electrolysis"), sensible + reaction, 1e-12);
    expectRel(line("reduction", "parasitic"), params.fIlmHeatLoss * (sensible + reaction), 1e-12);
    // The same electrolyzer as polar propellant mode, per kg of water split.
    const polar = simulate({ site: "polar", polarProduct: "propellant" });
    const perKgWater = polar.energy.flows.find((flow) => flow.from === "electrolysis")!.kWhPerKg;
    expectRel(line("electrolysis", "product") / J_PER_KWH, perKgWater * (ilmenite.waterKgPerDay / params.targetKgPerDay), 1e-12);
    // No MRE terms remain.
    expect(result.energy.flows.some((flow) => flow.from === "melt" || flow.to === "melt")).toBe(false);
    expect(result.electrolysis.currentA).toBe(0);
    expect(result.electrolysis.secElec_JPerKg).toBe(0);
  });

  test("calibration check: Eagle's 1,000 t/yr soil plant", () => {
    // Eagle 1988 Table 6-5: 90% duty, so the running rate is 3,044 kg/day.
    // Its feed starts at 0 C. Process power was 1,160 kW: reactor heater,
    // solid-oxide electrolysis (3.52 / 0.72 kWh per kg water), and liquefier
    // (0.461 kWh per kg LOX). This checks the reactor calibration, not the
    // physics: fIlmHeatLoss was set from the same table.
    const params = normalizeParams({ ...ILMENITE, targetKgPerDay: 1e6 / (365 * 0.9), Tambient: 273 }).params;
    const result = simulate(params);
    const ilmenite = result.ilmenite!;
    const kgPerHour = params.targetKgPerDay / 24;
    const reactorKw = (ilmenite.secSensible_JPerKg + ilmenite.secReaction_JPerKg + ilmenite.secReactorLoss_JPerKg) * params.targetKgPerDay / 86_400 / 1000;
    const electrolysisKw = (3.52 / 0.72) * (ilmenite.waterKgPerDay / 24);
    const liquefierKw = 0.461 * kgPerHour;
    expectRel(reactorKw + electrolysisKw + liquefierKw, 1160, 0.01);
    // Beneficiation: 1,002 kW and 93.6 t for 995 t/day of soil.
    expectRel(ilmenite.soilKgPerDay / 1000, 995, 0.003);
    expectRel(ilmenite.secBeneficiation_JPerKg * params.targetKgPerDay / 86_400 / 1000, 1002, 0.003);
    expectRel(ilmenite.beneficiationMassKg / 1000, 93.6, 0.003);
  });

  test("ilmenite grade scales the soil handled, not the reactor", () => {
    const base = simulate(ILMENITE).ilmenite!;
    const rich = simulate({ ...ILMENITE, fIlmenite: 0.15 }).ilmenite!;
    expectRel(rich.soilKgPerDay, base.soilKgPerDay / 2, 1e-12);
    expectRel(rich.secMining_JPerKg, base.secMining_JPerKg / 2, 1e-12);
    expectRel(rich.beneficiationMassKg, base.beneficiationMassKg / 2, 1e-12);
    expectRel(rich.miningMassKg, base.miningMassKg / 2, 1e-12);
    expect(rich.concentrateKgPerDay).toBe(base.concentrateKgPerDay);
    expect(rich.secSensible_JPerKg).toBe(base.secSensible_JPerKg);
    expect(rich.reactorMassKg).toBe(base.reactorMassKg);
  });

  test("a leaner concentrate costs reactor heat", () => {
    const base = simulate(ILMENITE).ilmenite!;
    const lean = simulate({ ...ILMENITE, ilmConcentrateGrade: 0.225 }).ilmenite!;
    expectRel(lean.concentrateKgPerDay, base.concentrateKgPerDay * 4, 1e-12);
    expectRel(lean.secSensible_JPerKg, base.secSensible_JPerKg * 4, 1e-12);
    expect(lean.soilKgPerDay).toBe(base.soilKgPerDay);
  });

  test("a concentrate no richer than the soil is no separation, and loses no ilmenite", () => {
    // Asking for a grade at or below the soil's sends the whole sized stream
    // to the reactor, with all its ilmenite: recovery loss does not apply.
    const params = normalizeParams({ ...ILMENITE, fIlmenite: 0.25, etaIlmRecovery: 0.5, ilmConcentrateGrade: 0.1 }).params;
    const bypass = simulate(params).ilmenite!;
    expect(bypass.concentrateKgPerDay).toBe(bypass.sizedSoilKgPerDay);
    expectRel(bypass.concentrateGrade, params.fIlmenite, 1e-12);
    expectRel(
      bypass.soilPerKgO2,
      1 / (params.fIlmenite * params.fIlmSized * ilmeniteConversion(params) * ilmeniteOxygenFraction()),
      1e-12
    );
    expect(simulate({ ...params, etaIlmRecovery: 1 }).ilmenite).toEqual(bypass);
    // Just above the soil's grade the separator runs, and its losses count.
    const separated = simulate({ ...params, ilmConcentrateGrade: 0.26 }).ilmenite!;
    expectRel(separated.soilPerKgO2, bypass.soilPerKgO2 / params.etaIlmRecovery, 1e-12);
    expect(separated.concentrateKgPerDay).toBeLessThan(separated.sizedSoilKgPerDay);
  });

  test("the plant lists its parts and leaves no castable slag", () => {
    const params = normalizeParams(ILMENITE).params;
    const result = simulate(params);
    const ilmenite = result.ilmenite!;
    const row = (subsystem: string) => result.logistics.manifest.find((item) => item.subsystem === subsystem)!.massKg;
    expect(row("excavation fleet")).toBe(ilmenite.miningMassKg);
    expectRel(ilmenite.miningMassKg, params.kMiningMass * ilmenite.soilKgPerDay, 1e-12);
    expect(row("beneficiation plant")).toBe(ilmenite.beneficiationMassKg);
    expect(row("reactor/plant")).toBe(ilmenite.reactorMassKg + ilmenite.electrolyzerMassKg);
    expect(result.production.regolithKgPerDay).toBe(ilmenite.soilKgPerDay);
    expect(result.production.slagKgPerDay).toBe(0);
    expect(result.construction.padsPerYear).toBe(0);
    // Iron is 36.8% of the ilmenite reduced.
    expectRel(ilmenite.ironKgPerDay / ilmenite.ilmeniteReducedKgPerDay, 0.0558 / 0.1517, 1e-3);
    expect(simulate({}).logistics.manifest.some((item) => item.subsystem === "beneficiation plant")).toBe(false);
  });

  test("each process ignores the other's inputs", () => {
    const mre = simulate({});
    expect(mre.ilmenite).toBeNull();
    const ilmeniteInputs: Partial<SimParams> = {
      fIlmenite: 0.2, fIlmSized: 0.7, etaIlmRecovery: 0.6, ilmConcentrateGrade: 0.5, tIlmResidenceH: 1,
      TIlmReactor: 1100, etaIlmHeatRecovery: 0.8, fIlmHeatLoss: 0.6,
      eIlmBeneficiation: 30_000, kIlmBeneficiationMass: 0.3, kIlmGasLoopMass: 40, kIlmBedMass: 1.5
    };
    expect(simulate(ilmeniteInputs)).toEqual(mre);
    const ilmenite = simulate(ILMENITE);
    const changedMre = simulate({ ...ILMENITE, Vcell: 3.6, etaCurrent: 0.6, kReactorMass: 30, overburdenRatio: 3, fParasitic: 0.4 });
    expect(changedMre.energy).toEqual(ilmenite.energy);
    expect(changedMre.logistics).toEqual(ilmenite.logistics);
    expect(changedMre.campaign).toEqual(ilmenite.campaign);
    // The polar site has no ilmenite plant.
    expect(simulate({ site: "polar", equatorialProcess: "ilmenite" })).toEqual(simulate({ site: "polar" }));
    // Mining is shared: both plants move soil with the same fleet (v0.9).
    const heavier = simulate({ ...ILMENITE, eMining: 50_000, kMiningMass: 0.1 });
    expect(heavier.energy.secTotal_kWhPerKg).toBeGreaterThan(ilmenite.energy.secTotal_kWhPerKg);
    expectRel(heavier.ilmenite!.miningMassKg, 0.1 * heavier.ilmenite!.soilKgPerDay, 1e-12);
  });

  test("a Sabatier switch left over from a polar case adds nothing at the equator", () => {
    expect(simulate({ ...ILMENITE, enableSabatier: true })).toEqual(simulate(ILMENITE));
    expect(simulate({ enableSabatier: true })).toEqual(simulate({}));
  });

  test("a plant that casts no slag raises no casting or pad alarms", () => {
    // castDeltaT=200 is over the thermal-stress limit; switching from MRE carries it over.
    const constructionAlarms = (overrides: Partial<SimParams>) =>
      simulate({ castDeltaT: 200, ...overrides }).warnings.filter((warning) => warning.module === "construction");
    expect(constructionAlarms({}).map((warning) => warning.id)).toEqual(["thermal-stress"]);
    expect(constructionAlarms(ILMENITE)).toEqual([]);
    expect(constructionAlarms({ site: "polar" })).toEqual([]);
    const padParams: SimParams = { ...DEFAULTS, castDeltaT: 200, rhoGasPlume: 0.1, vGasPlume: 4000, Cf: 0.02, tauAllowable: 100, FS: 4 };
    expect(simulateConstruction(padParams, 1000).warnings.map((warning) => warning.id)).toEqual(["thermal-stress", "pad-shear"]);
    const idle = simulateConstruction(padParams, 0);
    expect(idle.warnings).toEqual([]);
    // The limits are still reported; there is just nothing cast to exceed them.
    expect(idle.padJointUtilization).toBeGreaterThan(1);
    expect(idle.maxSafeCoolingDeltaK).toBeLessThan(200);
  });

  test("MRE warnings stay with MRE, and a refuelling demand draws on the oxygen", () => {
    const lowVoltage = simulate({ ...ILMENITE, Vcell: 3.5, oxideModel: true, oxideSiO2: 0.9 });
    expect(lowVoltage.warnings.filter((warning) => warning.module === "electrolysis")).toEqual([]);
    const refuel = simulate({ ...ILMENITE, refuelDemand: "lander" });
    expect(refuel.refuel!.supplyH2KgPerDay).toBe(0);
    expect(refuel.refuel!.supplyO2KgPerDay).toBeGreaterThan(0);
  });
});

describe("reduction kinetics and bed hold-up (v0.10)", () => {
  test("conversion follows the staged first-order form, pinned to Eagle's design point", () => {
    const params = normalizeParams(ILMENITE).params;
    // 90% at 1,000 °C and 4 h in three stages, by construction.
    expectRel(ilmeniteConversion(params), 0.9, 1e-12);
    expect(simulate(params).ilmenite!.conversion).toBe(ilmeniteConversion(params));
    // Written out: k_ref from the design point, Arrhenius with Zhao & Shadman's Ea.
    const T = 1173;
    const tau = 2;
    const kRef = (3 * (Math.pow(0.1, -1 / 3) - 1)) / 4;
    const k = kRef * Math.exp((-93_300 / PHYSICAL_CONSTANTS.R.value) * (1 / T - 1 / 1273));
    expectRel(ilmeniteConversion({ TIlmReactor: T, tIlmResidenceH: tau, EaIlmReduction: 93_300 }), 1 - Math.pow(1 + (k * tau) / 3, -3), 1e-12);
    // Hotter or longer reduces more; neither reaches complete reduction.
    const at = (TIlmReactor: number, tIlmResidenceH: number) =>
      ilmeniteConversion({ TIlmReactor, tIlmResidenceH, EaIlmReduction: DEFAULTS.EaIlmReduction });
    expect(at(1173, 4)).toBeLessThan(at(1273, 4));
    expect(at(1373, 4)).toBeGreaterThan(at(1273, 4));
    expect(at(1273, 1)).toBeLessThan(at(1273, 4));
    expect(at(1273, 12)).toBeLessThan(1);
    expect(at(1273, 1e-9)).toBeLessThan(1e-8);
    // A weaker temperature dependence (a gas-limited bed) narrows the spread;
    // the design point does not move.
    const weak = (TIlmReactor: number) => ilmeniteConversion({ TIlmReactor, tIlmResidenceH: 4, EaIlmReduction: 50_000 });
    expectRel(weak(1273), 0.9, 1e-12);
    expect(weak(1173)).toBeGreaterThan(at(1173, 4));
  });

  test("temperature now trades heat against conversion", () => {
    // Before v0.10 a cooler reactor only saved heat. Now it reduces less, so
    // the plant mines and heats more soil per kg of oxygen.
    const hot = simulate({ ...ILMENITE, TIlmReactor: 1273 });
    const cool = simulate({ ...ILMENITE, TIlmReactor: 1073 });
    expectRel(cool.ilmenite!.conversion, 0.454, 0.002);
    expect(cool.ilmenite!.soilPerKgO2).toBeGreaterThan(1.9 * hot.ilmenite!.soilPerKgO2);
    expect(cool.energy.secTotal_kWhPerKg).toBeGreaterThan(hot.energy.secTotal_kWhPerKg);
  });

  test("the bed holds the feed for its residence time and weighs in proportion", () => {
    const params = normalizeParams({ ...ILMENITE, tIlmResidenceH: 6 }).params;
    const ilmenite = simulate(params).ilmenite!;
    expectRel(ilmenite.bedHoldupKg, (ilmenite.concentrateKgPerDay / 24) * 6, 1e-12);
    expectRel(ilmenite.bedMassKg, params.kIlmBedMass * ilmenite.bedHoldupKg, 1e-12);
    expectRel(ilmenite.reactorMassKg, params.kIlmGasLoopMass * params.targetKgPerDay + ilmenite.bedMassKg, 1e-12);
    // At the defaults the split adds back to v0.8's 18.6 kg per kg/day of oxygen.
    const defaults = simulate(ILMENITE).ilmenite!;
    expectRel(defaults.reactorMassKg / DEFAULTS.targetKgPerDay, 18.6, 1e-3);
  });

  test("residence time has an optimum: a longer stay mines less soil but holds more", () => {
    const landed = (tIlmResidenceH: number) => simulate({ ...ILMENITE, tIlmResidenceH }).logistics.totalInfraMassKg;
    expect(landed(8)).toBeLessThan(landed(4));
    expect(landed(12)).toBeGreaterThan(landed(8));
    expect(landed(1)).toBeGreaterThan(landed(4));
  });
});

describe("basalt feed (v0.11)", () => {
  const BASALT: Partial<SimParams> = { ...ILMENITE, ilmFeed: "basalt" };

  test("the basalt chain is Eagle's Table 6-1, written out", () => {
    const params = normalizeParams(BASALT).params;
    const ilmenite = simulate(params).ilmenite!;
    const fed =
      1 /
      (params.fIlmBasalt * params.fBasaltSized * params.fIlmLiberated * params.etaIlmRecovery *
        ilmeniteConversion(params) * ilmeniteOxygenFraction());
    expectRel(ilmenite.basaltFedKgPerDay, fed * params.targetKgPerDay, 1e-12);
    expectRel(ilmenite.soilPerKgO2, fed / params.fBasaltInMined, 1e-12);
    expectRel(ilmenite.sizedSoilKgPerDay, ilmenite.basaltFedKgPerDay * params.fBasaltSized, 1e-12);
    // Comminution is charged on the basalt crushed; mining on layer plus overburden.
    expectRel(ilmenite.secBeneficiation_JPerKg, params.eIlmComminution * fed, 1e-12);
    expectRel(ilmenite.beneficiationMassKg, params.kIlmComminutionMass * ilmenite.basaltFedKgPerDay, 1e-12);
    expectRel(ilmenite.secMining_JPerKg, params.eMining * ilmenite.soilPerKgO2 * (1 + params.basaltOverburdenRatio), 1e-12);
  });

  test("each feed ignores the other's inputs, and both conserve mass", () => {
    const soil = simulate(ILMENITE);
    expect(simulate({ ...ILMENITE, fIlmBasalt: 0.2, fIlmLiberated: 0.4, fBasaltSized: 0.7, fBasaltInMined: 0.8, basaltOverburdenRatio: 3, eIlmComminution: 300_000, kIlmComminutionMass: 0.6 })).toEqual(soil);
    expect(soil.ilmenite!.basaltFedKgPerDay).toBe(0);
    const basalt = simulate(BASALT);
    expect(simulate({ ...BASALT, fIlmenite: 0.2, fIlmSized: 0.7, eIlmBeneficiation: 30_000, kIlmBeneficiationMass: 0.3 })).toEqual(basalt);
    expect(basalt.materials.maxAbsResidualKgPerDay).toBe(0);
    expect(basalt.energy.maxAbsResidualW).toBe(0);
    // Only the basalt enters the mill; the layer's soil and oversize are
    // rejected at the mine, and the two reject streams add up to the tailings.
    const ilm = basalt.ilmenite!;
    const mill = basalt.materials.balances.find((balance) => balance.id === "ilmenite-beneficiation")!;
    expect(mill.massInKgPerDay).toBe(ilm.basaltFedKgPerDay);
    const flow = (material: string) => basalt.materials.flows.find((item) => item.material === material)!.kgPerDay;
    expect(flow("layer-rejects")).toBeCloseTo(ilm.soilKgPerDay - ilm.basaltFedKgPerDay, 6);
    expect(flow("layer-rejects") + flow("tailings")).toBeCloseTo(ilm.tailingsKgPerDay, 6);
    expect(soil.materials.flows.some((item) => item.material === "layer-rejects")).toBe(false);
    // MRE ignores the feed choice.
    expect(simulate({ ilmFeed: "basalt" })).toEqual(simulate({}));
  });
});

