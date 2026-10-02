// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SlideOver, ViewTabs } from "../src/components/SlideOver";
import { useStore } from "../src/state/store";

describe("view tabs", () => {
  beforeAll(() => {
    // Panel charts size themselves with ResizeObserver, which jsdom lacks.
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  });

  afterEach(() => {
    cleanup();
    useStore.getState().setUi({ view: "site" });
  });

  it("float over the site view", () => {
    useStore.getState().setUi({ view: "site" });
    render(<><ViewTabs /><SlideOver /></>);
    const tabs = within(screen.getByRole("tablist", { name: "View" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["SITE", "ENERGY", "MASS", "POWER", "TRADE STUDY"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dock into the open panel so every panel stays reachable", () => {
    useStore.getState().setUi({ view: "mass" });
    render(<><ViewTabs /><SlideOver /></>);
    // Exactly one tab strip, and it lives inside the panel rather than under it.
    const lists = screen.getAllByRole("tablist", { name: "View" });
    expect(lists).toHaveLength(1);
    const panel = screen.getByRole("dialog", { name: "mass panel" });
    expect(panel.contains(lists[0]!)).toBe(true);
    const tabs = within(lists[0]!).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["ENERGY", "MASS", "POWER", "TRADE STUDY"]);
    expect(within(lists[0]!).getByRole("tab", { name: "MASS" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(lists[0]!).getByRole("tab", { name: "POWER" }));
    expect(useStore.getState().ui.view).toBe("power");
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(useStore.getState().ui.view).toBe("site");
  });
});
