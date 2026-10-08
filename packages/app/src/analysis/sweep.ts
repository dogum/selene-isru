import type { SimParams } from "@selene-isru/engine";
import { boundedRange, clampToBounds } from "./bounds";

/** Any input can be a frontier axis; the curated list below just comes first. */
export type SweepKey = keyof SimParams;

export interface SweepParam {
  key: SweepKey;
  label: string;
  /** rail group, for inputs offered beyond the curated list */
  group?: string;
  min: number;
  max: number;
  log?: boolean;
  site?: SimParams["site"];
  /** restrict to one equatorial oxygen process; omit = either */
  process?: SimParams["equatorialProcess"];
  /** restrict to one ilmenite feedstock; omit = either */
  feed?: SimParams["ilmFeed"];
}

/** The ilmenite grade input the plant reads: the soil's or the basalt's. */
export function ilmeniteGradeKey(params: { ilmFeed: string }): "fIlmenite" | "fIlmBasalt" {
  return params.ilmFeed === "basalt" ? "fIlmBasalt" : "fIlmenite";
}

/** Whether a site-, process- or feed-specific option acts on this configuration. */
export function appliesToCase(
  option: { site?: SimParams["site"]; process?: SimParams["equatorialProcess"]; feed?: SimParams["ilmFeed"] },
  params: Pick<SimParams, "site" | "equatorialProcess" | "ilmFeed">
): boolean {
  if (option.site !== undefined && option.site !== params.site) return false;
  if (params.site !== "equatorial") return true;
  if (option.process !== undefined && option.process !== params.equatorialProcess) return false;
  return option.feed === undefined || params.equatorialProcess !== "ilmenite" || option.feed === params.ilmFeed;
}

/**
 * Curated frontier axes. The ranges are presentation choices and are
 * intersected with the engine bounds in `sweepValues`, so a range written
 * wider than PARAM_META cannot produce clamped duplicate points.
 */
export const FRONTIER_PARAMS: SweepParam[] = [
  { key: "targetKgPerDay", label: "Output", min: 10, max: 20_000, log: true },
  { key: "missionYears", label: "Mission years", min: 1, max: 20 },
  { key: "reserveDays", label: "Reserve days", min: 5, max: 60 },
  { key: "etaCell", label: "PV efficiency", min: 0.15, max: 0.4 },
  { key: "alphaSpecific", label: "Nuclear kg/kW", min: 8, max: 80, log: true },
  { key: "Nmli", label: "MLI layers", min: 10, max: 80 },
  { key: "Vcell", label: "MRE cell voltage", min: 3.5, max: 5, site: "equatorial", process: "mre" },
  { key: "etaCurrent", label: "Current efficiency", min: 0.5, max: 0.95, site: "equatorial", process: "mre" },
  { key: "shieldDesignM", label: "Shield depth", min: 0.5, max: 5, site: "equatorial", process: "mre" },
  { key: "fIlmenite", label: "Ilmenite in soil", min: 0.01, max: 0.2, log: true, site: "equatorial", process: "ilmenite", feed: "soil" },
  { key: "fIlmBasalt", label: "Ilmenite in basalt", min: 0.05, max: 0.45, site: "equatorial", process: "ilmenite", feed: "basalt" },
  { key: "ilmConcentrateGrade", label: "Concentrate grade", min: 0.2, max: 1, site: "equatorial", process: "ilmenite" },
  { key: "etaIlmHeatRecovery", label: "Feed heat recovered", min: 0, max: 0.9, site: "equatorial", process: "ilmenite" },
  { key: "chiIce", label: "Polar ice fraction", min: 0.005, max: 0.12, log: true, site: "polar" }
];

/** `n` grid values across the param's range, kept inside the engine bounds. */
export function sweepValues(param: SweepParam, n: number): number[] {
  const range = boundedRange(param.key, param.min, param.max);
  const lo = Math.max(1e-9, range.min);
  const hi = Math.max(lo, range.max);
  return Array.from({ length: n }, (_, index) => {
    const u = n === 1 ? 0.5 : index / (n - 1);
    const value = param.log && hi > lo ? lo * Math.pow(hi / lo, u) : lo + (hi - lo) * u;
    // Log spacing can overshoot the upper bound by a rounding ulp, which the
    // engine would then clamp and flag.
    return clampToBounds(param.key, value);
  });
}
