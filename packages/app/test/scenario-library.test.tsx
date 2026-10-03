// @vitest-environment jsdom
import { DEFAULTS } from "@selene-isru/engine";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScenarioLibrary } from "../src/components/panels/ScenarioLibrary";
import { useStore } from "../src/state/store";

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
    expect(useStore.getState().importScenarios(ids("seed", 6).map((id) => scenario(id)))).toEqual({
      added: 6, replaced: 0, skipped: 0, unpinned: 0
    });
    const summary = useStore.getState().importScenarios([
      scenario("seed-0"),
      ...ids("extra", 4).map((id) => scenario(id, true)),
      scenario("seed-1")
    ]);
    // Two free slots: seed-0/seed-1 replace in place, two extras fit, two are
    // dropped, and a later same-id case still replaces after the library fills.
    expect(summary).toEqual({ added: 2, replaced: 2, skipped: 2, unpinned: 0 });
    expect(useStore.getState().scenarioLibrary).toHaveLength(8);
  });

  it("counts pins dropped by the pin limit", () => {
    clearLibrary();
    const summary = useStore.getState().importScenarios(ids("pin", 6).map((id) => scenario(id, true)));
    expect(summary).toEqual({ added: 6, replaced: 0, skipped: 0, unpinned: 2 });
    expect(useStore.getState().scenarioLibrary.filter((item) => item.pinned)).toHaveLength(4);
  });

  it("disables actions that would do nothing at the caps and says why", () => {
    clearLibrary();
    useStore.getState().importScenarios(ids("full", 8).map((id, index) => scenario(id, index < 4)));
    render(<ScenarioLibrary />);
    expect(screen.getByText(/LIBRARY FULL/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "SAVE LIVE CASE" }) as HTMLButtonElement).disabled).toBe(true);
    for (const copy of screen.getAllByRole("button", { name: "COPY" })) {
      expect((copy as HTMLButtonElement).disabled).toBe(true);
    }
    const pins = screen.getAllByRole("button", { name: "PIN" }) as HTMLButtonElement[];
    expect(pins).toHaveLength(4);
    expect(pins.every((pin) => pin.disabled)).toBe(true);
    const unpins = screen.getAllByRole("button", { name: "UNPIN" }) as HTMLButtonElement[];
    expect(unpins.every((unpin) => !unpin.disabled)).toBe(true);
  });
});
