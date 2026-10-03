// @vitest-environment jsdom
import { DEFAULTS } from "@selene-isru/engine";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "../src/components/TopBar";
import { TourOverlay } from "../src/components/TourOverlay";
import { PARAM_EDIT_COALESCE_MS, PARAM_HISTORY_LIMIT, useStore } from "../src/state/store";

const store = () => useStore.getState();

let now = 1_000_000;
beforeEach(() => {
  now += 10 * PARAM_EDIT_COALESCE_MS;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  if (store().tour.activeId !== null) store().stopTour();
  store().enterAuthoredSite("equatorial");
  store().applyPatch({});
  useStore.setState({ paramHistory: { past: [], future: [] } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Space edits out far enough that each is its own undo step. */
const later = (): void => {
  now += PARAM_EDIT_COALESCE_MS + 1;
};

describe("undo and redo of authored edits", () => {
  it("steps back and forward through edits, restoring the result and the case name", () => {
    const base = store().result;
    store().setParam("targetKgPerDay", 1500);
    later();
    store().setParam("reserveDays", 45);
    const edited = store().result;
    expect(store().paramHistory.past).toHaveLength(2);

    store().undoParams();
    expect(store().params.reserveDays).toBe(DEFAULTS.reserveDays);
    expect(store().params.targetKgPerDay).toBe(1500);
    store().undoParams();
    expect(store().params).toEqual(DEFAULTS);
    expect(store().result).toEqual(base);
    expect(store().paramHistory.future).toHaveLength(2);

    store().redoParams();
    store().redoParams();
    expect(store().params.reserveDays).toBe(45);
    expect(store().result).toEqual(edited);
    expect(store().paramHistory.future).toHaveLength(0);
  });

  it("drops the redo branch when a new edit is made", () => {
    store().setParam("targetKgPerDay", 1500);
    store().undoParams();
    expect(store().paramHistory.future).toHaveLength(1);
    later();
    store().setParam("reserveDays", 45);
    expect(store().paramHistory.future).toHaveLength(0);
    store().redoParams();
    expect(store().params.targetKgPerDay).toBe(DEFAULTS.targetKgPerDay);
  });

  it("treats one slider drag as one step, but not a second drag or another input", () => {
    for (const value of [1100, 1200, 1300, 1400]) {
      now += 50;
      store().setParam("targetKgPerDay", value);
    }
    expect(store().paramHistory.past).toHaveLength(1);
    later();
    store().setParam("targetKgPerDay", 1600);
    now += 50;
    store().setParam("reserveDays", 20);
    expect(store().paramHistory.past).toHaveLength(3);
    store().undoParams();
    store().undoParams();
    expect(store().params.targetKgPerDay).toBe(1400);
    store().undoParams();
    expect(store().params.targetKgPerDay).toBe(DEFAULTS.targetKgPerDay);
  });

  it("ignores edits that change nothing", () => {
    store().setParam("targetKgPerDay", DEFAULTS.targetKgPerDay);
    store().applyPatch({});
    // swapping two identical cases, names included, changes nothing on screen either
    store().setCompareFromCurrent();
    store().setUi({ compareScenarioName: store().ui.currentScenarioName });
    store().swapCompare();
    expect(store().paramHistory.past).toHaveLength(0);
  });

  it("undoes a preset, an applied point, a loaded case, a swap, and a site switch", () => {
    store().setParam("targetKgPerDay", 1500);
    later();
    store().applyPatch({ site: "polar", chiIce: 0.08 });
    expect(store().params.targetKgPerDay).toBe(DEFAULTS.targetKgPerDay);
    store().undoParams();
    // a preset no longer throws away the inputs it does not set
    expect(store().params.targetKgPerDay).toBe(1500);
    expect(store().params.site).toBe("equatorial");

    store().saveCurrentScenario("Undo source");
    const saved = store().scenarioLibrary.find((scenario) => scenario.name === "Undo source")!;
    store().setUi({ currentScenarioName: "Working" });
    store().setParam("targetKgPerDay", 2500);
    store().loadScenario(saved.id);
    expect(store().ui.currentScenarioName).toBe("Undo source");
    store().undoParams();
    expect(store().params.targetKgPerDay).toBe(2500);
    expect(store().ui.currentScenarioName).toBe("Working");
    store().deleteScenario(saved.id);

    store().setCompareFromCurrent();
    store().applyPatch({ site: "polar" });
    store().swapCompare();
    store().undoParams();
    expect(store().params.site).toBe("polar");

    store().enterAuthoredSite("equatorial");
    expect(store().params.site).toBe("equatorial");
    store().undoParams();
    expect(store().params.site).toBe("polar");
  });

  it("undoes and redoes a swap on both sides, without touching the comparison otherwise", () => {
    store().setParam("targetKgPerDay", 1500);
    store().setUi({ currentScenarioName: "Case A" });
    store().setCompareFromCurrent();
    store().applyPatch({ site: "polar" });
    store().setUi({ currentScenarioName: "Case B" });
    // live B, comparison A; swap makes live A, comparison B
    store().swapCompare();
    expect(store().params.site).toBe("equatorial");
    expect(store().compareParams.site).toBe("polar");

    store().undoParams();
    expect(store().params.site).toBe("polar");
    expect(store().ui.currentScenarioName).toBe("Case B");
    expect(store().compareParams.site).toBe("equatorial");
    expect(store().compareParams.targetKgPerDay).toBe(1500);
    expect(store().compareResult.site).toBe("equatorial");

    store().redoParams();
    expect(store().params.site).toBe("equatorial");
    expect(store().compareParams.site).toBe("polar");
    expect(store().ui.compareScenarioName).toBe("Case B");

    // an ordinary step leaves a comparison snapshot taken since alone
    later();
    store().setParam("reserveDays", 45);
    store().setCompareFromCurrent();
    store().undoParams();
    expect(store().compareParams.reserveDays).toBe(45);
  });

  it("records a swap of equal inputs under different names, and drops a stale swap redo", () => {
    store().setUi({ currentScenarioName: "Working" });
    store().setCompareFromCurrent();
    expect(store().ui.compareScenarioName).toBe("Working snapshot");
    store().swapCompare();
    expect(store().ui.currentScenarioName).toBe("Working snapshot");
    store().undoParams();
    expect(store().ui.currentScenarioName).toBe("Working");
    expect(store().ui.compareScenarioName).toBe("Working snapshot");

    // undo a swap, then take a new comparison: redo must not bring the old one back
    later();
    store().setParam("targetKgPerDay", 1500);
    store().setCompareFromCurrent();
    store().applyPatch({ site: "polar" });
    store().swapCompare();
    store().undoParams();
    store().setParam("reserveDays", 45);
    store().setCompareFromCurrent();
    const snapshot = store().compareParams;
    expect(store().paramHistory.future.some((entry) => entry.compare !== undefined)).toBe(false);
    store().redoParams();
    expect(store().compareParams).toEqual(snapshot);
  });

  it("records a step when only the case name changes, and none when nothing does", () => {
    store().saveCurrentScenario("Same inputs");
    const saved = store().scenarioLibrary.find((scenario) => scenario.name === "Same inputs")!;
    store().setUi({ currentScenarioName: "Mine" });
    // loading a case with the live inputs still renames the live case
    store().loadScenario(saved.id);
    expect(store().ui.currentScenarioName).toBe("Same inputs");
    expect(store().paramHistory.past).toHaveLength(1);
    store().undoParams();
    expect(store().ui.currentScenarioName).toBe("Mine");
    store().redoParams();
    // loading it again changes nothing
    store().loadScenario(saved.id);
    expect(store().paramHistory.past).toHaveLength(1);
    // a preset with the live inputs renames to the working case
    store().applyPatch({});
    expect(store().ui.currentScenarioName).toBe("Equatorial working case");
    store().undoParams();
    expect(store().ui.currentScenarioName).toBe("Same inputs");
    // clicking the site already shown keeps the name and records nothing
    const before = store().paramHistory.past.length;
    store().enterAuthoredSite("equatorial");
    expect(store().ui.currentScenarioName).toBe("Same inputs");
    expect(store().paramHistory.past).toHaveLength(before);
    store().deleteScenario(saved.id);
  });

  it("keeps at most the history limit", () => {
    for (let i = 0; i < PARAM_HISTORY_LIMIT + 20; i += 1) {
      later();
      store().setParam("targetKgPerDay", 1000 + i);
    }
    expect(store().paramHistory.past).toHaveLength(PARAM_HISTORY_LIMIT);
  });

  it("leaves Custom Site to its own history and returns to the case left behind", () => {
    store().setParam("targetKgPerDay", 1500);
    store().enterCustomSite();
    const customParams = store().params;
    store().undoParams();
    expect(store().params).toEqual(customParams);
    store().enterAuthoredSite("equatorial");
    // coming back is not itself a step over the custom design's params
    store().undoParams();
    expect(store().workspaceMode).toBe("authored");
    expect(store().params.targetKgPerDay).toBe(1500);
    store().undoParams();
    expect(store().params.targetKgPerDay).toBe(DEFAULTS.targetKgPerDay);
  });
});

describe("tours return the user's case", () => {
  it("restores the case and its name when the tour stops, without filling the undo stack", () => {
    store().setParam("targetKgPerDay", 1500);
    store().setUi({ currentScenarioName: "My case" });
    const mine = store().params;
    const historyBefore = store().paramHistory;
    store().startTour("polar-water");
    store().applyPatch({ site: "polar" });
    store().advanceTour();
    store().applyPatch({ site: "polar", targetKgPerDay: 5000 });
    expect(store().paramHistory).toBe(historyBefore);
    store().stopTour();
    expect(store().params).toEqual(mine);
    expect(store().ui.currentScenarioName).toBe("My case");
    expect(store().paramHistory).toBe(historyBefore);
  });

  it("keeps the tour's case on request, one undo away from the user's", () => {
    store().setParam("targetKgPerDay", 1500);
    store().startTour("polar-water");
    store().applyPatch({ site: "polar" });
    store().keepTourCase();
    expect(store().tour.activeId).toBeNull();
    expect(store().params.site).toBe("polar");
    store().undoParams();
    expect(store().params.site).toBe("equatorial");
    expect(store().params.targetKgPerDay).toBe(1500);
  });

  it("returns to the user's case when one tour starts another, or undo is pressed mid-tour", () => {
    store().setParam("targetKgPerDay", 1500);
    store().startTour("polar-water");
    store().applyPatch({ site: "polar" });
    store().startTour("polar-water");
    store().applyPatch({ site: "polar", targetKgPerDay: 4000 });
    store().undoParams();
    expect(store().tour.activeId).toBeNull();
    expect(store().params.site).toBe("equatorial");
    expect(store().params.targetKgPerDay).toBe(1500);
  });
});

describe("history controls", () => {
  it("undoes from the keyboard except while typing, and leaves Custom Site's keys alone", () => {
    render(<TopBar />);
    act(() => store().setParam("targetKgPerDay", 1500));
    const undo = screen.getByRole("button", { name: "Undo last change" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);

    const typed = document.createElement("input");
    typed.type = "number";
    document.body.appendChild(typed);
    fireEvent.keyDown(typed, { key: "z", ctrlKey: true });
    expect(store().params.targetKgPerDay).toBe(1500);
    typed.remove();

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store().params.targetKgPerDay).toBe(DEFAULTS.targetKgPerDay);
    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(store().params.targetKgPerDay).toBe(1500);
    fireEvent.click(undo);
    expect(store().params.targetKgPerDay).toBe(DEFAULTS.targetKgPerDay);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(store().params.targetKgPerDay).toBe(1500);
  });

  it("offers STOP and KEEP THIS CASE on a tour", () => {
    store().setParam("targetKgPerDay", 1500);
    act(() => store().startTour("polar-water"));
    render(<TourOverlay />);
    expect(store().params.site).toBe("polar");
    fireEvent.click(screen.getByRole("button", { name: "KEEP THIS CASE" }));
    expect(store().tour.activeId).toBeNull();
    expect(store().params.site).toBe("polar");
    act(() => store().startTour("polar-water"));
    fireEvent.click(screen.getByRole("button", { name: "STOP" }));
    expect(store().params.site).toBe("polar");
    act(() => store().undoParams());
    expect(store().params.site).toBe("equatorial");
  });
});
