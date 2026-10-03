import { DEFAULTS, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { caseSummary, outputLabel, perKgBasis } from "../src/analysis/summary";

const run = (patch: Partial<SimParams>) => {
  const params = { ...DEFAULTS, ...patch };
  return { params, result: simulate(params) };
};

describe("plain case summary", () => {
  it("names what each reference chain actually produces", () => {
    const equatorial = run({ site: "equatorial" });
    expect(outputLabel(equatorial.params, equatorial.result)).toBe("O₂ OUTPUT");
    expect(caseSummary(equatorial.params, equatorial.result)).toMatch(
      /^Equatorial molten-regolith plant makes 1,000\u2009kg\/day liquid oxygen from 60\.4\u2009t landed in 1 landing on 996\u2009kW of nuclear power\. Its product repays the launch mass by day 242\.$/
    );
    const polar = run({ site: "polar" });
    expect(outputLabel(polar.params, polar.result)).toBe("WATER OUTPUT");
    expect(caseSummary(polar.params, polar.result)).toContain("water ice");
  });

  it("says what per-kg results are per kg of", () => {
    expect(perKgBasis(run({}).params, run({}).result)).toBe("product");
    expect(perKgBasis(run({ site: "polar" }).params, run({ site: "polar" }).result)).toBe("product");
    const propellant = run({ site: "polar", polarProduct: "propellant" });
    expect(perKgBasis(propellant.params, propellant.result)).toBe("water processed");
    const sabatier = run({ site: "polar", enableSabatier: true });
    expect(perKgBasis(sabatier.params, sabatier.result)).toBe("water processed");
  });

  it("names the propellant plant and its usable propellant", () => {
    const propellant = run({ site: "polar", polarProduct: "propellant" });
    expect(outputLabel(propellant.params, propellant.result)).toBe("WATER PROCESSED");
    expect(caseSummary(propellant.params, propellant.result)).toMatch(
      /^Polar ice-to-propellant plant makes 889\u2009kg\/day liquid oxygen and 111\u2009kg\/day liquid hydrogen \(778\u2009kg\/day usable at O\/F 6\) from /
    );
  });

  it("lists every product when the target stream is converted", () => {
    const sabatier = run({ site: "polar", enableSabatier: true });
    // The 1,000 kg/day target is water processed, not a product in its own right.
    expect(outputLabel(sabatier.params, sabatier.result)).toBe("WATER PROCESSED");
    const sentence = caseSummary(sabatier.params, sabatier.result);
    expect(sentence).toContain("liquid oxygen");
    expect(sentence).toContain("liquid methane");
    expect(sentence).not.toContain("water ice");
  });

  it("names a custom stored stream instead of leaving the product blank", () => {
    for (const site of ["equatorial", "polar"] as const) {
      const custom = run({ site, storageStream: "custom" });
      const sentence = caseSummary(custom.params, custom.result);
      expect(sentence).not.toMatch(/makes\s+from/);
      expect(sentence).toMatch(/makes 1,000\u2009kg\/day custom cryogen from/);
    }
  });

  it("says when the product does not repay its launch mass", () => {
    const pilot = run({ site: "polar", targetKgPerDay: 10 });
    expect(pilot.result.campaign.paysBackInCampaign).toBe(false);
    expect(caseSummary(pilot.params, pilot.result)).toMatch(/does not repay the launch mass within the campaign\.$/);
  });

  it("uses the engine's landing count and reports violated constraints", () => {
    const big = run({ site: "equatorial", targetKgPerDay: 20_000 });
    expect(caseSummary(big.params, big.result)).toContain(`${big.result.logistics.nMissions} landings`);
    const alarms = big.result.warnings.filter((warning) => warning.severity === "alarm").length;
    if (alarms > 0) expect(caseSummary(big.params, big.result)).toMatch(/violated\.$/);
  });
});
