// @vitest-environment jsdom
import { DEFAULTS } from "@selene-isru/engine";
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../src/state/store";

describe("store wiring (§5)", () => {
  beforeEach(() => {
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
});
