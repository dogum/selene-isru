import {
  createBlankSiteDesign,
  DEFAULTS,
  evaluateSiteDesign,
  SEEDED_SITE_DESIGN_FIXTURES
} from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import {
  previewStudyExport,
  reportScenarios,
  scenariosCsv,
  studyExport,
  studyScenarioResult
} from "../src/analysis/studyExport";
import type { StudyScenario } from "../src/state/store";

function customScenario(): StudyScenario {
  return {
    id: "case-custom",
    name: "Equatorial yard",
    kind: "custom",
    params: SEEDED_SITE_DESIGN_FIXTURES.equatorial.params,
    design: SEEDED_SITE_DESIGN_FIXTURES.equatorial,
    createdAt: 1,
    updatedAt: 2,
    pinned: true
  };
}

describe("study export migration and custom design support", () => {
  it("round-trips a canonical custom design with identical evaluation", () => {
    const scenario = customScenario();
    const expected = evaluateSiteDesign(scenario.design!).achievedResult;

    const exported = studyExport([scenario]);
    const preview = previewStudyExport(exported);
    const imported = preview.scenarios[0]!;

    expect(exported.version).toBe(2);
    expect(exported.scenarios[0]?.design?.assets.map((asset) => asset.id))
      .toEqual([...scenario.design!.assets].map((asset) => asset.id).sort());
    expect(preview.sourceVersion).toBe(2);
    expect(preview.rejectedCount).toBe(0);
    expect(imported.kind).toBe("custom");
    expect(studyScenarioResult(imported)).toEqual(expected);
  });

  it("migrates version 1 cases as authored parameter scenarios", () => {
    const preview = previewStudyExport({
      schema: "selene-isru-study",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      scenarios: [{
        id: "legacy-case",
        name: "Legacy polar case",
        params: { ...DEFAULTS, site: "polar", targetKgPerDay: 812 },
        createdAt: 1,
        updatedAt: 2,
        pinned: false
      }]
    });

    expect(preview.scenarios).toHaveLength(1);
    expect(preview.scenarios[0]).toMatchObject({
      id: "legacy-case",
      kind: "authored",
      params: { site: "polar", targetKgPerDay: 812 }
    });
    expect(preview.findings).toContainEqual(expect.objectContaining({
      severity: "info",
      scenarioName: "Legacy polar case"
    }));
  });

  it("rejects malformed custom cases while retaining acceptable cases", () => {
    const valid = customScenario();
    const preview = previewStudyExport({
      ...studyExport([valid]),
      scenarios: [
        valid,
        {
          ...valid,
          id: "future-case",
          name: "Unsupported future design",
          design: {
            ...valid.design,
            version: 99
          }
        },
        {
          ...valid,
          id: "future-kind-case",
          name: "Unsupported future case kind",
          kind: "linked"
        }
      ]
    });

    expect(preview.scenarios.map((scenario) => scenario.id)).toEqual([
      "case-custom"
    ]);
    expect(preview.rejectedCount).toBe(2);
    expect(preview.findings).toContainEqual(expect.objectContaining({
      severity: "error",
      scenarioName: "Unsupported future design"
    }));
    expect(preview.findings).toContainEqual(expect.objectContaining({
      severity: "error",
      scenarioName: "Unsupported future case kind"
    }));
  });

  it("keeps unknown catalog kinds and duplicate ids inspectable but stopped", () => {
    const base = customScenario();
    const known = base.design!.assets[0]!;
    const unresolved = {
      ...base.design!,
      assets: [
        known,
        {
          ...known,
          kind: "future.quantum-excavator",
          name: "Future excavator"
        }
      ]
    };
    const preview = previewStudyExport(studyExport([{
      ...base,
      design: unresolved
    }]));

    expect(preview.scenarios).toHaveLength(1);
    expect(preview.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("More than one asset uses the id"),
        expect.stringContaining("does not recognize")
      ])
    );
    expect(preview.findings.filter((finding) =>
      finding.severity === "error"
    ).length).toBeGreaterThan(0);
  });

  it("exports custom evaluation fields in comparison CSV", () => {
    const csv = scenariosCsv([customScenario()]);

    expect(csv).toContain("kind");
    expect(csv).toContain("achievableKgPerDay");
    expect(csv).toContain("topologyValid");
    expect(csv).toContain("custom");
  });

  it("uses the same stopped-topology fallback as the live custom workspace", () => {
    const design = createBlankSiteDesign("equatorial", {
      id: "blank-comparison"
    });
    const evaluation = evaluateSiteDesign(design);

    expect(evaluation.topologyValid).toBe(false);
    expect(studyScenarioResult({
      ...customScenario(),
      id: "blank-case",
      params: design.params,
      design
    })).toEqual(evaluation.baseResult);
  });
});

describe("engineering report export", () => {
  it("exports the reported live case and the pinned comparison, not the whole library", () => {
    const library: StudyScenario[] = [
      { id: "pinned-a", name: "Pinned A", kind: "authored", params: { ...DEFAULTS }, createdAt: 1, updatedAt: 1, pinned: true },
      { id: "loose-b", name: "Loose B", kind: "authored", params: { ...DEFAULTS }, createdAt: 1, updatedAt: 1, pinned: false }
    ];
    const live = { ...DEFAULTS, targetKgPerDay: 2345 };
    const cases = reportScenarios("Live case", live, library, 1_700_000_000_000);
    expect(cases.map((scenario) => scenario.name)).toEqual(["Live case", "Pinned A"]);
    expect(cases[0]).toMatchObject({ kind: "authored", pinned: false, params: { targetKgPerDay: 2345 } });
    // The live case gets its own id so re-importing never overwrites a library case.
    expect(library.some((scenario) => scenario.id === cases[0]!.id)).toBe(false);
    // Round-trips through the existing importable study format.
    expect(previewStudyExport(studyExport(cases)).scenarios.map((scenario) => scenario.name)).toEqual(["Live case", "Pinned A"]);
    expect(scenariosCsv(cases).split("\n")).toHaveLength(3);
    expect(reportScenarios("  ", live, [], 1)[0]!.name).toBe("Untitled lunar ISRU case");
  });

  it("writes refuelling columns, empty for a case without a demand", () => {
    const cases: StudyScenario[] = [
      { id: "free", name: "Free", kind: "authored", params: { ...DEFAULTS }, createdAt: 1, updatedAt: 1, pinned: false },
      { id: "crew", name: "Crew", kind: "authored", params: { ...DEFAULTS, refuelDemand: "lander" }, createdAt: 1, updatedAt: 1, pinned: false }
    ];
    const [header, free, crew] = scenariosCsv(cases).split("\n").map((line) => line.split(","));
    const column = (name: string) => header!.indexOf(name);
    expect(column("refuel.isruShare")).toBeGreaterThan(0);
    expect(free![column("refuel.isruShare")]).toBe("");
    expect(Number(crew![column("refuel.isruShare")])).toBeCloseTo(6 / 7, 12);
    // Without a demand everything delivered is used; with one, only what the lander burns.
    expect(free![column("campaign.usedKgPerDay")]).toBe(free![column("campaign.deliveredKgPerDay")]);
    expect(Number(crew![column("campaign.usedKgPerDay")])).toBeLessThan(Number(crew![column("campaign.deliveredKgPerDay")]));
  });
});
