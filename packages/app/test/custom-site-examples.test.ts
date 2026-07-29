import {
  evaluateSiteDesign,
  parseSiteDesign,
  serializeSiteDesign
} from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import equatorial from "../../../docs/examples/custom-equatorial-first-camp.v1.json";
import polar from "../../../docs/examples/custom-shackleton-ice-camp.v1.json";

describe("published custom site examples", () => {
  it.each([
    ["equatorial", equatorial],
    ["polar", polar]
  ])("imports and evaluates the %s example deterministically", (_, fixture) => {
    const first = parseSiteDesign(fixture);
    expect(first.document).not.toBeNull();
    expect(first.findings.filter((finding) =>
      finding.severity === "error"
    )).toEqual([]);

    const evaluation = evaluateSiteDesign(first.document!);
    expect(evaluation.topologyValid).toBe(true);
    expect(evaluation.achievableOutputKgPerDay).toBeGreaterThan(0);

    const roundTrip = parseSiteDesign(
      JSON.parse(serializeSiteDesign(evaluation.normalizedDesign)) as unknown
    );
    expect(roundTrip.document).toEqual(evaluation.normalizedDesign);
  });
});
