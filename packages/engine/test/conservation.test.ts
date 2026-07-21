import { describe, expect, test } from "vitest";
import { simulate } from "../src/index";

describe("conservation and operating-mode invariants", () => {
  test.each([
    { site: "equatorial" as const, enableSabatier: false },
    { site: "polar" as const, enableSabatier: false },
    { site: "polar" as const, enableSabatier: true }
  ])("conserves reported material at every process node: $site/$enableSabatier", (params) => {
    const result = simulate(params);
    expect(result.materials.balances.length).toBeGreaterThan(0);
    expect(result.materials.maxAbsResidualKgPerDay).toBeLessThanOrEqual(1e-6);
  });

  test("reports a complete 1 t/day Sabatier ledger", () => {
    const result = simulate({ site: "polar", enableSabatier: true, targetKgPerDay: 1000, fConversion: 0.95 });
    expect(result.production.grossH2KgPerDay).toBeCloseTo(111.111111, 5);
    expect(result.production.o2KgPerDay).toBeCloseTo(888.888889, 5);
    expect(result.production.co2ImportedKgPerDay).toBeCloseTo(580.555556, 5);
    expect(result.production.ch4KgPerDay).toBeCloseTo(211.111111, 5);
    expect(result.production.waterRecycleKgPerDay).toBeCloseTo(475, 5);
    expect(result.production.h2KgPerDay).toBeCloseTo(5.555556, 5);
  });

  test("separates passive, limited, and zero-boil-off heat accounting", () => {
    const zero = simulate({ cryoControlMode: "zero-boiloff" }).cryo;
    expect(zero.qRemovedW).toBeCloseTo(zero.qLeakW, 10);
    expect(zero.qResidualW).toBe(0);
    expect(zero.boiloffKgPerDay).toBe(0);

    const passive = simulate({ cryoControlMode: "passive" }).cryo;
    expect(passive.qRemovedW).toBe(0);
    expect(passive.cryocoolerPowerW).toBe(0);
    expect(passive.qResidualW).toBeCloseTo(passive.qLeakW, 10);
    expect(passive.boiloffKgPerDay).toBeCloseTo(passive.unmitigatedBoiloffKgPerDay, 10);

    const limited = simulate({ cryoControlMode: "capacity-limited", coolerCapacityW: 10 }).cryo;
    expect(limited.qRemovedW).toBeCloseTo(Math.min(limited.qLeakW, 10), 10);
    expect(limited.qResidualW).toBeCloseTo(Math.max(0, limited.qLeakW - 10), 10);
  });

  test("resolves product streams by site and makes beamed power architecture-aware", () => {
    expect(simulate({ site: "equatorial" }).cryo.stream).toBe("lox");
    expect(simulate({ site: "polar" }).cryo.stream).toBe("water-ice");
    expect(simulate({ site: "polar" }).power.beamedFloorPowerW).toBeNull();

    const solar = simulate({
      site: "polar",
      targetKgPerDay: 10,
      MshieldKg: 8000,
      alphaSpecific: 90,
      Rarray: 5,
      SEstorage: 1500
    });
    expect(solar.power.architecture).toBe("solar");
    expect(solar.power.beamedFloorPowerW).not.toBeNull();
    expect(solar.power.beamDeliveryMarginW ?? -1).toBeGreaterThanOrEqual(0);
  });
});
