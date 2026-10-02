// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { KpiInspector } from "../src/components/KpiInspector";
import { SlideOver } from "../src/components/SlideOver";
import { TopBar } from "../src/components/TopBar";
import { TourOverlay } from "../src/components/TourOverlay";
import { useDialog } from "../src/lib/a11y";
import { useStore } from "../src/state/store";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  cleanup();
  useStore.getState().setUi({ view: "site", selectedKpi: null, aboutOpen: false });
  useStore.getState().stopTour();
});

function ModalHarness(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useDialog(ref, { open, modal: true, onClose: () => setOpen(false) });
  return (
    <>
      <button onClick={() => setOpen(true)}>OPEN</button>
      {open && (
        <div ref={ref} role="dialog" aria-label="Harness">
          <button>FIRST</button>
          <button>LAST</button>
        </div>
      )}
    </>
  );
}

describe("dialog keyboard contract", () => {
  it("moves focus in, traps Tab in a modal, and returns focus on Escape", () => {
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "OPEN" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "FIRST" }));
    screen.getByRole("button", { name: "LAST" }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "FIRST" }));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "LAST" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes only the topmost surface per Escape", () => {
    useStore.getState().setUi({ view: "mass" });
    render(<><SlideOver /><KpiInspector /></>);
    act(() => useStore.getState().setUi({ selectedKpi: "sec" }));
    expect(screen.getByRole("dialog", { name: /Why this number/ })).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(useStore.getState().ui.selectedKpi).toBeNull();
    expect(useStore.getState().ui.view).toBe("mass");
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(useStore.getState().ui.view).toBe("site");
  });
});

describe("top-bar menus", () => {
  it("open onto the first item, move with arrows, and close on Escape back to the trigger", () => {
    useStore.getState().applyPatch({ site: "equatorial" });
    render(<TopBar />);
    const trigger = screen.getByRole("button", { name: /^PRESETS/ });
    trigger.focus();
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("tours", () => {
  it("survive Tab so NEXT is reachable, and stop on Escape", () => {
    render(<TourOverlay />);
    act(() => useStore.getState().startTour("energy-ledger"));
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(useStore.getState().tour.activeId).toBe("energy-ledger");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(useStore.getState().tour.activeId).toBeNull();
  });
});
