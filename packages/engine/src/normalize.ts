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

    if (key === "storageStream") {
      const options = new Set(["auto", "lox", "water-ice", "liquid-water", "lh2", "lch4", "co2-feed", "custom"]);
      if (typeof raw === "string" && options.has(raw)) {
        assign("storageStream", raw as SimParams["storageStream"]);
      } else {
        assign("storageStream", DEFAULTS.storageStream);
        warnings.push({ id: "param-clamped", severity: "info", module: "params", message: "Parameter was reset to a supported option.", value: 0, limit: 0 });
      }
      continue;
    }

    if (key === "polarProfileMode") {
      if (raw === "scalar" || raw === "profile") {
        assign("polarProfileMode", raw);
      } else {
        assign("polarProfileMode", DEFAULTS.polarProfileMode);
        warnings.push({ id: "param-clamped", severity: "info", module: "params", message: "Parameter was reset to a supported option.", value: 0, limit: 0 });
      }
      continue;
    }

    if (key === "polarProfileData") {
      if (typeof raw === "string" && raw.length <= 100_000) {
        assign("polarProfileData", raw);
      } else {
        assign("polarProfileData", DEFAULTS.polarProfileData);
        warnings.push({ id: "param-clamped", severity: "info", module: "params", message: "Imported profile data exceeded the supported text boundary.", value: 0, limit: 100_000 });
      }
      continue;
    }

    if (key === "cryoControlMode") {
      const options = new Set(["zero-boiloff", "passive", "capacity-limited"]);
      if (typeof raw === "string" && options.has(raw)) {
        assign("cryoControlMode", raw as SimParams["cryoControlMode"]);
      } else {
        assign("cryoControlMode", DEFAULTS.cryoControlMode);
        warnings.push({ id: "param-clamped", severity: "info", module: "params", message: "Parameter was reset to a supported option.", value: 0, limit: 0 });
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
