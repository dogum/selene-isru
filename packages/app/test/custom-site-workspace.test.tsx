// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CustomSiteWorkspace } from "../src/components/site-design/CustomSiteWorkspace";
import { useStore } from "../src/state/store";

describe("custom site workspace", () => {
  beforeEach(() => {
    useStore.getState().resetCustomDesign();
    useStore.getState().setCustomEnvironment("equatorial");
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
    expect(screen.getAllByRole("button", { name: "PLACE" })).toHaveLength(8);
    expect(screen.getByText(
      "CLICK PLACE, THEN CHOOSE A VALID FOOTPRINT · ESC CANCELS"
    )).toBeTruthy();
    expect(screen.getByText(
      "CONNECTIONS AND CUSTOM OUTPUT EVALUATION ARRIVE IN THE NEXT MILESTONES"
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

  it("starts placement and exposes transform actions for a selected asset", () => {
    render(<CustomSiteWorkspace />);
    fireEvent.click(screen.getAllByRole("button", { name: "PLACE" })[0]!);
    expect(useStore.getState().customSite.editor.tool).toBe("place");
    expect(screen.getByRole("button", { name: "CANCEL PLACEMENT" })).toBeTruthy();

    act(() => {
      useStore.getState().placeCustomAsset("equatorial.excavator", -25, -25);
    });
    const asset = useStore.getState().customSite.design.assets[0]!;
    act(() => {
      useStore.getState().selectCustomAsset(asset.id);
    });

    expect(screen.getByLabelText("ASSET NAME")).toBeTruthy();
    expect(screen.getByLabelText("X (M)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "DUPLICATE" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "DISABLE" }));
    expect(useStore.getState().customSite.design.assets[0]?.enabled).toBe(false);
  });
});
