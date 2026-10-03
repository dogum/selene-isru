// @vitest-environment jsdom
import { DEFAULTS, normalizeParams, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paramBounds } from "../src/analysis/bounds";
import {
  GRID_POINTS,
  LINE_POINTS,
  axisValues,
  outputValue,
  runSweep,
  sweepCsv,
  sweepInputs,
  sweepOutputs
} from "../src/analysis/generalSweep";
import { railParamsForGroup, groupsForSite } from "../src/controls/manifest";
import { SweepPanel } from "../src/components/panels/SweepPanel";
import { FrontierExplorer } from "../src/components/panels/FrontierExplorer";
import { useStore } from "../src/state/store";

const polar: SimParams = { ...DEFAULTS, site: "polar" };
const ilmenite: SimParams = { ...DEFAULTS, site: "equatorial", equatorialProcess: "ilmenite" };

describe("general sweep", () => {
  it("offers every input the rail shows for the case, once, and nothing it hides", () => {
    for (const params of [DEFAULTS, polar, ilmenite]) {
      const offered = sweepInputs(params).map((input) => input.key);
      expect(new Set(offered).size).toBe(offered.length);
      const shown = new Set(groupsForSite(params.site)
        .filter((group) => group.gatedBy === undefined || params[group.gatedBy])
        .flatMap((group) => railParamsForGroup(group, params).map((def) => def.key)));
      expect(new Set(offered)).toEqual(shown);
    }
    expect(sweepInputs(ilmenite).map((input) => input.key)).toContain("fIlmenite");
    expect(sweepInputs(ilmenite).map((input) => input.key)).not.toContain("Vcell");
    expect(sweepInputs(DEFAULTS).map((input) => input.key)).not.toContain("chiIce");
  });

  it("keeps every grid value inside the engine bounds, ends included", () => {
    for (const input of sweepInputs(DEFAULTS)) {
      for (const log of [false, true]) {
        const values = axisValues(input, LINE_POINTS, log && input.min > 0);
        expect(values[0]).toBe(paramBounds(input.key)!.min);
        expect(values.at(-1)).toBe(paramBounds(input.key)!.max);
        expect(normalizeParams({ ...DEFAULTS, [input.key]: values[17] }).warnings).toEqual([]);
      }
    }
  });

  it("runs the engine at each point with everything else held at the live case", () => {
    const live: SimParams = { ...DEFAULTS, reserveDays: 45 };
    const target = sweepInputs(live).find((input) => input.key === "targetKgPerDay")!;
    const run = runSweep(live, { ...target, log: true }, null, "energy.gridPowerW");
    expect(run.points).toHaveLength(LINE_POINTS);
    const point = run.points[10]!;
    expect(point.y).toBeNull();
    expect(point.value).toBe(simulate({ ...live, targetKgPerDay: point.x }).energy.gridPowerW);
    // log spacing: equal ratios between neighbours
    expect(run.points[2]!.x / run.points[1]!.x).toBeCloseTo(run.points[1]!.x / run.points[0]!.x, 9);

    const reserve = sweepInputs(live).find((input) => input.key === "reserveDays")!;
    const grid = runSweep(live, { ...target, log: true }, { ...reserve, log: false }, "logistics.totalInfraMassKg");
    expect(grid.points).toHaveLength(GRID_POINTS * GRID_POINTS);
    const cell = grid.points[GRID_POINTS * 3 + 5]!;
    expect(cell.x).toBe(grid.x.values[5]);
    expect(cell.y).toBe(grid.y!.values[3]);
    expect(cell.value).toBe(simulate({ ...live, targetKgPerDay: cell.x, reserveDays: cell.y! }).logistics.totalInfraMassKg);
  });

  it("lists headline outputs first, then every scalar the result reports, and reads them by path", () => {
    const result = simulate(DEFAULTS);
    const outputs = sweepOutputs(result);
    expect(outputs[0]!.path).toBe("energy.secTotal_kWhPerKg");
    expect(outputs.map((item) => item.path)).toContain("power.radiatorM2");
    expect(new Set(outputs.map((item) => item.path)).size).toBe(outputs.length);
    for (const item of outputs.filter((output) => output.section !== "HEADLINE")) {
      expect(outputValue(result, item.path)).not.toBeNull();
    }
    expect(outputValue(result, "campaign.paybackDays")).toBe(result.campaign.paybackDays);
    expect(outputValue(result, "energy.flows")).toBeNull();
    expect(outputValue(result, "no.such.path")).toBeNull();
  });

  it("exports each point with its inputs, the output by path, and alarms", () => {
    const target = sweepInputs(DEFAULTS).find((input) => input.key === "targetKgPerDay")!;
    const reserve = sweepInputs(DEFAULTS).find((input) => input.key === "reserveDays")!;
    const csv = sweepCsv(runSweep(DEFAULTS, { ...target, log: false }, { ...reserve, log: false }, "energy.secTotal_kWhPerKg"));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("param.targetKgPerDay [kg/day],param.reserveDays [day],energy.secTotal_kWhPerKg,alarms");
    expect(lines).toHaveLength(1 + GRID_POINTS * GRID_POINTS);
  });
});

describe("sweep and frontier panels", () => {
  beforeAll(() => {
    // Panel charts size themselves with ResizeObserver, which jsdom lacks.
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  });
  beforeEach(() => useStore.getState().applyPatch({}));
  afterEach(() => {
    cleanup();
    useStore.getState().applyPatch({});
  });

  it("draws a line, switches to a map with a second input, and applies a picked point undoably", () => {
    render(<SweepPanel />);
    expect(screen.getByRole("img", { name: /^Energy per kg of product \[kWh\/kg\] against / })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Second sweep input" }), { target: { value: "reserveDays" } });
    expect(document.querySelectorAll(".sweep-cell")).toHaveLength(GRID_POINTS * GRID_POINTS);

    const grid = screen.getByLabelText(/Sweep grid/);
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    fireEvent.keyDown(grid, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "APPLY POINT" }));
    const params = useStore.getState().params;
    expect(params.reserveDays).not.toBe(DEFAULTS.reserveDays);
    expect(params.targetKgPerDay).not.toBe(DEFAULTS.targetKgPerDay);
    act(() => useStore.getState().undoParams());
    expect(useStore.getState().params.reserveDays).toBe(DEFAULTS.reserveDays);
  });

  it("selects a point from a tap alone, with no hover before it", () => {
    render(<SweepPanel />);
    // jsdom lays the chart out at the origin, so client coordinates are chart coordinates
    fireEvent.click(screen.getByLabelText(/Sweep points/), { clientX: 200, clientY: 150 });
    expect(screen.getByRole("button", { name: "APPLY POINT" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Second sweep input" }), { target: { value: "reserveDays" } });
    expect(screen.queryByRole("button", { name: "APPLY POINT" })).toBeNull();
    fireEvent.click(screen.getByLabelText(/Sweep grid/), { clientX: 200, clientY: 200 });
    expect(screen.getByRole("button", { name: "APPLY POINT" })).toBeTruthy();
  });

  it("offers the frontier any rail input beyond its suggested axes", () => {
    render(<FrontierExplorer />);
    const axisA = screen.getByRole("combobox", { name: "Frontier parameter A" }) as HTMLSelectElement;
    const values = [...axisA.options].map((option) => option.value);
    expect(values.slice(0, 3)).toEqual(["targetKgPerDay", "missionYears", "reserveDays"]);
    expect(values).toContain("eMining");
    fireEvent.change(axisA, { target: { value: "eMining" } });
    expect(axisA.value).toBe("eMining");
  });
});
