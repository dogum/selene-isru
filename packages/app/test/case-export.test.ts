// @vitest-environment jsdom
import { DEFAULTS, PARAM_META, SEEDED_SITE_DESIGN_FIXTURES, simulate, simulateSiteDesignTimeseries } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { CASE_SCHEMA, caseExport, resultDrift } from "../src/analysis/caseExport";
import { changedInputRows, previewStudyExport, reportSnapshot, scenariosCsv } from "../src/analysis/studyExport";
import { MODEL_BOUNDARY } from "../src/lib/build";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const BUILD = { app: "0.1.0", engine: "0.1.0", commit: "abc1234" };

describe("full-fidelity case export", () => {
  const params = { ...DEFAULTS, site: "polar" as const, chiIce: 0.03 };
  const file = caseExport({ name: "Polar 3 wt%", kind: "authored", params }, NOW, BUILD);

  it("carries provenance, every input with its unit, the full result, and the timeseries", () => {
    expect(file.schema).toBe(CASE_SCHEMA);
    expect(file.build).toEqual(BUILD);
    expect(file.modelBoundary).toBe(MODEL_BOUNDARY);
    expect(file.exportedAt).toBe(NOW.toISOString());
    expect(Object.keys(file.units.params).sort()).toEqual(Object.keys(PARAM_META).sort());
    expect(file.units.params.chiIce).toBe("kg/kg");
    expect(file.case.nonDefaultParams).toEqual({ site: "polar", chiIce: 0.03 });
    expect(file.case.reproducibilityUrl).toMatch(/\?site=polar&chiIce=0\.03$/);
    expect(file.result).toEqual(simulate(params));
    expect(file.timeseries.points.length).toBeGreaterThanOrEqual(96);
    expect(file.timeseries.summary).toHaveProperty("dutyCycle");
  });

  it("round-trips through JSON into the study library without drift", () => {
    const preview = previewStudyExport(JSON.parse(JSON.stringify(file)));
    expect(preview.sourceKind).toBe("case");
    expect(preview.rejectedCount).toBe(0);
    expect(preview.findings).toEqual([]);
    expect(preview.scenarios).toHaveLength(1);
    expect(preview.scenarios[0]).toMatchObject({ name: "Polar 3 wt%", kind: "authored", pinned: false });
    expect(preview.scenarios[0]!.params).toEqual(params);
    // Same file, same id: importing it twice replaces instead of duplicating.
    expect(previewStudyExport(JSON.parse(JSON.stringify(file))).scenarios[0]!.id).toBe(preview.scenarios[0]!.id);
  });

  it("reports when the current model computes different headline results", () => {
    const stale = JSON.parse(JSON.stringify(file));
    stale.result.energy.secTotal_kWhPerKg = 2.814;
    const preview = previewStudyExport(stale);
    expect(preview.scenarios).toHaveLength(1);
    expect(preview.findings).toHaveLength(1);
    expect(preview.findings[0]).toMatchObject({ severity: "caution" });
    expect(preview.findings[0]!.message).toMatch(/current model computes SEC .* the file recorded 2\.814\sKWH\/KG \(exported from build abc1234\)/);
    expect(resultDrift(null, simulate(params))).toEqual([]);
  });

  it("exports custom designs with their evaluation and re-imports them as custom cases", () => {
    const design = SEEDED_SITE_DESIGN_FIXTURES.equatorial;
    const custom = caseExport({ name: "Yard", kind: "custom", params: design.params, design }, NOW, BUILD);
    expect(custom.case.reproducibilityUrl).toBeNull();
    expect(custom.customSite?.design.id).toBe(design.id);
    expect(custom.customSite?.topologyValid).toBe(true);
    const preview = previewStudyExport(JSON.parse(JSON.stringify(custom)));
    expect(preview.scenarios[0]).toMatchObject({ kind: "custom" });
    expect(preview.findings.filter((finding) => finding.severity === "caution" && /current model/.test(finding.message))).toEqual([]);
  });

  it("exports a custom design's gated timeseries, not the authored-site profile", () => {
    const valid = SEEDED_SITE_DESIGN_FIXTURES.equatorial;
    const broken = { ...valid, connections: [] };
    for (const design of [valid, broken]) {
      const exported = caseExport({ name: "Yard", kind: "custom", params: design.params, design }, NOW, BUILD);
      const { points, summary } = simulateSiteDesignTimeseries(design, exported.timeseries.options);
      expect(exported.timeseries.points).toEqual(points);
      expect(exported.timeseries.summary).toEqual(summary);
    }
    const brokenExport = caseExport({ name: "Broken", kind: "custom", params: broken.params, design: broken }, NOW, BUILD);
    expect(brokenExport.customSite?.topologyValid).toBe(false);
    expect(brokenExport.timeseries.points.every((point) => point.netProductionKgPerDay === 0)).toBe(true);
  });

  it("rejects malformed case files", () => {
    expect(previewStudyExport({ schema: CASE_SCHEMA, version: 99 }).scenarios).toEqual([]);
    expect(previewStudyExport({ schema: CASE_SCHEMA, version: 1, case: { kind: "custom" }, params: {} }).rejectedCount).toBe(1);
  });

  it("rejects a case file whose kind is missing or unknown instead of importing it as authored", () => {
    for (const kind of [undefined, "campaign", 3]) {
      const odd = JSON.parse(JSON.stringify(file));
      odd.case.kind = kind;
      const preview = previewStudyExport(odd);
      expect(preview.scenarios).toEqual([]);
      expect(preview.rejectedCount).toBe(1);
      expect(preview.findings[0]).toMatchObject({ severity: "error" });
    }
  });
});

describe("wide study CSV", () => {
  it("has one unit-labelled column per input and full-precision numbers", () => {
    const scenario = {
      id: "wide", name: "Wide, \"quoted\" case", kind: "authored" as const,
      params: { ...DEFAULTS, targetKgPerDay: 1234.5678 }, createdAt: 1, updatedAt: 1, pinned: false
    };
    const csv = scenariosCsv([scenario], NOW, BUILD);
    const [header, row] = csv.split("\n") as [string, string];
    const headers = header.split(",");
    expect(headers).toContain("param.targetKgPerDay [kg/day]");
    expect(headers).toContain("param.chiIce [kg/kg]");
    expect(headers).toContain("energy.secTotal_kWhPerKg");
    expect(headers).toContain("flow.electrolysis->product [kWh/kg]");
    expect(headers).toContain("build.commit");
    // Every numeric input except the profile blob has its own column.
    const numericInputs = Object.keys(PARAM_META).filter((key) => key !== "polarProfileData");
    expect(numericInputs.every((key) => headers.some((h) => h.startsWith(`param.${key} `) || h === `param.${key}`))).toBe(true);
    expect(row.startsWith('"Wide, ""quoted"" case",authored,equatorial,false')).toBe(true);
    expect(row).toContain(",1234.5678,");
    expect(row).toContain("abc1234");
    expect(String(simulate(scenario.params).energy.secTotal_kWhPerKg)).toSatisfy((value: string) => row.includes(value));
  });
});

describe("engineering report inputs", () => {
  it("lists every changed input with unit, default, and maturity", () => {
    expect(changedInputRows(DEFAULTS)).toEqual([]);
    const rows = changedInputRows({ ...DEFAULTS, site: "polar", chiIce: 0.03, enableSabatier: true });
    expect(rows.map((row) => String(row.key)).sort()).toEqual(["chiIce", "enableSabatier", "site"]);
    const ice = rows.find((row) => row.key === "chiIce")!;
    expect(ice).toMatchObject({ value: "0.03", defaultValue: "0.05", unit: "kg/kg" });
    expect(ice.maturity).toBeTruthy();
    expect(rows.find((row) => row.key === "site")).toMatchObject({ value: "polar", maturity: "MODEL SWITCH", unit: "" });
    const snapshot = reportSnapshot({ ...DEFAULTS, site: "polar" });
    expect(snapshot.uncertainty.spec.map((item) => item.key)).toEqual(["targetKgPerDay", "chiIce"]);
    expect(snapshot.uncertainty.samples).toBe(192);
  });
});
