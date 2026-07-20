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
    expectRel(result.energy.secTotal_kWhPerKg, 24.7, 0.03);
    expectRel(result.energy.gridPowerW / 1000, 1030, 0.03);
    expectRel(pCritKw(1500, 250, 30) ?? 0, 6.818, 0.001);
    expectRel(secSubJPerKg(0.005, 800, 40, 263) / J_PER_KWH, 10.7, 0.01);
    expectRel(secSubJPerKg(0.05, 800, 40, 263) / J_PER_KWH, 1.78, 0.01);
    expect(result.logistics.nMissions).toBe(1);
    expect(result.logistics.paybackDays).toBe(result.logistics.totalInfraMassKg / 1000);
    expect(result.logistics.paybackDays).toBeGreaterThanOrEqual(55);
    expect(result.logistics.paybackDays).toBeLessThanOrEqual(62);
    expectRel(shieldFullBalanceM(101325, 3000), 20.85, 0.005);
    expect(payloadPerMissionKg(DEFAULTS)).toBeGreaterThanOrEqual(95_000);
    expect(payloadPerMissionKg(DEFAULTS)).toBeLessThanOrEqual(107_000);
    expect(result.construction.padsPerYear).toBeGreaterThanOrEqual(1.8);
    expect(result.construction.padsPerYear).toBeLessThanOrEqual(2.2);
    expect(sabatierKp(523)).toBeGreaterThan(sabatierKp(723));
    expect(sabatierKp(723)).toBeGreaterThan(0);
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
