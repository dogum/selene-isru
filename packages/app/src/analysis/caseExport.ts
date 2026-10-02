import {
  canonicalSiteDesign,
  evaluateSiteDesign,
  PARAM_META,
  simulate,
  simulateTimeseries
} from "@selene-isru/engine";
import type {
  SimParams,
  SimResult,
  SiteDesignDocument,
  TimeseriesOptions,
  TimeseriesResult
} from "@selene-isru/engine";
import { BUILD_INFO, MODEL_BOUNDARY, type BuildInfo } from "../lib/build";
import { nonDefaultParams, paramsToUrl } from "../lib/url";

export const CASE_SCHEMA = "selene-isru-case";
export const CASE_VERSION = 1;

/** Same sampling the live timeline uses. */
export const CASE_TIMESERIES: TimeseriesOptions = { cycles: 1, samplesPerCycle: 96 };

export interface CaseSource {
  name: string;
  kind: "authored" | "custom";
  params: SimParams;
  design?: SiteDesignDocument;
}

export interface CustomSiteExport {
  design: SiteDesignDocument;
  plannedTargetKgPerDay: number;
  achievableOutputKgPerDay: number;
  topologyValid: boolean;
  bottleneck: string | null;
  findings: Array<{ severity: string; message: string }>;
}

/**
 * Everything needed to read, check, or reproduce one case without the app:
 * the build that produced it, every input with its unit, the full engine
 * result, and the day/night timeseries. Custom cases add their design and
 * evaluation. The file is also importable into the Trade Study library.
 */
export interface CaseExport {
  schema: typeof CASE_SCHEMA;
  version: typeof CASE_VERSION;
  exportedAt: string;
  build: BuildInfo;
  modelBoundary: string;
  case: {
    name: string;
    kind: "authored" | "custom";
    /** Rebuilds an authored case in the app; null for custom designs (import the file instead). */
    reproducibilityUrl: string | null;
    nonDefaultParams: Partial<SimParams>;
  };
  units: {
    /** unit of every input, from constants.json */
    params: Record<string, string>;
    results: string;
  };
  params: SimParams;
  result: SimResult;
  timeseries: { options: TimeseriesOptions } & TimeseriesResult;
  customSite?: CustomSiteExport;
}

const RESULT_UNITS_NOTE =
  "Result field names carry their units: _kWhPerKg, _JPerKg, W, Kg, KgPerDay, Days, Hours, M, M2, K, Pa, V, A. Fractions are 0..1. Timeseries points are hourly (tHours).";

function paramUnits(): Record<string, string> {
  return Object.fromEntries(Object.entries(PARAM_META).map(([key, meta]) => [key, meta.unit]));
}

/** Result the case reports: the topology-gated achieved result for a custom design. */
function evaluateCase(source: CaseSource): { params: SimParams; result: SimResult; customSite?: CustomSiteExport } {
  if (source.kind !== "custom" || source.design === undefined) {
    return { params: source.params, result: simulate(source.params) };
  }
  const evaluation = evaluateSiteDesign(source.design);
  return {
    params: evaluation.normalizedDesign.params,
    result: evaluation.topologyValid ? evaluation.achievedResult : evaluation.baseResult,
    customSite: {
      design: canonicalSiteDesign(evaluation.normalizedDesign),
      plannedTargetKgPerDay: evaluation.plannedTargetKgPerDay,
      achievableOutputKgPerDay: evaluation.achievableOutputKgPerDay,
      topologyValid: evaluation.topologyValid,
      bottleneck: evaluation.bottleneck?.label ?? null,
      findings: evaluation.findings.map((finding) => ({ severity: finding.severity, message: finding.message }))
    }
  };
}

export function caseExport(source: CaseSource, now: Date = new Date(), build: BuildInfo = BUILD_INFO): CaseExport {
  const { params, result, customSite } = evaluateCase(source);
  return {
    schema: CASE_SCHEMA,
    version: CASE_VERSION,
    exportedAt: now.toISOString(),
    build,
    modelBoundary: MODEL_BOUNDARY,
    case: {
      name: source.name.trim() || "Untitled lunar ISRU case",
      kind: source.kind,
      reproducibilityUrl: source.kind === "custom" ? null : paramsToUrl(params),
      nonDefaultParams: nonDefaultParams(params)
    },
    units: { params: paramUnits(), results: RESULT_UNITS_NOTE },
    params: { ...params },
    result,
    timeseries: { options: CASE_TIMESERIES, ...simulateTimeseries(params, CASE_TIMESERIES) },
    ...(customSite === undefined ? {} : { customSite })
  };
}

/** Headline values compared on import to detect a model change since export. */
export const DRIFT_CHECKS: Array<{ label: string; unit: string; value: (result: SimResult) => number }> = [
  { label: "SEC", unit: "kWh/kg", value: (result) => result.energy.secTotal_kWhPerKg },
  { label: "grid power", unit: "W", value: (result) => result.energy.gridPowerW },
  { label: "landed mass", unit: "kg", value: (result) => result.logistics.totalInfraMassKg }
];

export interface ResultDrift {
  label: string;
  unit: string;
  exported: number;
  current: number;
}

/**
 * Headline values the current model computes differently from the file. A
 * difference means the model changed between export and import (as the v0.4
 * polar terms did), not that the file is wrong.
 */
export function resultDrift(exported: unknown, current: SimResult, relTol = 1e-6): ResultDrift[] {
  if (typeof exported !== "object" || exported === null) return [];
  const drift: ResultDrift[] = [];
  for (const check of DRIFT_CHECKS) {
    let then: number;
    try {
      then = check.value(exported as SimResult);
    } catch {
      continue;
    }
    if (typeof then !== "number" || !Number.isFinite(then)) continue;
    const now = check.value(current);
    if (Math.abs(now - then) > relTol * Math.max(1, Math.abs(then))) {
      drift.push({ label: check.label, unit: check.unit, exported: then, current: now });
    }
  }
  return drift;
}

/** Safe file stem from a case name. */
export function fileStem(name: string): string {
  return name.replaceAll(/[^a-z0-9]+/gi, "-").replaceAll(/^-|-$/g, "").toLowerCase() || "case";
}
