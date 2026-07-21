import { describe, expect, test } from "vitest";
import { simulate, simulateTimeseries } from "../src/index";

const PROFILE = JSON.stringify({
  version: 1,
  name: "Test ridge cycle",
  points: [
    { hour: 0, illumination: 1, receiverVisibility: 1, surfaceTemperatureK: 210 },
    { hour: 8, illumination: 0, receiverVisibility: 0, surfaceTemperatureK: 60 },
    { hour: 16, illumination: 0, receiverVisibility: 0.5, surfaceTemperatureK: 50 },
    { hour: 24, illumination: 1, receiverVisibility: 1, surfaceTemperatureK: 210 }
  ]
});

describe("v0.3 model-depth ledgers", () => {
  test("sizes every active Sabatier stream independently", () => {
    const result = simulate({ site: "polar", enableSabatier: true });
    expect(result.cryo.inventories.map((item) => item.stream)).toEqual(["water-ice", "lox", "lh2", "lch4", "co2-feed"]);
    expect(result.cryo.totalStorageMassKg).toBeCloseTo(result.cryo.inventories.reduce((total, item) => total + item.storageMassKg, 0), 8);
    expect(result.cryo.totalReserveVolumeM3).toBeCloseTo(result.cryo.inventories.reduce((total, item) => total + item.volumeM3, 0), 8);
    expect(result.cryo.totalConditioningPowerW).toBeCloseTo(result.cryo.inventories.reduce((total, item) => total + item.conditioningPowerW, 0), 8);
    expect(result.cryo.inventories.every((item) => item.reserveInventoryKg === item.rateKgPerDay * 30)).toBe(true);
  });

  test("retains an explicit single-stream what-if mode", () => {
    const result = simulate({ site: "polar", enableSabatier: true, storageStream: "lch4" });
    expect(result.cryo.inventories).toHaveLength(1);
    expect(result.cryo.inventories[0]!.stream).toBe("lch4");
    expect(result.cryo.inventories[0]!.rateKgPerDay).toBe(1000);
  });

  test.each([
    { site: "equatorial" as const, enableSabatier: false },
    { site: "polar" as const, enableSabatier: false },
    { site: "polar" as const, enableSabatier: true }
  ])("closes declared process energy at every node: $site/$enableSabatier", (params) => {
    const result = simulate(params);
    expect(result.energy.balances.length).toBeGreaterThan(0);
    expect(result.energy.gridAllocationResidualW).toBe(0);
    expect(result.energy.maxAbsResidualW).toBe(0);
    expect(result.energy.balances.every((item) => item.residualW === 0)).toBe(true);
  });

  test("decomposes the default MRE voltage and exposes electrode sizing", () => {
    const result = simulate({});
    const e = result.electrolysis;
    expect(e.reversibleVoltageV + e.activationOverpotentialV + e.ohmicOverpotentialV + e.concentrationOverpotentialV + e.unallocatedVoltageV).toBeCloseTo(e.cellVoltageV, 10);
    expect(e.electrodeAreaM2).toBeCloseTo(e.currentA / e.jOperating_APerM2, 10);
    expect(e.currentUtilization).toBeCloseTo(e.jOperating_APerM2 / e.jLimit_APerM2, 10);
    expect(e.electricalInputW).toBeCloseTo(e.chemicalPowerW + e.modeledLossPowerW, 8);
    expect(simulate({ jOperating: 2400 }).electrolysis.ohmicOverpotentialV).toBeGreaterThan(e.ohmicOverpotentialV);
  });

  test("imports and samples a deterministic polar site profile", () => {
    const params = { site: "polar" as const, polarProfileMode: "profile" as const, polarProfileData: PROFILE };
    const result = simulate(params);
    expect(result.power.siteProfile.mode).toBe("profile");
    expect(result.power.siteProfile.name).toBe("Test ridge cycle");
    expect(result.power.siteProfile.cycleHours).toBe(24);
    expect(result.power.siteProfile.averageIllumination).toBeCloseTo(1 / 3, 8);
    expect(result.power.siteProfile.averageDeliveredFraction).toBeCloseTo(1 / 4, 8);
    expect(result.power.siteProfile.averageDeliveredFraction).not.toBeCloseTo(
      result.power.siteProfile.averageIllumination * result.power.siteProfile.averageReceiverVisibility,
      8
    );
    expect(result.power.siteProfile.longestReceiverOutageHours).toBeGreaterThan(8);
    const time = simulateTimeseries(params, { cycles: 1, samplesPerCycle: 12 });
    expect(time.points.some((point) => point.illumination < 0.05)).toBe(true);
    expect(time.points.some((point) => point.receiverVisibility < 1)).toBe(true);
    expect(Math.min(...time.points.map((point) => point.surfaceTemperatureK))).toBeLessThan(100);
  });

  test("rejects invalid profile payloads visibly", () => {
    const result = simulate({ site: "polar", polarProfileMode: "profile", polarProfileData: "{bad" });
    expect(result.power.siteProfile.mode).toBe("scalar");
    expect(result.warnings.some((warning) => warning.id === "polar-profile-invalid")).toBe(true);
  });
});
