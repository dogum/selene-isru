import { PARAM_META } from "@selene-isru/engine";
import type { CampaignTimelinePoint, SimParams, SimResult, TimeseriesResult, UncertaintyBand, UncertaintyResult } from "@selene-isru/engine";
import type { Candidate } from "./brief";
import { toCsv, type CsvColumn } from "./csv";
import type { SensitivityRow } from "./sensitivity";

/**
 * CSV builders for the data behind each analysis panel. Each returns exactly
 * what the panel plots, at full precision, with units in the headers (or in
 * the engine field names, which carry them).
 */

function paramHeader(key: keyof SimParams): string {
  const unit = PARAM_META[key].unit;
  return `param.${String(key)}${unit.length > 0 ? ` [${unit}]` : ""}`;
}

export function flowsCsv(result: SimResult): string {
  const total = result.energy.secTotal_kWhPerKg;
  return toCsv<SimResult["energy"]["flows"][number]>(
    [
      { header: "from", value: (flow) => flow.from },
      { header: "to", value: (flow) => flow.to },
      { header: "energy [kWh/kg product]", value: (flow) => flow.kWhPerKg },
      { header: "share of SEC [fraction]", value: (flow) => (total > 0 ? flow.kWhPerKg / total : null) }
    ],
    result.energy.flows
  );
}

export function manifestCsv(result: SimResult): string {
  const total = result.logistics.totalInfraMassKg;
  return toCsv<SimResult["logistics"]["manifest"][number]>(
    [
      { header: "subsystem", value: (row) => row.subsystem },
      { header: "mass [kg]", value: (row) => row.massKg },
      { header: "share of landed mass [fraction]", value: (row) => (total > 0 ? row.massKg / total : null) }
    ],
    result.logistics.manifest
  );
}

/** Every timeseries point; field names carry their units (tHours, loadW, tankFillKg, ...). */
export function timeseriesCsv(timeseries: TimeseriesResult): string {
  const first = timeseries.points[0];
  if (first === undefined) return "";
  const keys = Object.keys(first) as Array<keyof typeof first>;
  return toCsv(
    keys.map((key) => ({ header: String(key), value: (point: typeof first) => point[key] })),
    timeseries.points
  );
}

/** The campaign ledger over time; LEO columns are kg of mass in low Earth orbit. */
export function campaignCsv(timeline: readonly CampaignTimelinePoint[]): string {
  return toCsv<CampaignTimelinePoint>(
    [
      { header: "tDays [day from first landing]", value: (point) => point.tDays },
      { header: "event", value: (point) => point.event },
      { header: "landers", value: (point) => point.landers },
      { header: "landedMassKg [kg]", value: (point) => point.landedMassKg },
      { header: "productKg [kg]", value: (point) => point.productKg },
      { header: "leoMassSpentKg [kg in LEO]", value: (point) => point.leoMassSpentKg },
      { header: "leoMassSavedKg [kg in LEO]", value: (point) => point.leoMassSavedKg }
    ],
    timeline
  );
}

export interface FrontierCsvPoint {
  x: number;
  y: number;
  patch: Partial<SimParams>;
  frontier: boolean;
  feasible: boolean;
  warningCount: number;
}

export function frontierCsv(
  points: readonly FrontierCsvPoint[],
  sweepKeys: ReadonlyArray<keyof SimParams>,
  axes: { x: string; y: string }
): string {
  const columns: Array<CsvColumn<FrontierCsvPoint>> = [
    ...sweepKeys.map((key) => ({ header: paramHeader(key), value: (point: FrontierCsvPoint) => point.patch[key] as number })),
    { header: axes.x, value: (point) => point.x },
    { header: axes.y, value: (point) => point.y },
    { header: "withinActiveConstraints", value: (point) => point.feasible },
    { header: "pareto", value: (point) => point.frontier },
    { header: "warnings.count", value: (point) => point.warningCount }
  ];
  return toCsv(columns, points);
}

export function sensitivityCsv(rows: readonly SensitivityRow[], metric: string): string {
  return toCsv<SensitivityRow>(
    [
      { header: "input", value: (row) => String(row.key) },
      { header: "unit", value: (row) => PARAM_META[row.key].unit },
      { header: "requestedSpread [fraction]", value: (row) => row.rel },
      { header: "lowInput", value: (row) => row.lowInput },
      { header: "highInput", value: (row) => row.highInput },
      { header: "cappedAtEngineBound", value: (row) => row.capped },
      { header: `${metric} at low input [% of base]`, value: (row) => row.low },
      { header: `${metric} at high input [% of base]`, value: (row) => row.high },
      { header: "swing [percentage points]", value: (row) => row.swing }
    ],
    rows
  );
}

export function bandsCsv(
  bands: UncertaintyResult,
  spec: ReadonlyArray<{ key: keyof SimParams; rel: number }>,
  samples: number,
  seed: number
): string {
  const metrics = Object.entries(bands) as Array<[string, UncertaintyBand]>;
  const inputs = spec.map((item) => `${String(item.key)}±${item.rel}`).join(" ");
  return toCsv<[string, UncertaintyBand]>(
    [
      { header: "metric", value: ([name]) => name },
      { header: "p10", value: ([, band]) => band.p10 },
      { header: "p50", value: ([, band]) => band.p50 },
      { header: "p90", value: ([, band]) => band.p90 },
      { header: "mean", value: ([, band]) => band.mean },
      { header: "samples", value: () => samples },
      { header: "seed", value: () => seed },
      { header: "inputs [relative 1-sigma, Gaussian]", value: () => inputs }
    ],
    metrics
  );
}

/** Every Brief candidate in ranked order, not just the three shown. */
export function briefCandidatesCsv(candidates: readonly Candidate[]): string {
  const keys: Array<keyof SimParams> = ["site", "reserveDays", "etaCell", "alphaSpecific", "Vcell", "etaCurrent", "chiIce", "cpRegCold", "enableSabatier", "targetKgPerDay", "missionYears"];
  const ranks = new Map(candidates.map((candidate, index) => [candidate, index + 1]));
  return toCsv<Candidate>(
    [
      { header: "rank", value: (candidate) => ranks.get(candidate) ?? null },
      { header: "withinActiveConstraints", value: (candidate) => candidate.feasible },
      { header: "score", value: (candidate) => candidate.score },
      { header: "violations", value: (candidate) => candidate.violations.join(" | ") },
      ...keys.map((key) => ({ header: paramHeader(key), value: (candidate: Candidate) => candidate.params[key] as number | string | boolean })),
      { header: "power.architecture", value: (candidate) => candidate.result.power.architecture },
      { header: "energy.secTotal_kWhPerKg", value: (candidate) => candidate.result.energy.secTotal_kWhPerKg },
      { header: "energy.gridPowerW", value: (candidate) => candidate.result.energy.gridPowerW },
      { header: "logistics.totalInfraMassKg", value: (candidate) => candidate.result.logistics.totalInfraMassKg },
      { header: "logistics.nMissions", value: (candidate) => candidate.result.logistics.nMissions },
      { header: "logistics.plantMassThroughputDays", value: (candidate) => candidate.result.logistics.plantMassThroughputDays }
    ],
    candidates
  );
}
