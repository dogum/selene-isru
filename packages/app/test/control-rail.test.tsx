// @vitest-environment jsdom
import { DEFAULTS } from "@selene-isru/engine";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
});
