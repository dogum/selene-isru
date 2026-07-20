import { DEFAULTS, simulate } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import {
  beamRadius,
  brickCount,
  excavatorLoopPeriodS,
  gridGlowIntensity,
  habitatShellSteps,
  padTileFraction,
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
