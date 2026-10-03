import { DEFAULTS, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
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

  it("names what the polar plant stores in its product flow", () => {
    const productEdge = (patch: Partial<SimParams>) => {
      const params: SimParams = { ...DEFAULTS, site: "polar", ...patch };
      return processEdges(simulate(params), params).find((edge) => edge.from === "receiver" && edge.to === "tanks")!;
    };
    expect(productEdge({}).shortLabel).toBe("WATER PRODUCT");
    const propellant = productEdge({ polarProduct: "propellant" });
    expect(propellant.shortLabel).toBe("LOX + LH₂");
    expect(propellant.label).toMatch(/^LOX 889\u2009KG\/DAY · LH₂ 111\u2009KG\/DAY$/);
    // The Sabatier loop sets the products whatever the polar product says.
    expect(productEdge({ polarProduct: "propellant", enableSabatier: true }).shortLabel).toBe("O₂ + CH₄");
  });

  it("adds structured maturity, uncertainty, range rationale, and source URLs to controls", () => {
    const voltage = paramsForGroup("electrolysis").find((param) => param.key === "Vcell");
    expect(voltage?.evidence.maturity).toBeTruthy();
    expect(voltage?.evidence.sourceUrl).toMatch(/^https:\/\//);
    expect(voltage?.evidence.rangeRationale).toContain("operating envelope");
    expect(voltage?.evidence.defaultUncertainty).toBeGreaterThan(0);
  });
});
