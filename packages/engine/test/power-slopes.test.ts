import { describe, expect, test } from "vitest";
import { fissionCrossoverKw, normalizeParams, nuclearMassAtKwe, nuclearSlopeAtYear, nuclearSpecificKgPerKw, pCritDynamicKw, shieldMassKg, simulate, solarSlopeAtYear } from "../src/index";

/**
 * The power-trade chart plots the two aging slopes and marks the crossover.
 * Both must come from the same equations, or the plotted curves and the
 * plotted crossover disagree. These assertions fail if pCritDynamicKw is ever
 * re-derived independently of the exported slopes.
 */
describe("aging slopes agree with the dynamic crossover", () => {
  const cases = [
    { MshieldKg: 4000, beta: 12, alpha: 5, dSolar: 0.01, dNuclear: 0.02, tYears: 0 },
    { MshieldKg: 4000, beta: 12, alpha: 5, dSolar: 0.01, dNuclear: 0.02, tYears: 10 },
    { MshieldKg: 250, beta: 30, alpha: 2.5, dSolar: 0.005, dNuclear: 0, tYears: 7.5 },
    { MshieldKg: 9000, beta: 8, alpha: 6, dSolar: 0.03, dNuclear: 0.04, tYears: 20 }
  ];

  test.each(cases)("Mshield=$MshieldKg t=$tYears", (c) => {
    const betaT = solarSlopeAtYear(c.beta, c.dSolar, c.tYears);
    const alphaT = nuclearSlopeAtYear(c.alpha, c.dNuclear, c.tYears);
    const fromSlopes = betaT > alphaT ? c.MshieldKg / (betaT - alphaT) : null;
    expect(pCritDynamicKw(c.MshieldKg, c.beta, c.alpha, c.dSolar, c.dNuclear, c.tYears)).toBe(fromSlopes);
  });

  test("at t=0 the slopes reduce to their undegraded inputs", () => {
    expect(solarSlopeAtYear(12, 0.01, 0)).toBe(12);
    expect(nuclearSlopeAtYear(5, 0.02, 0)).toBe(5);
  });

  test("solar degrades and nuclear derates as t grows", () => {
    expect(solarSlopeAtYear(12, 0.01, 10)).toBeGreaterThan(solarSlopeAtYear(12, 0.01, 0));
    expect(nuclearSlopeAtYear(5, 0.02, 10)).toBeGreaterThan(nuclearSlopeAtYear(5, 0.02, 0));
  });

  test("a non-positive denominator has no crossover", () => {
    expect(pCritDynamicKw(4000, 5, 12, 0.01, 0.02, 1)).toBeNull();
  });
});

/**
 * The chart draws the engine's fission mass curve, nuclearMassAtKwe, and marks
 * the engine's crossover. The engine's own nuclear mass and crossovers must be
 * rebuilt from that curve, so the chart and the engine agree.
 */
describe("the nuclear curve is the engine's", () => {
  test.each([{}, { Tsink: 400 }, { site: "polar" as const, kRadiatorKgPerM2: 10 }, { bFissionScale: 0.8 }])("%o", (input) => {
    const params = normalizeParams(input).params;
    const result = simulate(params);
    const kw = result.energy.gridPowerW / 1000;
    expect(result.power.nuclearSpecificKgPerKw).toBe(nuclearSpecificKgPerKw(params, kw));
    expect(Math.abs(result.power.nuclearMassKg - nuclearMassAtKwe(params, kw))).toBeLessThan(1e-9 * result.power.nuclearMassKg);
    const beta = result.power.solarMassKg / kw;
    const dynamic = fissionCrossoverKw(params, beta, params.missionYears);
    expect(result.power.pCritDynamicW).toBe(dynamic === null ? 0 : dynamic * 1000);
    // At the aged crossover the aged solar line meets the aged fission curve.
    if (dynamic !== null) {
      const solar = solarSlopeAtYear(beta, params.dSolar, params.missionYears) * dynamic;
      expect(Math.abs(solar - nuclearMassAtKwe(params, dynamic, params.missionYears))).toBeLessThan(1e-9 * solar);
    }
  });
});

/**
 * The chart draws the nuclear curve as the scaled shield plus the aged slope.
 * Where the crossover sits above the shield's reference power, both curves must
 * meet there.
 */
describe("the crossover meets a shield that grows with power", () => {
  test.each([
    { MshieldKg: 1676, beta: 400, alpha: 30, refKw: 2, n: 0.33 },
    { MshieldKg: 4000, beta: 60, alpha: 25, refKw: 10, n: 0.5 },
    { MshieldKg: 1676, beta: 900, alpha: 30, refKw: 46, n: 0.33 }
  ])("Mshield=$MshieldKg ref=$refKw n=$n", (c) => {
    const p = pCritDynamicKw(c.MshieldKg, c.beta, c.alpha, 0, 0, 0, c.refKw, c.n)!;
    const nuclear = shieldMassKg(c.MshieldKg, c.refKw, c.n, p) + c.alpha * p;
    expect(Math.abs(c.beta * p - nuclear)).toBeLessThan(1e-9 * c.beta * p);
  });
});
