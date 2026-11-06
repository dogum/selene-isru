import { describe, expect, test } from "vitest";
import { normalizeParams, nuclearSlopeAtYear, nuclearSpecificKgPerKw, pCritDynamicKw, shieldMassKg, shieldRefKwe, simulate, solarSlopeAtYear } from "../src/index";

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
 * The chart's nuclear slope is the engine's: the fission specific mass with its
 * radiator. The engine's own crossover and nuclear mass must be rebuilt from it.
 */
describe("the nuclear slope carries the radiator", () => {
  test.each([{}, { Tsink: 400 }, { site: "polar" as const, kRadiatorKgPerM2: 10 }])("%o", (input) => {
    const params = normalizeParams(input).params;
    const result = simulate(params);
    const kw = result.energy.gridPowerW / 1000;
    const alpha = result.power.nuclearSpecificKgPerKw;
    expect(alpha).toBe(nuclearSpecificKgPerKw(params));
    // v0.21: the shield follows the reactor heat; on electrical output its reference is shieldRefKwe.
    const refKwe = shieldRefKwe(params);
    const shieldAt = (pKw: number) => shieldMassKg(params.MshieldKg, refKwe, params.nShield, pKw);
    expect(Math.abs(result.power.nuclearMassKg - (shieldAt(kw) + alpha * kw))).toBeLessThan(1e-9 * result.power.nuclearMassKg);
    const beta = result.power.solarMassKg / kw;
    const dynamic = pCritDynamicKw(params.MshieldKg, beta, alpha, params.dSolar, params.dNuclear, params.missionYears, refKwe, params.nShield);
    expect(result.power.pCritDynamicW).toBe(dynamic === null ? 0 : dynamic * 1000);
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
