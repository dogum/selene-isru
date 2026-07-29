// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEEDED_SITE_DESIGN_FIXTURES } from "@selene-isru/engine";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import {
  CUSTOM_SITE_DRAFT_KEY,
  saveCustomSiteDraft
} from "../src/site-design/draft";

function BrokenPanel(): React.JSX.Element {
  throw new Error("synthetic panel failure");
}

describe("application recovery boundary", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("preserves and exposes the locally saved custom design", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    saveCustomSiteDraft(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
    const before = window.localStorage.getItem(CUSTOM_SITE_DRAFT_KEY);

    render(
      <AppErrorBoundary>
        <BrokenPanel />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Your custom site is autosaved locally"
    );
    expect(screen.getByRole("button", {
      name: "EXPORT RECOVERY DESIGN"
    })).toHaveProperty("disabled", false);
    expect(window.localStorage.getItem(CUSTOM_SITE_DRAFT_KEY)).toBe(before);
    expect(screen.getByText("synthetic panel failure")).toBeTruthy();
  });
});
