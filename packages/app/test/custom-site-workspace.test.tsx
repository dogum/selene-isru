// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CustomSiteWorkspace } from "../src/components/site-design/CustomSiteWorkspace";
import { useStore } from "../src/state/store";

describe("custom site workspace", () => {
  beforeEach(() => {
    useStore.getState().resetCustomDesign();
    useStore.getState().enterCustomSite();
  });

  afterEach(() => {
    cleanup();
    useStore.getState().enterAuthoredSite("equatorial");
  });

  it("renders the blank planning state from catalog and validation data", () => {
    render(<CustomSiteWorkspace />);

    expect(screen.getByRole("heading", {
      name: "Build the site from first principles."
    })).toBeTruthy();
    expect(screen.getByText("8 available types")).toBeTruthy();
    expect(screen.getByLabelText("Current site counts").textContent).toContain(
      "4 OPEN PROCESS STEPS"
    );
    expect(screen.getByText("PLACEMENT TOOLS UNLOCK IN MILESTONE 2")).toBeTruthy();
    expect(screen.getByText(
      "OUTPUT METRICS DISABLED UNTIL A VALID CUSTOM PROCESS GRAPH EXISTS"
    )).toBeTruthy();
  });

  it("edits the persisted name and switches the registry environment", () => {
    render(<CustomSiteWorkspace />);

    fireEvent.change(screen.getByLabelText("DESIGN NAME"), {
      target: { value: "Crater rim concept" }
    });
    fireEvent.click(screen.getByRole("button", { name: "POLAR" }));

    expect(useStore.getState().customSite.design.name).toBe("Crater rim concept");
    expect(useStore.getState().customSite.design.environment).toBe("polar");
    expect(screen.getByText("7 available types")).toBeTruthy();
    expect(screen.getByText("Rim power towers")).toBeTruthy();
  });
});
