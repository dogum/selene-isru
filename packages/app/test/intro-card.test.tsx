// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTRO_DISMISSED_KEY, IntroCard } from "../src/components/IntroCard";
import { useStore } from "../src/state/store";

describe("first-visit intro", () => {
  beforeEach(() => {
    window.localStorage.removeItem(INTRO_DISMISSED_KEY);
    useStore.getState().stopTour();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useStore.getState().stopTour();
  });

  it("shows once, and stays dismissed", () => {
    const { unmount } = render(<IntroCard />);
    expect(screen.getByRole("dialog", { name: "A resource plant you can re-engineer" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "EXPLORE ON MY OWN" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem(INTRO_DISMISSED_KEY)).toBe("1");
    unmount();
    render(<IntroCard />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses on Escape and can start the tour", () => {
    render(<IntroCard />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    window.localStorage.removeItem(INTRO_DISMISSED_KEY);
    render(<IntroCard />);
    fireEvent.click(screen.getByRole("button", { name: "TAKE THE TOUR" }));
    expect(useStore.getState().tour.activeId).toBe("energy-ledger");
  });

  it("stays out of automated captures", () => {
    vi.stubGlobal("navigator", { ...navigator, webdriver: true });
    render(<IntroCard />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
