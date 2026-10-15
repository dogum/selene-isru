// @vitest-environment jsdom
import { DEFAULTS, sizeToDemand } from "@selene-isru/engine";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ControlGroups } from "../src/components/ControlRail";
import {
  GROUPS,
  isChangedFromDefault,
  matchesParamQuery,
  paramsForGroup,
  railParamsForGroup
} from "../src/controls/manifest";
import { useStore } from "../src/state/store";

const group = (id: string) => GROUPS.find((item) => item.id === id)!;
const keys = (defs: Array<{ key: unknown }>) => defs.map((def) => String(def.key));

describe("rail visibility and search helpers", () => {
  it("leaves out inputs that cannot apply in the current configuration", () => {
    const power = group("power");
    expect(keys(railParamsForGroup(power, { ...DEFAULTS, site: "equatorial" }))).not.toContain("thetaDivBeam");
    expect(keys(railParamsForGroup(power, { ...DEFAULTS, site: "polar" }))).toContain("thetaDivBeam");
    const mre = group("extraction-mre");
    expect(keys(railParamsForGroup(mre, { ...DEFAULTS, oxideModel: true }))).not.toContain("xO2");
    expect(keys(railParamsForGroup(mre, { ...DEFAULTS, oxideModel: false }))).toContain("xO2");
    const cryo = group("cryo");
    expect(keys(railParamsForGroup(cryo, { ...DEFAULTS, storageStream: "custom" }))).toContain("Ttank");
    expect(keys(railParamsForGroup(cryo, DEFAULTS))).not.toContain("Ttank");
    const loxOnly = keys(railParamsForGroup(cryo, DEFAULTS, new Set(["lox"])));
    expect(loxOnly).toContain("secCondLox");
    expect(loxOnly).not.toContain("secCondLh2");
  });

  it("matches every search term against plain name, code name, group, and unit", () => {
    const blade = paramsForGroup("excavation").find((def) => def.key === "wBlade")!;
    expect(matchesParamQuery(blade, "Excavation", "blade width")).toBe(true);
    expect(matchesParamQuery(blade, "Excavation", "wblade")).toBe(true);
    expect(matchesParamQuery(blade, "Excavation", "excavation m")).toBe(true);
    expect(matchesParamQuery(blade, "Excavation", "blade voltage")).toBe(false);
    expect(matchesParamQuery(blade, "Excavation", "   ")).toBe(true);
  });

  it("ignores float noise when deciding an input changed", () => {
    expect(isChangedFromDefault(0.1 + 0.2, 0.3)).toBe(false);
    expect(isChangedFromDefault(1001, 1000)).toBe(true);
  });
});

describe("control rail search, changed filter, and reset", () => {
  afterEach(() => {
    cleanup();
    useStore.getState().applyPatch({});
  });

  it("filters to matching inputs across groups and says when nothing matches", () => {
    useStore.getState().applyPatch({ site: "equatorial" });
    render(<ControlGroups />);
    const search = screen.getByRole("searchbox", { name: /Search inputs/ });
    fireEvent.change(search, { target: { value: "blade" } });
    const rows = document.querySelectorAll(".param-row");
    expect(rows.length).toBe(2);
    expect(screen.getByText("2 inputs shown")).toBeTruthy();
    fireEvent.change(search, { target: { value: "no such input" } });
    expect(screen.getByText("No inputs match.")).toBeTruthy();
    fireEvent.keyDown(search, { key: "Escape" });
    expect((search as HTMLInputElement).value).toBe("");
  });

  it("lists only changed inputs and resets one from its row", () => {
    useStore.getState().applyPatch({ site: "equatorial", Vcell: 4.6, targetKgPerDay: 1500 });
    render(<ControlGroups />);
    const changed = screen.getByRole("button", { name: "CHANGED · 2" });
    fireEvent.click(changed);
    expect(changed.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll(".param-row")).toHaveLength(2);

    const reset = screen.getByRole("button", { name: /Reset MRE cell voltage|Reset .*cell voltage/i });
    fireEvent.click(reset);
    expect(useStore.getState().params.Vcell).toBe(DEFAULTS.Vcell);
    expect(screen.getByRole("button", { name: "CHANGED · 1" })).toBeTruthy();
    expect(document.querySelectorAll(".param-row")).toHaveLength(1);
    const row = document.querySelector(".param-row") as HTMLElement;
    expect(within(row).getByRole("button", { name: /Reset .* to default 1000/ })).toBeTruthy();
  });

  it("counts and shows changed selects and switches, not only sliders", () => {
    useStore.getState().applyPatch({ ...DEFAULTS, site: "equatorial", storageStream: "custom", deploymentManifest: "shared" });
    render(<ControlGroups />);
    const changed = screen.getByRole("button", { name: "CHANGED · 2" });
    fireEvent.click(changed);
    expect(screen.queryByText("Every input is at its default.")).toBeNull();
    expect(screen.getByText("2 inputs shown")).toBeTruthy();
    // The groups that hold the changed selects stay on screen with the selects in them.
    expect(screen.getByDisplayValue("CUSTOM CRYOGEN")).toBeTruthy();
    expect(screen.getByDisplayValue("SHARED (MASS SHARE)")).toBeTruthy();
    // Only the controls it counted: the unchanged heat-control select stays hidden.
    expect(screen.queryByDisplayValue("ZERO BOIL-OFF")).toBeNull();
    expect(document.querySelectorAll(".rail-mode-grid select")).toHaveLength(2);
    expect(document.querySelectorAll(".param-row")).toHaveLength(0);
    useStore.getState().applyPatch({ ...DEFAULTS });
  });

  it("offers the refuelling demand only to plants that make lander propellant", () => {
    useStore.getState().applyPatch({ ...DEFAULTS, refuelDemand: "lander" });
    render(<ControlGroups />);
    expect(screen.getByRole("button", { name: "CHANGED · 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Refuelling demand/ }));
    expect(screen.getByDisplayValue("REFUELLED LANDER")).toBeTruthy();
    expect(screen.getByText(/its hydrogen comes from Earth/)).toBeTruthy();
    cleanup();

    // A polar water plant makes nothing a lander burns: no group, nothing counted.
    useStore.getState().applyPatch({ ...DEFAULTS, site: "polar", refuelDemand: "lander" });
    render(<ControlGroups />);
    expect(screen.queryByRole("button", { name: /Refuelling demand/ })).toBeNull();
    expect(screen.getByRole("button", { name: "CHANGED · 0" })).toBeTruthy();
    useStore.getState().applyPatch({ ...DEFAULTS });
  });

  it("sizes the plant to its demand in one undoable step", () => {
    useStore.getState().applyPatch({ ...DEFAULTS, refuelDemand: "lander" });
    useStore.setState({ paramHistory: { past: [], future: [] } });
    render(<ControlGroups />);
    fireEvent.click(screen.getByRole("button", { name: /Refuelling demand/ }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "SIZE PLANT TO DEMAND" }));
    });
    const sized = sizeToDemand({ ...DEFAULTS, refuelDemand: "lander" })!;
    expect(useStore.getState().params.targetKgPerDay).toBe(sized.targetKgPerDay);
    expect(useStore.getState().result.refuel!.surplusKgPerDay).toBe(0);
    expect(screen.getByRole("status").textContent).toMatch(/^Target set to 111\u2009kg\/day of oxygen: the lander burns all of it\.$/);
    // One undo step back to the hand-set plant, and the note goes with it.
    expect(useStore.getState().paramHistory.past).toHaveLength(1);
    act(() => useStore.getState().undoParams());
    expect(useStore.getState().params.targetKgPerDay).toBe(DEFAULTS.targetKgPerDay);
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();

    // At the pole the target is water.
    useStore.getState().applyPatch({ ...DEFAULTS, site: "polar", polarProduct: "propellant", refuelDemand: "lander" });
    render(<ControlGroups />);
    fireEvent.click(screen.getByRole("button", { name: /Refuelling demand/ }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "SIZE PLANT TO DEMAND" }));
    });
    // Water splits richer in oxygen than the lander burns, so the hydrogen sets the size.
    expect(screen.getByRole("status").textContent).toMatch(/^Target set to 167\u2009kg\/day of water: it meets the lander's oxygen and hydrogen demand, with 33\.3\u2009kg\/day of oxygen left over\.$/);
    expect(useStore.getState().result.refuel!.isruShare).toBeCloseTo(1, 9);
    // A demand that falls under the smallest plant holds the target at its minimum.
    act(() => useStore.getState().applyPatch({ ...DEFAULTS, refuelDemand: "lander", sortiesPerYear: 0.5, McargoDown: 0, McargoUp: 0, MdryReusable: 2000, dvDescent: 1800, dvAscent: 1700, IspReusable: 465 }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "SIZE PLANT TO DEMAND" }));
    });
    expect(useStore.getState().params.targetKgPerDay).toBe(10);
    expect(screen.getByRole("status").textContent).toMatch(/minimum: even the smallest plant meets the lander's demand\.$/);
    cleanup();

    // A Custom Site's output comes from its equipment, so it is not sized here.
    act(() => useStore.getState().enterCustomSite());
    act(() => useStore.getState().setParam("refuelDemand", "lander"));
    render(<ControlGroups />);
    fireEvent.click(screen.getByRole("button", { name: /Refuelling demand/ }));
    expect(screen.getByDisplayValue("REFUELLED LANDER")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "SIZE PLANT TO DEMAND" })).toBeNull();
    act(() => useStore.getState().enterAuthoredSite("equatorial"));
    useStore.getState().applyPatch({ ...DEFAULTS });
  });

  it("shows the Sabatier switch under a filter only when the filter counts it", () => {
    useStore.getState().applyPatch({ ...DEFAULTS, site: "polar", enableSabatier: true });
    render(<ControlGroups />);
    const search = screen.getByRole("searchbox", { name: /Search inputs/ });
    fireEvent.change(search, { target: { value: "conversion fraction" } });
    expect(screen.getByText("1 input shown")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Enable Sabatier loop" })).toBeNull();
    fireEvent.change(search, { target: { value: "enable sabatier" } });
    expect(screen.getByText("1 input shown")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Enable Sabatier loop" })).toBeTruthy();
    // With the loop off its sliders cannot act, so a search does not count them.
    useStore.getState().applyPatch({ enableSabatier: false });
    fireEvent.change(search, { target: { value: "conversion fraction" } });
    expect(screen.getByText("No inputs match.")).toBeTruthy();
    useStore.getState().applyPatch({ ...DEFAULTS });
  });

  it("does not count a changed slider in a gated-off group", () => {
    useStore.getState().applyPatch({ ...DEFAULTS, site: "polar", enableSabatier: true, fConversion: 0.8 });
    render(<ControlGroups />);
    expect(screen.getByRole("button", { name: "CHANGED · 2" })).toBeTruthy();
    // Switching the loop off hides its sliders; the badge drops them but counts the switch.
    act(() => useStore.getState().setParam("enableSabatier", false));
    expect(useStore.getState().params.fConversion).toBe(0.8);
    const changed = screen.getByRole("button", { name: "CHANGED · 0" });
    fireEvent.click(changed);
    expect(screen.getByText("Every input is at its default.")).toBeTruthy();
    useStore.getState().applyPatch({ ...DEFAULTS });
  });

  it("finds a select by searching its name", () => {
    useStore.getState().applyPatch({ ...DEFAULTS, site: "equatorial" });
    render(<ControlGroups />);
    fireEvent.change(screen.getByRole("searchbox", { name: /Search inputs/ }), { target: { value: "lander charging" } });
    expect(screen.getByDisplayValue("DEDICATED (WHOLE LANDERS)")).toBeTruthy();
    expect(screen.getByText("1 input shown")).toBeTruthy();
  });

  it("shows only the select a search matches in the oxygen process group", () => {
    useStore.getState().applyPatch({ ...DEFAULTS, site: "equatorial", equatorialProcess: "ilmenite" });
    render(<ControlGroups />);
    const search = screen.getByRole("searchbox", { name: /Search inputs/ });
    fireEvent.change(search, { target: { value: "ilmFeed" } });
    expect(screen.getByDisplayValue("MARE SOIL")).toBeTruthy();
    expect(screen.queryByDisplayValue("ILMENITE H₂ REDUCTION")).toBeNull();
    fireEvent.change(search, { target: { value: "equatorialProcess" } });
    expect(screen.getByDisplayValue("ILMENITE H₂ REDUCTION")).toBeTruthy();
    expect(screen.queryByDisplayValue("MARE SOIL")).toBeNull();
    useStore.getState().applyPatch({ ...DEFAULTS });
  });
});
