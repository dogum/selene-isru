import { DEFAULTS, simulate } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import {
  beamRadius,
  brickCount,
  excavatorLoopPeriodS,
  gridGlowFromPower,
  gridGlowIntensity,
  habitatShellSteps,
  isDaylight,
  isLanderPresent,
  loadScale,
  missionFlagCount,
  panelRackCount,
  meltThermalLoad,
  padTileFraction,
  reactorActivity,
  receiverGlow,
  reserveFillFraction,
  shieldSectionCount,
  DAYLIGHT_ILLUMINATION_FLOOR,
  MELT_LOAD_FLOOR_K,
  MISSION_FLAG_CAP,
  PANEL_RACK_MAX,
  MELT_LOAD_SPAN_K,
  REACTOR_FULL_CURRENT_A,
  RECEIVER_GLOW_DARK,
  radiatorWingScale,
  solarPanelCount,
  tankCount,
  tankFillFraction
} from "../src/viewer/bindings";

describe("bindings clamp behavior (§3.4)", () => {
  it("excavator loop period maps log [1e3,1e5] kg/day → [60,8] s and clamps", () => {
    expect(excavatorLoopPeriodS(0)).toBe(60);
    expect(excavatorLoopPeriodS(1e3)).toBe(60);
    expect(excavatorLoopPeriodS(1e5)).toBeCloseTo(8, 6);
    expect(excavatorLoopPeriodS(1e9)).toBeCloseTo(8, 6);
    expect(excavatorLoopPeriodS(1e4)).toBeCloseTo(34, 6);
  });

  it("grid glow maps log [1e4,1e7] W → [0.2,2.0] and clamps", () => {
    expect(gridGlowIntensity(0)).toBe(0.2);
    expect(gridGlowIntensity(1e4)).toBe(0.2);
    expect(gridGlowIntensity(1e7)).toBeCloseTo(2.0, 6);
    expect(gridGlowIntensity(1e12)).toBeCloseTo(2.0, 6);
  });

  it("solar panels: 1 per 20 m², capped at 400", () => {
    expect(solarPanelCount(0)).toBe(0);
    expect(solarPanelCount(200)).toBe(10);
    expect(solarPanelCount(1e7)).toBe(400);
  });

  it("radiator wing scale is sqrt-area clamped ×0.4–×3", () => {
    expect(radiatorWingScale(0)).toBe(0.4);
    expect(radiatorWingScale(150)).toBeCloseTo(1, 6);
    expect(radiatorWingScale(1e9)).toBe(3);
  });

  it("pad fraction and habitat steps quantize sanely", () => {
    expect(padTileFraction(0.4)).toBeCloseTo(0.4, 9);
    expect(padTileFraction(7)).toBe(1);
    expect(habitatShellSteps(2.5)).toBe(5);
    expect(habitatShellSteps(0)).toBe(1);
    expect(habitatShellSteps(1e4)).toBe(42);
  });

  it("beam radius is zero when off, log-scaled when on", () => {
    expect(beamRadius(null)).toBe(0);
    expect(beamRadius(0)).toBe(0);
    expect(beamRadius(1e4)).toBeGreaterThan(0);
    expect(beamRadius(1e12)).toBeLessThanOrEqual(0.4 + 2.2);
  });

  it("brick and tank counts stay within instance caps for extreme results", () => {
    const result = simulate({ targetKgPerDay: 20000 });
    expect(brickCount(result.construction.slagPerYearT)).toBeLessThanOrEqual(360);
    expect(tankCount({ ...DEFAULTS, targetKgPerDay: 20000, reserveDays: 120, rhoCryo: 70 })).toBeLessThanOrEqual(8);
    expect(tankCount({ ...DEFAULTS, targetKgPerDay: 10 })).toBeGreaterThanOrEqual(1);
  });

  it("tank fill fraction stays in [0,1]", () => {
    const result = simulate({});
    const f = tankFillFraction(result);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});

describe("scene mappings that depend on engine output ranges", () => {
  it("reactor activity spans its clamp over the current range", () => {
    expect(reactorActivity(0)).toBe(0.08);
    expect(reactorActivity(REACTOR_FULL_CURRENT_A)).toBe(1);
    expect(reactorActivity(REACTOR_FULL_CURRENT_A * 10)).toBe(1);
    expect(reactorActivity(REACTOR_FULL_CURRENT_A / 2)).toBeCloseTo(0.5, 6);
  });

  it("melt thermal load normalizes over the melt band", () => {
    expect(meltThermalLoad(MELT_LOAD_FLOOR_K)).toBe(0);
    expect(meltThermalLoad(MELT_LOAD_FLOOR_K + MELT_LOAD_SPAN_K)).toBe(1);
    expect(meltThermalLoad(0)).toBe(0);
    expect(meltThermalLoad(9_999)).toBe(1);
  });

  it("shield section count stays within the drawable range", () => {
    expect(shieldSectionCount(0)).toBeGreaterThanOrEqual(1);
    expect(shieldSectionCount(100)).toBeLessThanOrEqual(6);
    for (const m of [0, 0.5, 1, 2, 5, 20]) {
      const n = shieldSectionCount(m);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("grid glow is bounded and rises with power", () => {
    expect(gridGlowFromPower(0)).toBeLessThanOrEqual(2.8);
    expect(gridGlowFromPower(1e12)).toBeLessThanOrEqual(2.8);
    expect(gridGlowFromPower(1e7)).toBeGreaterThan(gridGlowFromPower(1e4));
  });

  it("load scale caps overload and survives a zero grid", () => {
    expect(loadScale(500, 1000)).toBeCloseTo(0.5, 6);
    expect(loadScale(5000, 1000)).toBe(1.4);
    expect(loadScale(500, 0)).toBe(1);
  });

  it("receiver glow floors dark and rises with delivered fraction", () => {
    expect(receiverGlow(0, 1)).toBe(RECEIVER_GLOW_DARK);
    expect(receiverGlow(1, 1)).toBeCloseTo(1.1, 6);
    expect(receiverGlow(0.5, 1)).toBeGreaterThan(receiverGlow(0.25, 1));
  });

  it("daylight threshold is exclusive at the floor", () => {
    expect(isDaylight(DAYLIGHT_ILLUMINATION_FLOOR)).toBe(false);
    expect(isDaylight(DAYLIGHT_ILLUMINATION_FLOOR + 1e-6)).toBe(true);
    expect(isDaylight(0)).toBe(false);
  });

  it("mission flags are capped and the lander appears on the first mission", () => {
    expect(missionFlagCount(0)).toBe(0);
    expect(missionFlagCount(5)).toBe(5);
    expect(missionFlagCount(MISSION_FLAG_CAP + 40)).toBe(MISSION_FLAG_CAP);
    expect(missionFlagCount(-3)).toBe(0);
    expect(isLanderPresent(0)).toBe(false);
    expect(isLanderPresent(0.5)).toBe(false);
    expect(isLanderPresent(1)).toBe(true);
  });

  it("panel racks stay within 1-12 for any instance count", () => {
    expect(panelRackCount(0, 400)).toBe(1);
    expect(panelRackCount(400, 400)).toBe(PANEL_RACK_MAX);
    expect(panelRackCount(1e6, 400)).toBe(PANEL_RACK_MAX);
    expect(panelRackCount(10, 0)).toBeGreaterThanOrEqual(1);
    for (const n of [0, 1, 33, 200, 399, 400]) {
      const racks = panelRackCount(n, 400);
      expect(racks).toBeGreaterThanOrEqual(1);
      expect(racks).toBeLessThanOrEqual(PANEL_RACK_MAX);
    }
  });

  it("reserve fill fraction stays in [0,1] and handles a zero reserve", () => {
    expect(reserveFillFraction(0, 10, 1000)).toBe(0);
    expect(reserveFillFraction(5_000, 10, 1000)).toBeCloseTo(0.5, 6);
    expect(reserveFillFraction(1e9, 10, 1000)).toBe(1);
    expect(reserveFillFraction(10, 0, 0)).toBe(1);
  });
});
