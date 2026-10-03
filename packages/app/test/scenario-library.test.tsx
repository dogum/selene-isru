// @vitest-environment jsdom
import { DEFAULTS } from "@selene-isru/engine";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { caseExport } from "../src/analysis/caseExport";
import { differingInputRows, previewStudyExport, scenariosCsv, studyExport } from "../src/analysis/studyExport";
import { ScenarioLibrary } from "../src/components/panels/ScenarioLibrary";
import { MAX_SCENARIO_NOTES } from "../src/lib/scenarioNotes";
import { MAX_STUDY_SCENARIOS, useStore } from "../src/state/store";

describe("scenario library imports", () => {
  afterEach(() => {
    cleanup();
    useStore.getState().deleteScenario("import-preview-case");
  });

  it("previews a legacy study and waits for explicit acceptance", async () => {
    const { container } = render(<ScenarioLibrary />);
    const payload = JSON.stringify({
      schema: "selene-isru-study",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      scenarios: [{
        id: "import-preview-case",
        name: "Imported preview case",
        params: { ...DEFAULTS, targetKgPerDay: 765 },
        createdAt: 1,
        updatedAt: 2,
        pinned: false
      }]
    });
    const file = new File([payload], "study.json", {
      type: "application/json"
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(payload)
    });
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]'
    )!;

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByLabelText("Study import preview")).toBeTruthy();
    expect(useStore.getState().scenarioLibrary.some((scenario) =>
      scenario.id === "import-preview-case"
    )).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "ACCEPT IMPORT" }));
    await waitFor(() => {
      expect(useStore.getState().scenarioLibrary).toContainEqual(
        expect.objectContaining({
          id: "import-preview-case",
          kind: "authored",
          params: expect.objectContaining({ targetKgPerDay: 765 })
        })
      );
    });
    expect(screen.getByText("1 case added")).toBeTruthy();
  });
});

describe("scenario library capacity", () => {
  const ids = (prefix: string, count: number): string[] =>
    Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
  const scenario = (id: string, pinned = false) => ({
    id,
    name: id,
    kind: "authored" as const,
    params: { ...DEFAULTS },
    createdAt: 1,
    updatedAt: 1,
    pinned
  });
  const clearLibrary = (): void => {
    for (const item of useStore.getState().scenarioLibrary) {
      useStore.getState().deleteScenario(item.id);
    }
  };

  afterEach(() => {
    cleanup();
    clearLibrary();
  });

  it("reports what an import actually added, replaced, skipped, and unpinned", () => {
    clearLibrary();
    const seeded = MAX_STUDY_SCENARIOS - 2;
    expect(useStore.getState().importScenarios(ids("seed", seeded).map((id) => scenario(id)))).toEqual({
      added: seeded, replaced: 0, skipped: 0, unpinned: 0
    });
    const summary = useStore.getState().importScenarios([
      scenario("seed-0"),
      ...ids("extra", 4).map((id) => scenario(id, true)),
      scenario("seed-1")
    ]);
    // Two free slots: seed-0/seed-1 replace in place, two extras fit, two are
    // dropped, and a later same-id case still replaces after the library fills.
    expect(summary).toEqual({ added: 2, replaced: 2, skipped: 2, unpinned: 0 });
    expect(useStore.getState().scenarioLibrary).toHaveLength(MAX_STUDY_SCENARIOS);
  });

  it("counts pins dropped by the pin limit", () => {
    clearLibrary();
    const summary = useStore.getState().importScenarios(ids("pin", 6).map((id) => scenario(id, true)));
    expect(summary).toEqual({ added: 6, replaced: 0, skipped: 0, unpinned: 2 });
    expect(useStore.getState().scenarioLibrary.filter((item) => item.pinned)).toHaveLength(4);
  });

  it("disables actions that would do nothing at the caps and says why", () => {
    clearLibrary();
    useStore.getState().importScenarios(ids("full", MAX_STUDY_SCENARIOS).map((id, index) => scenario(id, index < 4)));
    render(<ScenarioLibrary />);
    expect(screen.getByText(/LIBRARY FULL/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "SAVE LIVE CASE" }) as HTMLButtonElement).disabled).toBe(true);
    for (const copy of screen.getAllByRole("button", { name: "COPY" })) {
      expect((copy as HTMLButtonElement).disabled).toBe(true);
    }
    const pins = screen.getAllByRole("button", { name: "PIN" }) as HTMLButtonElement[];
    expect(pins).toHaveLength(MAX_STUDY_SCENARIOS - 4);
    expect(pins.every((pin) => pin.disabled)).toBe(true);
    const unpins = screen.getAllByRole("button", { name: "UNPIN" }) as HTMLButtonElement[];
    expect(unpins.every((unpin) => !unpin.disabled)).toBe(true);
  });
});

describe("saved-case notes, updates, and input comparison", () => {
  const clearLibrary = (): void => {
    for (const item of useStore.getState().scenarioLibrary) {
      useStore.getState().deleteScenario(item.id);
    }
  };
  const byName = (name: string) => useStore.getState().scenarioLibrary.find((item) => item.name === name)!;

  afterEach(() => {
    cleanup();
    clearLibrary();
    useStore.getState().applyPatch({});
  });

  it("keeps notes on a case, cut to the limit, and drops them when blanked", () => {
    clearLibrary();
    useStore.getState().saveCurrentScenario("Noted");
    const { id } = byName("Noted");
    useStore.getState().setScenarioNotes(id, "Assumes 90% availability; check spares.");
    expect(byName("Noted").notes).toBe("Assumes 90% availability; check spares.");
    expect(window.localStorage.getItem("selene-isru.study-scenarios.v2")).toContain("check spares");
    useStore.getState().setScenarioNotes(id, "x".repeat(MAX_SCENARIO_NOTES + 50));
    expect(byName("Noted").notes).toHaveLength(MAX_SCENARIO_NOTES);
    useStore.getState().setScenarioNotes(id, "   ");
    expect("notes" in byName("Noted")).toBe(false);
  });

  it("carries notes through the study JSON, the case file, and the study CSV", () => {
    clearLibrary();
    useStore.getState().saveCurrentScenario("Travelling");
    useStore.getState().setScenarioNotes(byName("Travelling").id, "Review with the power team, \"v2\"");
    const saved = byName("Travelling");

    const study = previewStudyExport(JSON.parse(JSON.stringify(studyExport([saved]))));
    expect(study.scenarios[0]!.notes).toBe(saved.notes);

    const file = caseExport({ name: saved.name, kind: saved.kind, params: saved.params, notes: saved.notes! });
    expect(file.case.notes).toBe(saved.notes);
    expect(previewStudyExport(JSON.parse(JSON.stringify(file))).scenarios[0]!.notes).toBe(saved.notes);
    expect("notes" in caseExport({ name: "Bare", kind: "authored", params: saved.params }).case).toBe(false);

    const csv = scenariosCsv([saved]);
    const header = csv.split("\n")[0]!.split(",");
    expect(header).toContain("notes");
    expect(csv).toContain('"Review with the power team, ""v2"""');
  });

  it("updates a saved case from the live case, keeping its identity, name, notes, and pin", () => {
    clearLibrary();
    useStore.getState().saveCurrentScenario("Baseline to revise");
    const before = byName("Baseline to revise");
    useStore.getState().setScenarioNotes(before.id, "Keep me");
    useStore.getState().setParam("targetKgPerDay", 2500);

    expect(useStore.getState().updateScenarioFromCurrent(before.id)).toBe(true);
    const after = byName("Baseline to revise");
    expect(after.id).toBe(before.id);
    expect(after.params.targetKgPerDay).toBe(2500);
    expect(after.notes).toBe("Keep me");
    expect(after.pinned).toBe(before.pinned);
    expect(useStore.getState().ui.currentScenarioName).toBe("Baseline to revise");

    // A custom case cannot take an authored case's inputs.
    useStore.setState({
      scenarioLibrary: [...useStore.getState().scenarioLibrary, { ...after, id: "custom-like", name: "Custom", kind: "custom" }]
    });
    expect(useStore.getState().updateScenarioFromCurrent("custom-like")).toBe(false);
  });

  it("asks before overwriting, and says when a case already matches the live case", () => {
    clearLibrary();
    useStore.getState().saveCurrentScenario("Live twin");
    render(<ScenarioLibrary />);
    expect(screen.getByText("= LIVE CASE")).toBeTruthy();
    const update = (): HTMLButtonElement => screen.getByRole("button", { name: /UPDATE/ }) as HTMLButtonElement;
    expect(update().disabled).toBe(true);

    act(() => useStore.getState().setParam("targetKgPerDay", 3000));
    expect(screen.getByText("LIVE CASE DIFFERS IN 1 INPUT")).toBeTruthy();
    fireEvent.click(update());
    expect(byName("Live twin").params.targetKgPerDay).toBe(DEFAULTS.targetKgPerDay);
    expect(update().textContent).toBe("CONFIRM UPDATE");
    fireEvent.click(update());
    expect(byName("Live twin").params.targetKgPerDay).toBe(3000);
  });

  it("lists, side by side, only the inputs that differ between pinned cases", () => {
    expect(differingInputRows([DEFAULTS])).toEqual([]);
    const rows = differingInputRows([DEFAULTS, { ...DEFAULTS, targetKgPerDay: 2500, site: "polar" }]);
    expect(rows.map((row) => row.key).sort()).toEqual(["site", "targetKgPerDay"]);
    const target = rows.find((row) => row.key === "targetKgPerDay")!;
    expect(target.values).toEqual([String(DEFAULTS.targetKgPerDay), "2500"]);
    expect(target.unit).toBe("kg/day");

    clearLibrary();
    useStore.getState().importScenarios([
      { id: "pin-a", name: "A", kind: "authored", params: { ...DEFAULTS }, createdAt: 1, updatedAt: 1, pinned: true },
      { id: "pin-b", name: "B", kind: "authored", params: { ...DEFAULTS, reserveDays: 60 }, createdAt: 1, updatedAt: 1, pinned: true }
    ]);
    render(<ScenarioLibrary />);
    expect(screen.getByText("INPUTS THAT DIFFER")).toBeTruthy();
    const table = document.querySelector(".scenario-input-diff")!;
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table.textContent).toContain("60");
  });
});
