import { DEFAULTS, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { caseSummary, outputLabel } from "../src/analysis/summary";

const run = (patch: Partial<SimParams>) => {
  const params = { ...DEFAULTS, ...patch };
  return { params, result: simulate(params) };
};

describe("plain case summary", () => {
  it("names what each reference chain actually produces", () => {
    const equatorial = run({ site: "equatorial" });
    expect(outputLabel(equatorial.params, equatorial.result)).toBe("O₂ OUTPUT");
    expect(caseSummary(equatorial.params, equatorial.result)).toMatch(
      /^Equatorial molten-regolith plant makes 1,000\u2009kg\/day liquid oxygen from 59\u2009t landed in 1 landing on 1\.03\u2009MW of nuclear power\. Its product repays the launch mass by day 242\.$/
    );
    const polar = run({ site: "polar" });
    expect(outputLabel(polar.params, polar.result)).toBe("WATER OUTPUT");
    expect(caseSummary(polar.params, polar.result)).toContain("water ice");
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
