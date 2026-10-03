// @vitest-environment jsdom
import { DEFAULTS, PARAM_META, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { inputActivity } from "../src/analysis/activity";
import { energyDrivers } from "../src/analysis/brief";
import { energyStages } from "../src/analysis/energyStages";
import { assetKnowledge, processEdges } from "../src/analysis/process";
import { caseSummary } from "../src/analysis/summary";
import { scenariosCsv } from "../src/analysis/studyExport";
import { appliesToCase, FRONTIER_PARAMS } from "../src/analysis/sweep";
import { AssetInspector } from "../src/components/AssetInspector";
import { ControlGroups } from "../src/components/ControlRail";
import { placeSankeyLabels } from "../src/components/panels/EnergySankey";
import { FrontierExplorer } from "../src/components/panels/FrontierExplorer";
import { UncertaintyPanel } from "../src/components/panels/UncertaintyPanel";
import { GROUPS, railModeParamsForGroup, railParamsForGroup } from "../src/controls/manifest";
import { evidenceForParam } from "../src/controls/evidence";
import { parseParams, serializeParams } from "../src/lib/url";
import { PRESETS } from "../src/presets";
import { useStore } from "../src/state/store";
import { GROUP_CAMERA, ILMENITE_REACTOR_FULL_HEAT_W, ilmeniteReactorHeatW, processReactorActivity, reactorActivity } from "../src/viewer/bindings";

const mre: SimParams = { ...DEFAULTS, site: "equatorial" };
const ilmenite: SimParams = { ...DEFAULTS, site: "equatorial", equatorialProcess: "ilmenite" };
const group = (id: string) => GROUPS.find((item) => item.id === id)!;
const shown = (id: string, params: SimParams) => railParamsForGroup(group(id), params).map((def) => String(def.key));
const ILMENITE_KEYS = Object.entries(PARAM_META)
  .filter(([key, meta]) => meta.group === "ilmenite" && key !== "equatorialProcess")
  .map(([key]) => key);

describe("oxygen process rail", () => {
  it("shows the process switch at the equator and the ilmenite inputs only while it is chosen", () => {
    expect(railModeParamsForGroup(group("oxygen-process"), mre)).toEqual(["equatorialProcess"]);
    expect(shown("oxygen-process", mre)).toEqual([]);
    const visible = shown("oxygen-process", ilmenite);
    expect(visible).toEqual(expect.arrayContaining([...ILMENITE_KEYS, "Tambient", "Vel", "etaFaradayEl", "kElectrolyzerMass"]));
    expect(ILMENITE_KEYS).toHaveLength(13);
  });

  it("only hides inputs where they cannot act", () => {
    // Every ilmenite input is inert on the MRE route and acts on its own.
    for (const key of ILMENITE_KEYS) {
      expect(inputActivity(mre, key as keyof SimParams).activity, `${key} on MRE`).toBe("no-effect");
      expect(inputActivity(ilmenite, key as keyof SimParams).activity, `${key} on ilmenite`).toBe("drives-results");
    }
    // The shared inputs the ilmenite group borrows drive its results.
    for (const key of ["Tambient", "Vel", "etaFaradayEl", "kElectrolyzerMass"] as const) {
      expect(inputActivity(ilmenite, key).activity, key).toBe("drives-results");
    }
    // MRE, slag construction, and product-scaled excavation inputs leave the
    // ilmenite plant's results alone.
    expect(shown("extraction-mre", ilmenite)).toEqual([]);
    expect(shown("construction", ilmenite)).toEqual([]);
    expect(shown("excavation", ilmenite)).not.toContain("eMining");
    expect(shown("excavation", ilmenite)).not.toContain("kExcFleet");
    expect(shown("excavation", mre)).toEqual(expect.arrayContaining(["eMining", "kExcFleet"]));
    const hidden = [
      ...railParamsForGroup(group("extraction-mre"), mre),
      ...railParamsForGroup(group("construction"), mre)
    ].map((def) => def.key).filter((key) => key !== "Tambient");
    for (const key of [...hidden, "eMining", "kExcFleet"] as Array<keyof SimParams>) {
      expect(inputActivity(ilmenite, key).activity, String(key)).not.toBe("drives-results");
    }
    expect(inputActivity(ilmenite, "eMining").activity).toBe("no-effect");
    expect(inputActivity(ilmenite, "kExcFleet").activity).toBe("no-effect");
  });

  afterEach(() => {
    cleanup();
    useStore.getState().applyPatch({});
  });

  it("switches the process from the rail and hides the MRE group", () => {
    useStore.getState().applyPatch({ site: "equatorial" });
    render(<ControlGroups />);
    const groupLabels = () => [...document.querySelectorAll(".rail-group-label")].map((label) => label.textContent);
    fireEvent.click(screen.getByRole("button", { name: /^\W*Oxygen process$/ }));
    const select = screen.getByRole("combobox", { name: /OXYGEN PROCESS/ });
    expect(groupLabels()).toEqual(expect.arrayContaining(["Extraction — MRE", "Construction"]));
    fireEvent.change(select, { target: { value: "ilmenite" } });
    expect(useStore.getState().params.equatorialProcess).toBe("ilmenite");
    expect(useStore.getState().result.ilmenite).not.toBeNull();
    expect(groupLabels()).not.toContain("Extraction — MRE");
    expect(groupLabels()).not.toContain("Construction");
    expect(document.querySelectorAll(".param-row").length).toBeGreaterThanOrEqual(17);
  });
});

describe("Custom Site rail", () => {
  afterEach(() => {
    cleanup();
    useStore.getState().enterAuthoredSite("equatorial");
    useStore.getState().applyPatch({});
  });

  it("has no process switch, because the planner's catalog is the MRE plant", () => {
    useStore.getState().applyPatch({ site: "equatorial" });
    useStore.getState().enterCustomSite();
    expect(useStore.getState().workspaceMode).toBe("custom");
    render(<ControlGroups />);
    const groupLabels = [...document.querySelectorAll(".rail-group-label")].map((label) => label.textContent);
    expect(groupLabels).not.toContain("Oxygen process");
    expect(groupLabels).toContain("Extraction — MRE");
  });
});

describe("ilmenite route across the app", () => {
  const result = simulate(ilmenite);

  it("round-trips the process through the URL", () => {
    const query = serializeParams(ilmenite);
    expect(query).toBe("equatorialProcess=ilmenite");
    expect(simulate(parseParams(query))).toEqual(result);
    expect(parseParams("equatorialProcess=plasma").equatorialProcess).toBeUndefined();
  });

  it("names the plant and the soil it mines", () => {
    expect(caseSummary(ilmenite, result)).toMatch(/^Equatorial ilmenite-reduction plant mining 327 t\/day of soil makes 1,000 kg\/day liquid oxygen/);
  });

  it("charges energy to the stage that spends it", () => {
    const stages = energyStages(result);
    expect(stages.map((stage) => stage.label)).toEqual([
      "Soil sizing and separation",
      "Water electrolysis",
      "Ilmenite feed heat and reduction",
      "Product conditioning and storage",
      "Excavation"
    ]);
    const total = stages.reduce((sum, stage) => sum + stage.kWhPerKg, 0);
    expect(total).toBeCloseTo(result.energy.secTotal_kWhPerKg, 12);
    // MRE excavation is labelled as excavation, not as melt heating.
    const mreStages = energyStages(simulate(mre));
    const excavation = mreStages.find((stage) => stage.id === "mine")!;
    expect(excavation.label).toBe("Excavation");
    expect(excavation.kWhPerKg).toBeCloseTo(simulate(mre).energy.flows.find((flow) => flow.from === "mine")!.kWhPerKg, 12);
    expect(energyDrivers(simulate(mre)).map((driver) => driver.label)[0]).toBe("Molten-regolith electrolysis");
  });

  it("draws soil and tailings, not slag, and explains the borrowed reactor", () => {
    const edges = processEdges(result, ilmenite);
    expect(edges.map((edge) => edge.shortLabel)).toEqual(expect.arrayContaining(["SOIL", "SOIL FEED", "O₂ PRODUCT", "TAILINGS"]));
    expect(edges.some((edge) => edge.shortLabel === "SLAG")).toBe(false);
    expect(assetKnowledge("equatorial", "reactor", true)?.assumptions.join(" ")).toMatch(/stand-in/);
    expect(assetKnowledge("equatorial", "castingYard", true)?.purpose).toMatch(/Idle/);
    expect(assetKnowledge("equatorial", "reactor", false)?.purpose).toMatch(/molten regolith/);
  });

  it("drives the reactor glow from the ilmenite heater", () => {
    const heatW = ilmeniteReactorHeatW(result);
    const ilm = result.ilmenite!;
    expect(heatW).toBeCloseTo(((ilm.secSensible_JPerKg + ilm.secReaction_JPerKg + ilm.secReactorLoss_JPerKg) * 1000) / 86_400, 6);
    expect(processReactorActivity(result)).toBeCloseTo(heatW / ILMENITE_REACTOR_FULL_HEAT_W, 12);
    const mreResult = simulate(mre);
    expect(processReactorActivity(mreResult)).toBe(reactorActivity(mreResult.electrolysis.currentA));
    // At the defaults both processes glow alike per kg of oxygen.
    expect(processReactorActivity(result)).toBeCloseTo(processReactorActivity(mreResult), 1);
    expect(GROUP_CAMERA.equatorial["oxygen-process"]).toBe("reactor");
  });

  it("offers only the levers that act on the running process", () => {
    const axes = (params: SimParams) => FRONTIER_PARAMS.filter((param) => appliesToCase(param, params)).map((param) => param.key);
    expect(axes(ilmenite)).toEqual(expect.arrayContaining(["fIlmenite", "ilmConcentrateGrade"]));
    expect(axes(ilmenite)).not.toContain("Vcell");
    expect(axes(mre)).toContain("Vcell");
    expect(axes(mre)).not.toContain("fIlmenite");
    for (const key of ["fIlmenite", "ilmConcentrateGrade", "etaIlmHeatRecovery"] as const) {
      expect(axes(ilmenite)).toContain(key);
      expect(inputActivity(ilmenite, key).activity, key).toBe("drives-results");
    }
  });

  it("cites Eagle 1988 and Guerrero-Gonzalez & Zabel 2023", () => {
    const evidence = (key: keyof SimParams, source: string) =>
      evidenceForParam({ key, group: "ilmenite", source, min: 0, max: 1, unit: "1" });
    expect(evidence("fIlmenite", "Eagle Engineering 1988, Conceptual Design").sourceUrl).toBe("https://ntrs.nasa.gov/citations/19890004515");
    expect(evidence("eIlmMining", "Guerrero-Gonzalez & Zabel 2023, Acta").sourceUrl).toBe("https://doi.org/10.1016/j.actaastro.2022.11.050");
    expect(evidence("fIlmHeatLoss", "calibrated to Eagle Engineering 1988").maturity).toBe("SIMPLIFIED CORRELATION");
    expect(evidence("fIlmenite", "Eagle Engineering 1988").applicability).toMatch(/ilmenite/);
  });

  it("exports the ilmenite chain in the study CSV", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const csv = scenariosCsv(
      [
        { id: "a", name: "MRE", kind: "authored", params: mre, createdAt: 0, updatedAt: 0, pinned: false },
        { id: "b", name: "Ilmenite", kind: "authored", params: ilmenite, createdAt: 0, updatedAt: 0, pinned: false }
      ],
      at
    );
    const lines = csv.trim().split("\n").filter((line) => !line.startsWith("#"));
    const header = lines[0]!.split(",");
    const column = (name: string) => header.indexOf(name);
    const rows = lines.slice(1).map((line) => line.split(","));
    expect(column("ilmenite.soilPerKgO2")).toBeGreaterThan(-1);
    expect(rows[0]![column("ilmenite.soilPerKgO2")]).toBe("");
    expect(Number(rows[1]![column("ilmenite.soilPerKgO2")])).toBeCloseTo(result.ilmenite!.soilPerKgO2, 6);
    expect(Number(rows[1]![column("manifest.beneficiation plant [kg]")])).toBeCloseTo(result.ilmenite!.beneficiationMassKg, 3);
    expect(Number(rows[0]![column("manifest.beneficiation plant [kg]")])).toBe(0);
  });

  it("ships two ilmenite presets, and high-Ti soil pays back sooner", () => {
    const run = (id: string) => simulate({ ...DEFAULTS, ...PRESETS.find((preset) => preset.id === id)!.patch });
    const mare = run("ilmenite-mare");
    const highTi = run("ilmenite-high-ti");
    expect(mare.ilmenite).not.toBeNull();
    expect(highTi.campaign.paybackDays!).toBeLessThan(mare.campaign.paybackDays!);
  });
});

describe("Sankey labels", () => {
  it("moves a label that would overlap its neighbour to the nearest free line", () => {
    const labels = [
      { id: "a", x: 100, y: 200, anchor: "start" as const, text: "BENEFICIATION 7.91 kWh/kg" },
      { id: "b", x: 150, y: 200, anchor: "start" as const, text: "H₂ REDUCTION 3.21 kWh/kg" },
      { id: "c", x: 600, y: 200, anchor: "start" as const, text: "PRODUCT" }
    ];
    const y = placeSankeyLabels(labels, 400);
    expect(y.get("a")).toBe(200);
    expect(Math.abs(y.get("b")! - 200)).toBeGreaterThanOrEqual(14);
    // A label clear of the others keeps its place.
    expect(y.get("c")).toBe(200);
  });
});

describe("analysis panels follow a process switch", () => {
  afterEach(() => {
    cleanup();
    useStore.getState().applyPatch({});
  });

  it("resets the uncertainty inputs to the new process's defaults", () => {
    useStore.getState().applyPatch({ site: "equatorial" });
    render(<UncertaintyPanel />);
    expect((screen.getByRole("checkbox", { name: /MRE cell voltage/ }) as HTMLInputElement).checked).toBe(true);
    act(() => useStore.getState().applyPatch({ site: "equatorial", equatorialProcess: "ilmenite" }));
    expect(screen.queryByRole("checkbox", { name: /MRE cell voltage/ })).toBeNull();
    expect((screen.getByRole("checkbox", { name: /Ilmenite in soil/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Concentrate grade/ }) as HTMLInputElement).checked).toBe(true);
    act(() => useStore.getState().applyPatch({ site: "equatorial" }));
    expect((screen.getByRole("checkbox", { name: /MRE cell voltage/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("moves the frontier's second axis to a lever of the new process", () => {
    // Panel charts size themselves with ResizeObserver, which jsdom lacks.
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    useStore.getState().applyPatch({ site: "equatorial" });
    render(<FrontierExplorer />);
    const axisB = () => screen.getByRole("combobox", { name: "Frontier parameter B" }) as HTMLSelectElement;
    expect(axisB().value).toBe("etaCurrent");
    act(() => useStore.getState().applyPatch({ site: "equatorial", equatorialProcess: "ilmenite" }));
    expect(axisB().value).toBe("fIlmenite");
  });
});


describe("asset inspector on the ilmenite route", () => {
  afterEach(() => {
    cleanup();
    useStore.getState().setUi({ selectedAsset: null });
    useStore.getState().applyPatch({});
  });

  const inspect = (patch: Partial<SimParams>, asset: string): void => {
    useStore.getState().applyPatch(patch);
    useStore.getState().setUi({ selectedAsset: asset });
    render(<AssetInspector />);
  };

  it("shows the landing pad without slag-cast pad controls or readings", () => {
    inspect({ site: "equatorial" }, "pad");
    expect(screen.getByText("Pads per year")).toBeTruthy();
    expect(screen.getByText("Joint utilization")).toBeTruthy();
    cleanup();
    inspect({ site: "equatorial", equatorialProcess: "ilmenite" }, "pad");
    expect(screen.getByText("Lander specific impulse")).toBeTruthy();
    for (const slagOnly of ["Pads per year", "Joint utilization"]) {
      expect(screen.queryByText(slagOnly)).toBeNull();
    }
  });

  it("shows the habitat without slag shielding controls or readings", () => {
    inspect({ site: "equatorial" }, "habitat");
    expect(screen.getByText("Designed shielding")).toBeTruthy();
    expect(screen.getByText("Time to shield")).toBeTruthy();
    cleanup();
    inspect({ site: "equatorial", equatorialProcess: "ilmenite" }, "habitat");
    expect(screen.getByRole("complementary", { name: /HABITAT/ })).toBeTruthy();
    for (const slagOnly of ["Designed shielding", "Shield material density", "Time to shield", "Full-balance shield"]) {
      expect(screen.queryByText(slagOnly)).toBeNull();
    }
  });

  it("shows the polar habitat without slag shielding controls, since the pole makes no slag", () => {
    inspect({ site: "polar" }, "habitat");
    expect(screen.getByRole("complementary", { name: /POLAR SURFACE HABITAT/ })).toBeTruthy();
    for (const slagOnly of ["Designed shielding", "Shield material density", "Time to shield"]) {
      expect(screen.queryByText(slagOnly)).toBeNull();
    }
  });

  it("stays nominal when an unsafe casting input carries over from MRE", () => {
    inspect({ site: "equatorial", equatorialProcess: "ilmenite", castDeltaT: 200 }, "castingYard");
    expect(screen.getByText("NOMINAL")).toBeTruthy();
  });
});
