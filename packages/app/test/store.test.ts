// @vitest-environment jsdom
import { DEFAULTS, siteConnectionLengthM } from "@selene-isru/engine";
import { beforeEach, describe, expect, it } from "vitest";
import { CUSTOM_SITE_DRAFT_KEY } from "../src/site-design/draft";
import { useStore } from "../src/state/store";

describe("store wiring (§5)", () => {
  beforeEach(() => {
    useStore.getState().enterAuthoredSite(DEFAULTS.site);
    useStore.getState().applyPatch({});
  });

  it("setParam re-simulates synchronously", () => {
    const before = useStore.getState().result.energy.gridPowerW;
    useStore.getState().setParam("targetKgPerDay", 2000);
    const after = useStore.getState();
    expect(after.params.targetKgPerDay).toBe(2000);
    expect(after.result.energy.gridPowerW).toBeGreaterThan(before);
  });

  it("site switch produces a polar result with sublimation chain", () => {
    useStore.getState().setParam("site", "polar");
    const { result } = useStore.getState();
    expect(result.site).toBe("polar");
    expect(result.thermal.secSub_JPerKg).not.toBeNull();
    expect(result.energy.flows.some((f) => f.to === "sublimation")).toBe(true);
  });

  it("resetParam restores the engine default", () => {
    useStore.getState().setParam("Vcell", 4.9);
    useStore.getState().resetParam("Vcell");
    expect(useStore.getState().params.Vcell).toBe(DEFAULTS.Vcell);
  });

  it("tracks secTotal history for the sparkline (cap 60)", () => {
    for (let i = 0; i < 70; i++) {
      useStore.getState().setParam("targetKgPerDay", 500 + i * 10);
    }
    const { secHistory } = useStore.getState();
    expect(secHistory.length).toBeLessThanOrEqual(60);
    expect(secHistory.at(-1)).toBeCloseTo(
      useStore.getState().result.energy.secTotal_kWhPerKg,
      9
    );
  });

  it("recomputes timeseries and advances the sampled time point", () => {
    useStore.getState().setParam("targetKgPerDay", 2000);
    expect(useStore.getState().timeseries.points.length).toBeGreaterThan(10);
    useStore.getState().setPlaying(true);
    useStore.getState().advanceTime(2);
    const { time, timePoint } = useStore.getState();
    expect(time.tHours).toBeGreaterThan(0);
    expect(timePoint.tHours).toBe(time.tHours);
    useStore.getState().setPlaying(false);
  });

  it("samples the explicitly scrubbed timeline hour", () => {
    useStore.getState().setTimeHours(354);
    const { time, timePoint } = useStore.getState();
    expect(time.tHours).toBe(354);
    expect(timePoint.tHours).toBe(354);
  });

  it("tracks guided tour state", () => {
    useStore.getState().startTour("polar-water");
    expect(useStore.getState().tour).toEqual({ activeId: "polar-water", beatIndex: 0 });
    useStore.getState().advanceTour();
    expect(useStore.getState().tour).toEqual({ activeId: "polar-water", beatIndex: 1 });
    useStore.getState().stopTour();
    expect(useStore.getState().tour).toEqual({ activeId: null, beatIndex: 0 });
  });

  it("manages the compare case separately from current params", () => {
    useStore.getState().setParam("targetKgPerDay", 1500);
    useStore.getState().setCompareFromCurrent();
    expect(useStore.getState().compareParams.targetKgPerDay).toBe(1500);
    useStore.getState().setParam("targetKgPerDay", 2500);
    expect(useStore.getState().compareParams.targetKgPerDay).toBe(1500);

    useStore.getState().swapCompare();
    expect(useStore.getState().params.targetKgPerDay).toBe(1500);
    expect(useStore.getState().compareParams.targetKgPerDay).toBe(2500);
  });

  it("keeps names attached to scenario A and B when swapping", () => {
    useStore.getState().setUi({
      currentScenarioName: "Live candidate",
      compareScenarioName: "Reference case"
    });
    useStore.getState().swapCompare();
    expect(useStore.getState().ui.currentScenarioName).toBe("Reference case");
    expect(useStore.getState().ui.compareScenarioName).toBe("Live candidate");
  });

  it("persists, pins, duplicates, and reloads named study cases", () => {
    const beforeIds = new Set(useStore.getState().scenarioLibrary.map((scenario) => scenario.id));
    useStore.getState().setParam("targetKgPerDay", 1777);
    useStore.getState().saveCurrentScenario("Persistence test case");
    const saved = useStore.getState().scenarioLibrary.find((scenario) => !beforeIds.has(scenario.id));
    expect(saved?.name).toBe("Persistence test case");
    expect(saved?.params.targetKgPerDay).toBe(1777);
    if (saved === undefined) return;

    useStore.getState().duplicateScenario(saved.id);
    const copy = useStore.getState().scenarioLibrary.find((scenario) => scenario.name === "Persistence test case copy");
    expect(copy).toBeDefined();
    useStore.getState().loadScenario(saved.id);
    expect(useStore.getState().params.targetKgPerDay).toBe(1777);

    if (copy !== undefined) useStore.getState().deleteScenario(copy.id);
    useStore.getState().deleteScenario(saved.id);
  });

  it("enters the custom planner without claiming an authored site graph", () => {
    useStore.getState().resetCustomDesign();
    useStore.getState().enterCustomSite();
    const state = useStore.getState();

    expect(state.workspaceMode).toBe("custom");
    expect(state.customSite.viewMode).toBe("planner");
    expect(state.customSite.design.assets).toEqual([]);
    expect(state.customSite.design.connections).toEqual([]);
    expect(state.customSite.findings.some((finding) =>
      finding.id.startsWith("topology.required.")
    )).toBe(true);

    useStore.getState().setCustomViewMode("explore");
    expect(useStore.getState().customSite.viewMode).toBe("explore");
  });

  it("persists custom environment, name, and parameter edits", () => {
    useStore.getState().resetCustomDesign();
    useStore.getState().enterCustomSite();
    useStore.getState().setCustomEnvironment("polar");
    useStore.getState().setCustomDesignName("South-pole logistics study");
    useStore.getState().setParam("targetKgPerDay", 1440);

    const state = useStore.getState();
    const saved = window.localStorage.getItem(CUSTOM_SITE_DRAFT_KEY);

    expect(state.customSite.design.environment).toBe("polar");
    expect(state.customSite.design.params.site).toBe("polar");
    expect(state.customSite.design.params.targetKgPerDay).toBe(1440);
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved ?? "{}")).toMatchObject({
      name: "South-pole logistics study",
      environment: "polar",
      params: { site: "polar", targetKgPerDay: 1440 }
    });
  });

  it("keeps the working custom draft when returning to an authored site", () => {
    useStore.getState().resetCustomDesign();
    useStore.getState().setCustomDesignName("Keep this draft");
    const id = useStore.getState().customSite.design.id;
    useStore.getState().enterCustomSite();
    useStore.getState().enterAuthoredSite("equatorial");

    expect(useStore.getState().workspaceMode).toBe("authored");
    expect(useStore.getState().customSite.design.id).toBe(id);
    expect(useStore.getState().customSite.design.name).toBe("Keep this draft");
  });

  it("edits a custom layout through one-command undo and redo snapshots", () => {
    useStore.getState().resetCustomDesign();
    useStore.getState().setCustomEnvironment("equatorial");
    useStore.getState().enterCustomSite();
    useStore.getState().placeCustomAsset("equatorial.excavator", -30, -30);
    const asset = useStore.getState().customSite.design.assets[0]!;

    expect(asset.transform).toMatchObject({ xM: -30, zM: -30 });
    expect(useStore.getState().customSite.editor.selectedAssetId).toBe(asset.id);
    useStore.getState().moveCustomAsset(asset.id, -20, -15);
    useStore.getState().rotateCustomAsset(asset.id, 20);
    expect(useStore.getState().customSite.design.assets[0]?.transform)
      .toMatchObject({ xM: -20, zM: -15, headingDeg: 15 });

    useStore.getState().undoCustomEdit();
    expect(useStore.getState().customSite.design.assets[0]?.transform.headingDeg).toBe(0);
    useStore.getState().redoCustomEdit();
    expect(useStore.getState().customSite.design.assets[0]?.transform.headingDeg).toBe(15);
  });

  it("duplicates, disables, deletes, and restores custom assets", () => {
    useStore.getState().resetCustomDesign();
    useStore.getState().setCustomEnvironment("equatorial");
    useStore.getState().placeCustomAsset("equatorial.excavator", -30, -30);
    const original = useStore.getState().customSite.design.assets[0]!;
    useStore.getState().duplicateCustomAsset(original.id);
    expect(useStore.getState().customSite.design.assets).toHaveLength(2);

    const duplicate = useStore.getState().customSite.design.assets[1]!;
    useStore.getState().updateCustomAsset(duplicate.id, { enabled: false });
    expect(useStore.getState().customSite.design.assets[1]?.enabled).toBe(false);
    useStore.getState().deleteCustomAsset(duplicate.id);
    expect(useStore.getState().customSite.design.assets).toHaveLength(1);
    useStore.getState().undoCustomEdit();
    expect(useStore.getState().customSite.design.assets).toHaveLength(2);
  });

  it("rejects placements that collide or exceed the planner boundary", () => {
    useStore.getState().resetCustomDesign();
    useStore.getState().setCustomEnvironment("equatorial");
    useStore.getState().placeCustomAsset("equatorial.excavator", 0, 0);
    useStore.getState().placeCustomAsset("equatorial.hauler", 0, 0);
    useStore.getState().placeCustomAsset("equatorial.landing-system", 90, 0);

    expect(useStore.getState().customSite.design.assets).toHaveLength(1);
  });

  it("authors, persists, reroutes, deletes, and restores typed connections", () => {
    useStore.getState().resetCustomDesign();
    useStore.getState().setCustomEnvironment("equatorial");
    useStore.getState().placeCustomAsset("equatorial.excavator", -40, 0);
    useStore.getState().placeCustomAsset("equatorial.hauler", -20, 0);
    const [excavator, hauler] = useStore.getState().customSite.design.assets;
    expect(excavator).toBeDefined();
    expect(hauler).toBeDefined();

    useStore.getState().beginCustomConnection({
      assetId: excavator!.id,
      portId: "regolith-out"
    });
    expect(useStore.getState().customSite.editor.tool).toBe("connect");
    useStore.getState().completeCustomConnection({
      assetId: hauler!.id,
      portId: "regolith-in"
    });

    let state = useStore.getState();
    const connection = state.customSite.design.connections[0]!;
    expect(connection).toMatchObject({
      kind: "material",
      from: { assetId: excavator!.id, portId: "regolith-out" },
      to: { assetId: hauler!.id, portId: "regolith-in" }
    });
    expect(state.customSite.editor.selectedConnectionId).toBe(connection.id);
    expect(JSON.parse(
      window.localStorage.getItem(CUSTOM_SITE_DRAFT_KEY) ?? "{}"
    ).connections).toHaveLength(1);

    const initialRoute = connection.route;
    const initialLength = siteConnectionLengthM(state.customSite.design, connection);
    useStore.getState().rerouteCustomConnection(connection.id);
    state = useStore.getState();
    expect(state.customSite.design.connections[0]?.route).not.toEqual(initialRoute);

    useStore.getState().moveCustomAsset(excavator!.id, -50, -10);
    state = useStore.getState();
    expect(siteConnectionLengthM(
      state.customSite.design,
      state.customSite.design.connections[0]!
    )).not.toBe(initialLength);

    useStore.getState().deleteCustomConnection(connection.id);
    expect(useStore.getState().customSite.design.connections).toEqual([]);
    useStore.getState().undoCustomEdit();
    expect(useStore.getState().customSite.design.connections).toHaveLength(1);
    useStore.getState().redoCustomEdit();
    expect(useStore.getState().customSite.design.connections).toEqual([]);
  });
});
