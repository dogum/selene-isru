import { DEFAULTS, PARAM_META } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";

/**
 * Compact query-string round-trip for scenario sharing (§5).
 * Only non-default params are serialized; parsing tolerates unknown keys and
 * garbage values (the engine clamps on simulate anyway).
 */
export function serializeParams(params: SimParams): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(PARAM_META) as Array<keyof SimParams>) {
    const value = params[key];
    const fallback = DEFAULTS[key];
    if (value === fallback) {
      continue;
    }
    if (typeof value === "number") {
      if (typeof fallback === "number" && Math.abs(value - fallback) < 1e-12 * Math.max(1, Math.abs(fallback))) {
        continue;
      }
      search.set(key, String(value));
    } else {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

export function parseParams(query: string): Partial<SimParams> {
  const search = new URLSearchParams(query);
  const patch: Record<string, number | string | boolean> = {};
  for (const key of Object.keys(PARAM_META) as Array<keyof SimParams>) {
    const raw = search.get(key);
    if (raw === null) {
      continue;
    }
    const fallback = DEFAULTS[key];
    if (typeof fallback === "number") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        patch[key] = parsed;
      }
    } else if (typeof fallback === "boolean") {
      if (raw === "true" || raw === "false") {
        patch[key] = raw === "true";
      }
    } else if (key === "site") {
      if (raw === "equatorial" || raw === "polar") {
        patch[key] = raw;
      }
    } else if (key === "storageStream") {
      if (["auto", "lox", "water-ice", "liquid-water", "lh2", "lch4", "co2-feed", "custom"].includes(raw)) {
        patch[key] = raw;
      }
    } else if (key === "cryoControlMode") {
      if (["zero-boiloff", "passive", "capacity-limited"].includes(raw)) {
        patch[key] = raw;
      }
    } else if (key === "polarProfileMode") {
      if (raw === "scalar" || raw === "profile") {
        patch[key] = raw;
      }
    } else if (key === "polarProfileData") {
      if (raw.length <= 100_000) {
        patch[key] = raw;
      }
    }
  }
  return patch as Partial<SimParams>;
}

export function paramsToUrl(params: SimParams): string {
  const query = serializeParams(params);
  const base = `${window.location.origin}${window.location.pathname}`;
  return query.length > 0 ? `${base}?${query}` : base;
}
