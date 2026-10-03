// @vitest-environment jsdom
import { DEFAULTS, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CASE_SCHEMA, CASE_VERSION } from "../src/analysis/caseExport";
import { previewStudyExport } from "../src/analysis/studyExport";
import { upgradeLegacyParams } from "../src/lib/legacyParams";
import { parseParams } from "../src/lib/url";

// What a library case saved before v0.9 holds: every input, the retired ones included.
function savedBeforeV09(params: Partial<SimParams>, legacy: Record<string, number> = {}): Record<string, unknown> {
  const { kMiningMass: _kMiningMass, overburdenRatio: _overburdenRatio, ...current } = { ...DEFAULTS, ...params };
  return { ...current, eMining: 120_000, kExcFleet: 8.5, eIlmMining: 10_100, kIlmMiningMass: 0.0244, ...legacy };
}

describe("inputs renamed or retired in v0.9", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("moves an ilmenite case's mining inputs onto the shared keys and drops the product-scaled fleet", () => {
    const ilmenite = upgradeLegacyParams(savedBeforeV09({ equatorialProcess: "ilmenite" }));
    expect(ilmenite.eMining).toBe(10_100);
    expect(ilmenite.kMiningMass).toBe(0.0244);
    for (const key of ["eIlmMining", "kIlmMiningMass", "kExcFleet"]) expect(ilmenite).not.toHaveProperty(key);
    // The ilmenite plant reads exactly what it read before.
    expect(simulate({ ...DEFAULTS, ...ilmenite } as SimParams)).toEqual(simulate({ ...DEFAULTS, equatorialProcess: "ilmenite" }));
  });

  it("keeps an MRE or polar case's mining energy and puts its fleet on the soil basis", () => {
    for (const site of ["equatorial", "polar"] as const) {
      const upgraded = upgradeLegacyParams(savedBeforeV09({ site }));
      // Energy per kg of soil meant the same thing before; only its default moved.
      expect(upgraded.eMining).toBe(120_000);
      expect(upgraded).not.toHaveProperty("kMiningMass");
      for (const key of ["eIlmMining", "kIlmMiningMass", "kExcFleet"]) expect(upgraded).not.toHaveProperty(key);
    }
    // An ilmenite choice left over at the pole never reduced ilmenite.
    const polar = upgradeLegacyParams(savedBeforeV09({ site: "polar", equatorialProcess: "ilmenite" }, { eIlmMining: 40_000 }));
    expect(polar.eMining).toBe(120_000);
    const untouched = { ...DEFAULTS };
    expect(upgradeLegacyParams(untouched)).toBe(untouched);
  });

  it("reads a shared link made before v0.9", () => {
    expect(parseParams("equatorialProcess=ilmenite&eIlmMining=50000&kIlmMiningMass=0.1")).toEqual({
      equatorialProcess: "ilmenite",
      eMining: 50_000,
      kMiningMass: 0.1
    });
    expect(parseParams("kExcFleet=12&eIlmMining=50000&targetKgPerDay=500")).toEqual({ targetKgPerDay: 500 });
  });

  it("upgrades study and case files", () => {
    const study = previewStudyExport({
      schema: "selene-isru-study",
      version: 2,
      exportedAt: "2026-10-02T00:00:00.000Z",
      scenarios: [{
        id: "old-ilmenite", name: "Old ilmenite", kind: "authored",
        params: savedBeforeV09({ equatorialProcess: "ilmenite" }, { eIlmMining: 40_000 }),
        createdAt: 1, updatedAt: 2, pinned: false
      }]
    });
    expect(study.scenarios[0]!.params.eMining).toBe(40_000);
    expect(study.scenarios[0]!.params).not.toHaveProperty("eIlmMining");

    const caseFile = previewStudyExport({
      schema: CASE_SCHEMA,
      version: CASE_VERSION,
      case: { name: "Old ilmenite", kind: "authored" },
      params: savedBeforeV09({ equatorialProcess: "ilmenite" }, { kIlmMiningMass: 0.05 })
    });
    expect(caseFile.scenarios[0]!.params.kMiningMass).toBe(0.05);
    expect(caseFile.scenarios[0]!.params).not.toHaveProperty("kExcFleet");
  });

  it("upgrades the saved library when the app loads", async () => {
    window.localStorage.setItem("selene-isru.study-scenarios.v2", JSON.stringify([{
      id: "old-ilmenite", name: "Old ilmenite", kind: "authored",
      params: savedBeforeV09({ equatorialProcess: "ilmenite" }, { eIlmMining: 40_000 }),
      createdAt: 1, updatedAt: 2, pinned: false
    }]));
    const { useStore } = await import("../src/state/store");
    const saved = useStore.getState().scenarioLibrary.find((scenario) => scenario.id === "old-ilmenite")!;
    expect(saved.params.eMining).toBe(40_000);
    expect(saved.params.kMiningMass).toBe(DEFAULTS.kMiningMass);
    expect(saved.params).not.toHaveProperty("eIlmMining");
  });
});
