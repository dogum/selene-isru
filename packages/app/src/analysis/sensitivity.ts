import { simulate } from "@selene-isru/engine";
import type { SimParams, SimResult, UncertaintySpec } from "@selene-isru/engine";
import { clampToBounds } from "./bounds";

export interface SensitivityRow {
  key: keyof SimParams;
  /** Requested relative input spread (fraction). */
  rel: number;
  /** Input values actually simulated, after clamping to the engine bounds. */
  lowInput: number;
  highInput: number;
  /** True when a requested bound fell outside the engine range and was capped. */
  capped: boolean;
  /** Output response at each input bound, percent change from the base value (−10 = 10% lower). */
  low: number;
  high: number;
  swing: number;
}

/**
 * One-at-a-time local sensitivity: each input is moved to value·(1 ± rel),
 * clamped to its engine bounds, and the metric response is reported as a
 * percent change from the base case. Clamping here matters because the engine would
 * otherwise clamp silently, so a ±12% step on a 0.9 efficiency would be
 * labelled +12% while actually simulating +10%.
 */
export function oneAtATimeSensitivity(
  params: SimParams,
  spec: UncertaintySpec[],
  metric: (result: SimResult) => number
): SensitivityRow[] {
  const baseValue = metric(simulate(params));
  const scale = Math.max(1e-12, Math.abs(baseValue));
  const rows: SensitivityRow[] = [];
  for (const item of spec) {
    const value = params[item.key];
    if (typeof value !== "number") {
      continue;
    }
    const requestedLow = value * (1 - item.rel);
    const requestedHigh = value * (1 + item.rel);
    const lowInput = clampToBounds(item.key, requestedLow);
    const highInput = clampToBounds(item.key, requestedHigh);
    const low = ((metric(simulate({ ...params, [item.key]: lowInput })) - baseValue) / scale) * 100;
    const high = ((metric(simulate({ ...params, [item.key]: highInput })) - baseValue) / scale) * 100;
    rows.push({
      key: item.key,
      rel: item.rel,
      lowInput,
      highInput,
      capped: lowInput !== requestedLow || highInput !== requestedHigh,
      low,
      high,
      swing: Math.abs(high - low)
    });
  }
  return rows.sort((a, b) => b.swing - a.swing);
}
