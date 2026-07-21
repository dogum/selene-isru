import { describe, expect, test } from "vitest";
import { DEFAULTS } from "@selene-isru/engine";
import { traceParameter } from "../src/analysis/causal";
import { canonicalProfileJson, parseSiteProfileText } from "../src/lib/siteProfile";

describe("model-depth UI utilities", () => {
  test("runtime causal trace is based on executed output changes", () => {
    const trace = traceParameter("Vcell", DEFAULTS);
    expect(trace.nodes.some((node) => node.id === "mre-voltage")).toBe(true);
    expect(trace.nodes.some((node) => node.id === "kpi-sec")).toBe(true);
    expect(trace.nodes.some((node) => node.category === "kpi")).toBe(true);
  });

  test("runtime causal trace uses a genuinely local numeric perturbation", () => {
    const trace = traceParameter("targetKgPerDay", DEFAULTS);
    expect(trace.before).toBe(1000);
    expect(trace.after).toBeCloseTo(1010, 8);
  });

  test("parses canonical JSON profiles", () => {
    const parsed = parseSiteProfileText(JSON.stringify({ name: "JSON ridge", points: [
      { hour: 0, illumination: 1, receiverVisibility: 1, surfaceTemperatureK: 200 },
      { hour: 24, illumination: 0, receiverVisibility: 0.5, surfaceTemperatureK: 60 }
    ]}));
    expect(parsed.name).toBe("JSON ridge");
    expect(JSON.parse(canonicalProfileJson(parsed)).points).toHaveLength(2);
  });

  test("parses CSV profiles with optional fields", () => {
    const parsed = parseSiteProfileText(
      "hour,illumination,receiverVisibility,surfaceTemperatureK\n0,1,1,210\n12,0,0,50\n24,1,1,210",
      "ridge.csv"
    );
    expect(parsed.name).toBe("ridge");
    expect(parsed.points[1]).toEqual({ hour: 12, illumination: 0, receiverVisibility: 0, surfaceTemperatureK: 50 });
  });

  test("rejects non-monotonic profile hours", () => {
    expect(() => parseSiteProfileText("hour,illumination\n0,1\n0,0")).toThrow(/increase strictly/);
  });
});
