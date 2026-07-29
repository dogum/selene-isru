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
  });
});
