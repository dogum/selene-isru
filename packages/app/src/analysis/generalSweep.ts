import { PARAM_META, simulate } from "@selene-isru/engine";
import type { SimParams, SimResult } from "@selene-isru/engine";
import { groupsForSite, railParamsForGroup } from "../controls/manifest";
import { clampToBounds } from "./bounds";
import { toCsv } from "./csv";

/**
 * A general sweep: any input the rail shows for this case, across its full
 * engine range, against any numeric engine output. Everything else is held
 * at the live case. Every point is a full `simulate()` run.
 */

export interface SweepInput {
  key: keyof SimParams;
  label: string;
  unit: string;
  group: string;
  min: number;
  max: number;
  /** log spacing by default: positive range spanning at least 50× */
  log: boolean;
}

export interface SweepOutput {
  /** engine result path, e.g. `energy.secTotal_kWhPerKg`; the field name carries the unit */
  path: string;
  label: string;
  section: string;
}

export interface SweepPoint {
  x: number;
  /** null on a one-input sweep */
  y: number | null;
  /** null where the output does not exist at this point (e.g. no payback) */
  value: number | null;
  alarms: number;
  patch: Partial<SimParams>;
}

export interface SweepAxis {
  key: keyof SimParams;
  log: boolean;
  values: number[];
}

export interface SweepRun {
  x: SweepAxis;
  y: SweepAxis | null;
  output: string;
  points: SweepPoint[];
}

export const LINE_POINTS = 41;
export const GRID_POINTS = 21;

/** Inputs the rail shows for this case, in rail order; inputs it hides cannot act here. */
export function sweepInputs(params: SimParams, activeStreams?: ReadonlySet<string>): SweepInput[] {
  const seen = new Set<keyof SimParams>();
  const inputs: SweepInput[] = [];
  for (const group of groupsForSite(params.site)) {
    if (group.gatedBy !== undefined && !params[group.gatedBy]) continue;
    for (const def of railParamsForGroup(group, params, activeStreams)) {
      if (seen.has(def.key) || !(def.max > def.min)) continue;
      seen.add(def.key);
      inputs.push({
        key: def.key,
        label: def.label,
        unit: def.unit === "1" ? "" : def.unit,
        group: group.label,
        min: def.min,
        max: def.max,
        log: def.min > 0 && def.max / def.min >= 50
      });
    }
  }
  return inputs;
}

/** Plain-language names for the outputs most trades are about; listed first. */
export const HEADLINE_OUTPUTS: ReadonlyArray<{ path: string; label: string }> = [
  { path: "energy.secTotal_kWhPerKg", label: "Energy per kg of product [kWh/kg]" },
  { path: "energy.gridPowerW", label: "Grid power [W]" },
  { path: "logistics.totalInfraMassKg", label: "Landed plant mass [kg]" },
  { path: "logistics.nMissions", label: "Lander missions" },
  { path: "logistics.leverageL", label: "Leverage [kg saved per kg landed]" },
  { path: "campaign.paybackDays", label: "Payback [day from first landing]" },
  { path: "campaign.returnRatio", label: "Campaign return [kg saved per kg spent]" },
  { path: "campaign.netLeoMassKg", label: "Net mass saved in LEO [kg]" },
  { path: "cryo.boiloffKgPerDay", label: "Residual storage loss [kg/day]" }
];

/** Read a numeric leaf by dotted path; null when absent or not a finite number. */
export function outputValue(result: SimResult, path: string): number | null {
  let node: unknown = result;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "number" && Number.isFinite(node) ? node : null;
}

/**
 * Every numeric output the engine reports for this case: the headline list,
 * then each scalar leaf of the result's sections (arrays such as flows and
 * the manifest are left to their own panels). Nullable leaves (payback) are
 * listed from the result's type, so they stay offered when this case has none.
 */
export function sweepOutputs(result: SimResult): SweepOutput[] {
  const outputs: SweepOutput[] = HEADLINE_OUTPUTS.map((item) => ({ ...item, section: "HEADLINE" }));
  const listed = new Set(outputs.map((item) => item.path));
  const walk = (node: unknown, path: string, section: string): void => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const next = `${path}.${key}`;
      if (typeof value === "number" && !listed.has(next)) {
        outputs.push({ path: next, label: next, section });
        listed.add(next);
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        walk(value, next, section);
      }
    }
  };
  for (const [section, node] of Object.entries(result)) {
    walk(node, section, section.toUpperCase());
  }
  return outputs;
}

/** `n` values across [min, max], log-spaced when asked, kept inside the engine bounds. */
export function axisValues(input: Pick<SweepInput, "key" | "min" | "max">, n: number, log: boolean): number[] {
  const lo = input.min;
  const hi = Math.max(lo, input.max);
  const logged = log && lo > 0 && hi > lo;
  return Array.from({ length: n }, (_, index) => {
    // the ends are the bounds exactly, not an ulp inside or out
    if (n > 1 && index === 0) return lo;
    if (n > 1 && index === n - 1) return hi;
    const u = n === 1 ? 0.5 : index / (n - 1);
    const value = logged ? lo * Math.pow(hi / lo, u) : lo + (hi - lo) * u;
    return clampToBounds(input.key, value);
  });
}

/** Simulate the sweep. One input gives LINE_POINTS points; two give a GRID_POINTS² grid. */
export function runSweep(
  params: SimParams,
  x: SweepInput & { log: boolean },
  y: (SweepInput & { log: boolean }) | null,
  output: string
): SweepRun {
  const xAxis: SweepAxis = { key: x.key, log: x.log, values: axisValues(x, y === null ? LINE_POINTS : GRID_POINTS, x.log) };
  const yAxis: SweepAxis | null = y === null ? null : { key: y.key, log: y.log, values: axisValues(y, GRID_POINTS, y.log) };
  const points: SweepPoint[] = [];
  for (const yValue of yAxis?.values ?? [null]) {
    for (const xValue of xAxis.values) {
      const patch = { [x.key]: xValue, ...(y === null || yValue === null ? {} : { [y.key]: yValue }) } as Partial<SimParams>;
      const result = simulate({ ...params, ...patch });
      points.push({
        x: xValue,
        y: yValue,
        value: outputValue(result, output),
        alarms: result.warnings.filter((warning) => warning.severity === "alarm").length,
        patch
      });
    }
  }
  return { x: xAxis, y: yAxis, output, points };
}

function paramHeader(key: keyof SimParams): string {
  const unit = PARAM_META[key].unit;
  return `param.${String(key)}${unit.length > 0 ? ` [${unit}]` : ""}`;
}

/** Every sweep point: the swept inputs with units, the output by engine path, and its alarm count. */
export function sweepCsv(run: SweepRun): string {
  return toCsv<SweepPoint>(
    [
      { header: paramHeader(run.x.key), value: (point) => point.x },
      ...(run.y === null ? [] : [{ header: paramHeader(run.y.key), value: (point: SweepPoint) => point.y }]),
      { header: run.output, value: (point) => point.value },
      { header: "alarms", value: (point) => point.alarms }
    ],
    run.points
  );
}
