// @vitest-environment jsdom
import {
  SEEDED_SITE_DESIGN_FIXTURES,
  serializeSiteDesign,
  siteConnectionRoutePoints
} from "@selene-isru/engine";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
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
    vi.unstubAllGlobals();
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
    expect(screen.getByRole("status").textContent).toContain(
      "SCREENING ASSUMPTIONS VISIBLE IN INSPECTORS"
    );
    const evaluation = screen.getByLabelText("Custom site evaluation");
    expect(evaluation.textContent).toContain("ACHIEVABLE OUTPUT");
    expect(evaluation.textContent).toContain("BOTTLENECKTOPOLOGY");
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

  it("starts a typed route from an asset port and inspects the result", () => {
    render(<CustomSiteWorkspace />);
    act(() => {
      useStore.getState().placeCustomAsset("equatorial.excavator", -40, 0);
      useStore.getState().placeCustomAsset("equatorial.hauler", -20, 0);
    });
    const [excavator, hauler] = useStore.getState().customSite.design.assets;
    act(() => {
      useStore.getState().selectCustomAsset(excavator!.id);
    });

    expect(screen.getByText("TYPED INTERFACES")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "CONNECT" }));
    expect(useStore.getState().customSite.editor).toMatchObject({
      tool: "connect",
      connectionSource: {
        assetId: excavator!.id,
        portId: "regolith-out"
      }
    });

    act(() => {
      useStore.getState().completeCustomConnection({
        assetId: hauler!.id,
        portId: "regolith-in"
      });
    });
    expect(screen.getAllByText("MATERIAL ROUTE").length).toBeGreaterThan(0);
    expect(screen.getByText(/m measured length/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "REROUTE" })).toBeTruthy();
    expect(screen.getByLabelText("Route handles").textContent)
      .toContain("editable bends");
    const beforeDesign = useStore.getState().customSite.design;
    const bendCount = siteConnectionRoutePoints(
      beforeDesign,
      beforeDesign.connections[0]!
    ).slice(1, -1).length;
    fireEvent.click(screen.getByRole("button", { name: "ADD BEND" }));
    const afterDesign = useStore.getState().customSite.design;
    expect(siteConnectionRoutePoints(
      afterDesign,
      afterDesign.connections[0]!
    ).slice(1, -1)).toHaveLength(bendCount + 1);

    fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
    expect(useStore.getState().customSite.design.connections).toEqual([]);
  });

  it("edits the installed-unit count for a bank-rated asset", () => {
    act(() => {
      useStore.getState().placeCustomAsset("equatorial.power-hub", -30, -30);
    });
    const power = useStore.getState().customSite.design.assets[0]!;
    act(() => {
      useStore.getState().selectCustomAsset(power.id);
    });
    render(<CustomSiteWorkspace />);

    const quantity = screen.getByLabelText("INSTALLED UNITS");
    fireEvent.change(quantity, { target: { value: "2" } });
    fireEvent.blur(quantity);

    expect(
      useStore.getState().customSite.design.assets[0]?.configuration.unitCount
    ).toBe(2);
    expect(
      useStore.getState().customSite.evaluation.assetEvaluations[0]
        ?.installedCapacity
    ).toBe(2_500_000);
    expect(screen.getByLabelText("Custom site inspector").textContent)
      .toContain("2.5");
  });

  it("previews a design file and changes the project only after acceptance", async () => {
    const { container } = render(<CustomSiteWorkspace />);
    const before = serializeSiteDesign(useStore.getState().customSite.design);
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]'
    )!;
    const file = new File(["site"], "polar-site.json", {
      type: "application/json"
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(JSON.stringify(
        SEEDED_SITE_DESIGN_FIXTURES.polar
      ))
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByLabelText("Custom design import preview"))
      .toBeTruthy();
    expect(serializeSiteDesign(useStore.getState().customSite.design))
      .toBe(before);

    fireEvent.click(screen.getByRole("button", { name: "ACCEPT DESIGN" }));
    await waitFor(() => {
      expect(useStore.getState().customSite.design.environment).toBe("polar");
    });
  });

  it("starts from an editable authored reference layout", () => {
    render(<CustomSiteWorkspace />);

    fireEvent.click(screen.getByRole("button", {
      name: "START FROM EQUATORIAL REFERENCE"
    }));

    expect(useStore.getState().customSite.design.name).toBe(
      "Equatorial reference copy"
    );
    expect(useStore.getState().customSite.design.assets.length)
      .toBeGreaterThan(5);
    expect(screen.getByLabelText("Site planner tools").textContent)
      .toContain("EXTENT");
  });

  it("multi-selects equipment and exposes group layout tools", () => {
    act(() => {
      useStore.getState().importCustomDesign(
        SEEDED_SITE_DESIGN_FIXTURES.equatorial
      );
      const [first, second] =
        useStore.getState().customSite.design.assets;
      useStore.getState().selectCustomAsset(first!.id);
      useStore.getState().selectCustomAsset(second!.id, true);
    });
    render(<CustomSiteWorkspace />);
    const beforeX = useStore.getState().customSite.design.assets[0]!
      .transform.xM;

    expect(screen.getByText("2 ASSETS SELECTED")).toBeTruthy();
    expect(screen.getByText("GROUP FOOTPRINT")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "X+ →" }));

    expect(useStore.getState().customSite.design.assets[0]?.transform.xM)
      .toBe(beforeX + 5);
  });

  it("renders mobile as review-only with precision controls locked", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 1099px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    act(() => {
      useStore.getState().importCustomDesign(
        SEEDED_SITE_DESIGN_FIXTURES.polar
      );
      useStore.getState().selectCustomAsset(
        useStore.getState().customSite.design.assets[0]!.id
      );
    });

    render(<CustomSiteWorkspace />);

    expect(screen.getByRole("note").textContent).toContain("MOBILE REVIEW");
    expect(screen.getByLabelText("X (M)").hasAttribute("readonly")).toBe(true);
    expect(screen.getByRole("button", { name: "DUPLICATE" }))
      .toHaveProperty("disabled", true);
  });

  it("keeps mobile review selection keyboard accessible", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 1099px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    act(() => {
      useStore.getState().importCustomDesign(
        SEEDED_SITE_DESIGN_FIXTURES.polar
      );
      useStore.getState().selectCustomAsset(null);
    });
    render(<CustomSiteWorkspace />);
    const first = useStore.getState().customSite.design.assets[0]!;

    fireEvent.click(screen.getByRole("button", {
      name: new RegExp(`Select ${first.name}`)
    }));

    expect(useStore.getState().customSite.editor.selectedAssetId).toBe(
      first.id
    );
    expect(screen.getByLabelText("Custom site inspector").textContent)
      .toContain(first.name);
  });

  it("makes Explore selection-only and cancels active authoring tools", () => {
    render(<CustomSiteWorkspace />);
    fireEvent.click(screen.getAllByRole("button", { name: "PLACE" })[0]!);
    expect(useStore.getState().customSite.editor.tool).toBe("place");

    act(() => {
      useStore.getState().setCustomViewMode("explore");
    });

    expect(useStore.getState().customSite.editor.tool).toBe("select");
    expect(screen.getAllByRole("button", { name: "PLANNER ONLY" }))
      .toHaveLength(8);
  });
});
