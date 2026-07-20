import { DEFAULTS, PARAM_META } from "./constants";
import type { SimParams, Warning } from "./types";

export interface NormalizedParams {
  params: SimParams;
  warnings: Warning[];
}

export function normalizeParams(input: Partial<SimParams>): NormalizedParams {
  const params: SimParams = { ...DEFAULTS };
  const warnings: Warning[] = [];
  const keys = Object.keys(PARAM_META) as Array<keyof SimParams>;

  const assign = <K extends keyof SimParams>(key: K, value: SimParams[K]): void => {
    params[key] = value;
  };

  for (const key of keys) {
    if (!(key in input)) {
      continue;
    }

    const meta = PARAM_META[key];
    const defaultValue = DEFAULTS[key];
    const raw = input[key];

    if (typeof defaultValue === "number") {
      let next = typeof raw === "number" && Number.isFinite(raw) ? raw : defaultValue;
      const lower = "min" in meta ? meta.min : undefined;
      const upper = "max" in meta ? meta.max : undefined;
      let clamped = false;

      if (typeof lower === "number" && next < lower) {
        next = lower;
        clamped = true;
      }
      if (typeof upper === "number" && next > upper) {
        next = upper;
        clamped = true;
      }
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        clamped = true;
      }

      assign(key, next as SimParams[typeof key]);
      if (clamped) {
        warnings.push({
          id: "param-clamped",
          severity: "info",
          module: "params",
          message: "Parameter was clamped to its configured bounds.",
          value: typeof raw === "number" && Number.isFinite(raw) ? raw : defaultValue,
          limit: next
        });
      }
      continue;
    }

    if (key === "site") {
      if (raw === "equatorial" || raw === "polar") {
        assign("site", raw);
      } else {
        assign("site", DEFAULTS.site);
        warnings.push({
          id: "param-clamped",
          severity: "info",
          module: "params",
          message: "Parameter was clamped to its configured bounds.",
          value: 0,
          limit: 0
        });
      }
      continue;
    }

    if (typeof defaultValue === "boolean") {
      if (typeof raw === "boolean") {
        assign(key, raw as SimParams[typeof key]);
      } else {
        assign(key, defaultValue as SimParams[typeof key]);
        warnings.push({
          id: "param-clamped",
          severity: "info",
          module: "params",
          message: "Parameter was clamped to its configured bounds.",
          value: 0,
          limit: 0
        });
      }
    }
  }

  return { params, warnings };
}
