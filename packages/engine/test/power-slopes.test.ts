import { describe, expect, test } from "vitest";
import { nuclearSlopeAtYear, pCritDynamicKw, solarSlopeAtYear } from "../src/index";

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
