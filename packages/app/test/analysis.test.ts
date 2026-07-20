import { DEFAULTS, simulate } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { assetKnowledge, connectedAssets, processEdges } from "../src/analysis/process";
import { paramsForGroup } from "../src/controls/manifest";

describe("progressive engineering analysis", () => {
  it("publishes live directional flow values and selected-system connections", () => {
    const params = { ...DEFAULTS, site: "equatorial" as const };
    const result = simulate(params);
    const edges = processEdges(result, params);
    expect(edges.some((edge) => edge.from === "station" && edge.to === "reactor" && edge.label.includes("GRID POWER"))).toBe(true);
    expect(edges.some((edge) => edge.from === "reactor" && edge.to === "castingYard" && edge.label.includes("SLAG"))).toBe(true);
    expect(connectedAssets(result, params, "reactor")).toEqual(expect.arrayContaining(["hauler", "station", "tanks", "castingYard"]));
    expect(assetKnowledge("equatorial", "reactor")?.assumptions.length).toBeGreaterThan(1);
  });

  it("adds structured maturity, uncertainty, range rationale, and source URLs to controls", () => {
    const voltage = paramsForGroup("electrolysis").find((param) => param.key === "Vcell");
    expect(voltage?.evidence.maturity).toBeTruthy();
    expect(voltage?.evidence.sourceUrl).toMatch(/^https:\/\//);
    expect(voltage?.evidence.rangeRationale).toContain("operating envelope");
    expect(voltage?.evidence.defaultUncertainty).toBeGreaterThan(0);
  });
});
