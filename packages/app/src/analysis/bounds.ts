import { PARAM_META } from "@selene-isru/engine";
import type { ParamMeta, SimParams } from "@selene-isru/engine";

export interface ParamBounds {
  min: number;
  max: number;
}

/**
 * The engine's accepted range for a numeric input, read from PARAM_META so
 * analysis grids cannot drift outside what `normalizeParams` will keep.
 * Returns null for non-numeric or unbounded keys.
 */
export function paramBounds(key: keyof SimParams): ParamBounds | null {
  const meta: ParamMeta = PARAM_META[key];
  if (typeof meta.min !== "number" || typeof meta.max !== "number") {
    return null;
  }
  return { min: meta.min, max: meta.max };
}

/** Clamp a value to the engine bounds for `key` (identity when unbounded). */
export function clampToBounds(key: keyof SimParams, value: number): number {
  const bounds = paramBounds(key);
  if (bounds === null) {
    return value;
  }
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

/**
 * Intersect an analysis range with the engine bounds. A curated sweep range is
 * a presentation choice; the engine range is the hard limit, so a range that
 * reaches past it is narrowed rather than letting points collapse onto
 * clamped duplicates.
 */
export function boundedRange(key: keyof SimParams, min: number, max: number): ParamBounds {
  const lo = clampToBounds(key, min);
  const hi = clampToBounds(key, max);
  return lo <= hi ? { min: lo, max: hi } : { min: hi, max: lo };
}
