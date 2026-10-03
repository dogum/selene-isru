import type { SimParams } from "@selene-isru/engine";
import { boundedRange, clampToBounds } from "./bounds";

export type SweepKey =
  | "targetKgPerDay"
  | "Vcell"
  | "etaCurrent"
  | "reserveDays"
  | "missionYears"
  | "chiIce"
  | "Nmli"
  | "etaCell"
  | "alphaSpecific"
  | "shieldDesignM";

export interface SweepParam {
  key: SweepKey;
  label: string;
  min: number;
  max: number;
  log?: boolean;
  site?: SimParams["site"];
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
  { key: "Vcell", label: "MRE cell voltage", min: 3.5, max: 5, site: "equatorial" },
  { key: "etaCurrent", label: "Current efficiency", min: 0.5, max: 0.95, site: "equatorial" },
  { key: "shieldDesignM", label: "Shield depth", min: 0.5, max: 5, site: "equatorial" },
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
