import { describe, expect, test } from "vitest";
import {
  DEFAULTS,
  meltHeatJPerKg,
  oxideModelYield,
  payloadPerMissionKg,
  pCritKw,
  sabatierKp,
  secElecJPerKg,
  secSubJPerKg,
  shieldFullBalanceM,
  simulate
} from "../src/index";
import { simulateConstruction } from "../src/modules/construction";
import { simulatePower } from "../src/modules/power";
import type { SimParams } from "../src/types";

const J_PER_KWH = 3_600_000;

function expectRel(actual: number, expected: number, relTol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relTol);
}

function warningIds(result: { warnings: Array<{ id: string }> }): Set<string> {
  return new Set(result.warnings.map((warning) => warning.id));
}

describe("regression anchors", () => {
  test("matches the research-derived headline values", () => {
    const result = simulate({});

    expectRel(secElecJPerKg(4.2, 0.9) / J_PER_KWH, 15.63, 0.005);
    expectRel(result.electrolysis.xO2Effective, 0.225, 1e-9);
    expectRel(
      result.electrolysis.oxideYield.reduce((total, row) => total + row.o2KgPerKg, 0),
      result.electrolysis.xO2Effective,
      1e-12
    );
    expect(result.electrolysis.oxideYield.every((row) => row.decomposed)).toBe(true);
    expectRel(meltHeatJPerKg(DEFAULTS), 2_099_805, 1e-9);
    // v0.6 moved these from 24.78 kWh/kg and 1,032 kW: LOX conditioning is now
    // 1.32 kWh/kg, derived from NASA's polar propellant case, not 2.2 (uncited).
    expectRel(result.energy.secTotal_kWhPerKg, 23.9, 0.03);
    expectRel(result.energy.gridPowerW / 1000, 996, 0.03);
    expectRel(pCritKw(1500, 250, 30) ?? 0, 6.818, 0.001);
    expectRel(secSubJPerKg(0.005, 800, 40, 263) / J_PER_KWH, 10.7, 0.01);
    expectRel(secSubJPerKg(0.05, 800, 40, 263) / J_PER_KWH, 1.78, 0.01);
    expect(result.logistics.nMissions).toBe(1);
    expect(result.logistics.plantMassThroughputDays).toBe(result.logistics.totalInfraMassKg / 1000);
    expect(result.logistics.plantMassThroughputDays).toBeGreaterThanOrEqual(55);
    expect(result.logistics.plantMassThroughputDays).toBeLessThanOrEqual(62);
    expectRel(shieldFullBalanceM(101325, 3000), 20.85, 0.005);
    expect(payloadPerMissionKg(DEFAULTS)).toBeGreaterThanOrEqual(95_000);
    expect(payloadPerMissionKg(DEFAULTS)).toBeLessThanOrEqual(107_000);
    expect(result.construction.padsPerYear).toBeGreaterThanOrEqual(1.8);
    expect(result.construction.padsPerYear).toBeLessThanOrEqual(2.2);
    expect(sabatierKp(523)).toBeGreaterThan(sabatierKp(723));
    expect(sabatierKp(723)).toBeGreaterThan(0);
  });

  test("polar chain charges capture loss, heater loss, and extractor mass (v0.4)", () => {
    // v0.4 deliberately moved these from 2.814 kWh/kg and 19.5 t: the polar
    // chain had no capture loss, a lower-bound heater, and no extractor mass.
    const polar = simulate({ site: "polar" });
    expect(polar.production.regolithKgPerDay).toBeCloseTo(1000 / (0.05 * 0.75), 9);
    expectRel(polar.thermal.extractorMassKg, 4800, 1e-9);
    expectRel(polar.thermal.secSub_JPerKg! / J_PER_KWH, 1.78 / 0.75, 0.01);
    expectRel(polar.energy.secTotal_kWhPerKg, 7.24, 0.01);
    expectRel(polar.logistics.totalInfraMassKg / 1000, 29.85, 0.01);
    expect(polar.materials.maxAbsResidualKgPerDay).toBe(0);
  });

  test("campaign ledger pays the equatorial default back on day ~242 (v0.5)", () => {
    // v0.5 adds the ledger; no earlier number moves. Payback is commissioning
    // plus one 1,100 t lander divided by the daily net LEO-mass saving.
    const { logistics, campaign } = simulate({});
    const leoPerKg = DEFAULTS.M0leo / (DEFAULTS.etaPack * logistics.payloadPerMissionKg);
    const netPerDay =
      DEFAULTS.gearRatio * DEFAULTS.targetKgPerDay * DEFAULTS.plantAvailability -
      (leoPerKg * DEFAULTS.sparesFracPerYear * logistics.totalInfraMassKg) / 365;
    expectRel(campaign.leoMassPerLandedKg, leoPerKg, 1e-12);
    expectRel(campaign.paybackDays!, DEFAULTS.commissioningDays + DEFAULTS.M0leo / netPerDay, 1e-12);
    expectRel(campaign.paybackDays!, 242.0, 0.001);
    expectRel(campaign.returnRatio, 6.63, 0.001);
    expectRel(campaign.leoMassPerLandedKg, 12.82, 0.001);
    expect(campaign.paysBackInCampaign).toBe(true);
    // The Sabatier loop's CO2 is landed from Earth and outweighs its products' saving.
    const sabatier = simulate({ site: "polar", enableSabatier: true }).campaign;
    expect(sabatier.paybackDays).toBeNull();
    expectRel(sabatier.returnRatio, 0.793, 0.001);
  });

  test("polar propellant mode splits water into LOX and LH2 (v0.6)", () => {
    const propellant = simulate({ site: "polar", polarProduct: "propellant" });
    const { production, cryo, energy, logistics, campaign } = propellant;
    // 1,000 kg/day of water gives 888.9 kg O2 and 111.1 kg H2; at O/F 6 the
    // hydrogen sets 777.8 kg/day of propellant and 222.2 kg/day of O2 is surplus.
    expectRel(production.o2KgPerDay, 888.9, 0.001);
    expectRel(production.h2KgPerDay, 111.1, 0.001);
    expectRel(production.propellantKgPerDay, 7 * production.h2KgPerDay, 1e-12);
    expectRel(production.excessO2KgPerDay, production.o2KgPerDay - 6 * production.h2KgPerDay, 1e-12);
    expect(cryo.inventories.map((item) => item.stream)).toEqual(["water-ice", "lox", "lh2"]);
    expectRel(cryo.inventories[2]!.liquefierMassKg, 233 * production.h2KgPerDay, 1e-12);
    expectRel(energy.secTotal_kWhPerKg, 20.78, 0.001);
    expectRel(logistics.totalInfraMassKg / 1000, 82.35, 0.001);
    expectRel(campaign.paybackDays!, 311.3, 0.001);
    // Leverage and throughput days are measured against usable propellant,
    // not the water processed (deliberately moved from 133x and 82.4 days).
    expect(logistics.productKgPerDay).toBe(production.propellantKgPerDay);
    expectRel(logistics.plantMassThroughputDays, logistics.totalInfraMassKg / production.propellantKgPerDay, 1e-12);
    expectRel(logistics.leverageL, 103.4, 0.001);
    // The Sabatier loop is measured against its products, imported carbon included.
    const sabatier = simulate({ site: "polar", enableSabatier: true });
    const p = sabatier.production;
    expect(sabatier.logistics.productKgPerDay).toBe(p.o2KgPerDay + p.ch4KgPerDay + p.h2KgPerDay);
    expectRel(sabatier.logistics.leverageL, 186.0, 0.001);
    expect(propellant.materials.maxAbsResidualKgPerDay).toBe(0);
    expect(energy.maxAbsResidualW).toBe(0);
  });

  test("keeps the v1 aggregate electrolysis path reachable", () => {
    const fallback = simulate({ oxideModel: false });
    const direct = oxideModelYield({ ...DEFAULTS, oxideModel: false });
    expectRel(fallback.electrolysis.xO2Effective, DEFAULTS.xO2 * DEFAULTS.fExtract, 1e-12);
    expect(fallback.electrolysis.xO2Effective).toBe(direct.xO2Effective);
    expectRel(fallback.energy.secTotal_kWhPerKg, simulate({}).energy.secTotal_kWhPerKg, 1e-9);
  });
});

describe("warnings", () => {
  test("public simulate() emits reachable warnings", () => {
    expect(warningIds(simulate({ jOperating: 10000, Dox: 1e-11 })).has("anode-current")).toBe(true);
    expect(warningIds(simulate({ castDeltaT: 200 })).has("thermal-stress")).toBe(true);
    expect(warningIds(simulate({ targetKgPerDay: 1 })).has("param-clamped")).toBe(true);
    expect(warningIds(simulate({ M0leo: 500_000, dvTotal: 6500, IspLander: 310, MdryLander: 200_000 })).has("lander-no-payload")).toBe(true);
  });

  test("module-level tests cover branches outside bounded public inputs", () => {
    const constructionParams: SimParams = {
      ...DEFAULTS,
      rhoGasPlume: 0.1,
      vGasPlume: 4000,
      Cf: 0.02,
      tauAllowable: 100,
      FS: 4
    };
    const construction = simulateConstruction(constructionParams, 1000);
    expect(construction.warnings.some((warning) => warning.id === "pad-shear")).toBe(true);

    const powerParams: SimParams = { ...DEFAULTS, alphaSpecific: 1000 };
    const power = simulatePower(powerParams, 1000);
    expect(power.warnings.some((warning) => warning.id === "beta-le-alpha")).toBe(true);
  });
});
