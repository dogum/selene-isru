import {
  canonicalSiteDesign,
  DEFAULTS,
  evaluateSiteDesign,
  PARAM_META,
  parseSiteDesign,
  sampleUncertainty,
  simulate
} from "@selene-isru/engine";
import type { CampaignResult, ParamMeta, SimParams, UncertaintySpec } from "@selene-isru/engine";
import { evidenceForParam } from "../controls/evidence";
import type { StudyScenario } from "../state/store";
import { formatQtyText } from "../lib/format";
import { nonDefaultParams, paramsToUrl } from "../lib/url";
import { BUILD_INFO, type BuildInfo } from "../lib/build";
import { CASE_SCHEMA, CASE_VERSION, fileStem, resultDrift } from "./caseExport";
import { toCsv, type CsvColumn, type CsvValue } from "./csv";

export interface StudyExport {
  schema: "selene-isru-study";
  version: 2;
  exportedAt: string;
  scenarios: StudyScenario[];
}

export interface StudyImportFinding {
  severity: "error" | "caution" | "info";
  message: string;
  scenarioName?: string;
}

export interface StudyImportPreview {
  /** "case" for a single full-fidelity case file (caseExport.ts) */
  sourceKind: "study" | "case";
  sourceVersion: 1 | 2 | null;
  scenarios: StudyScenario[];
  findings: StudyImportFinding[];
  rejectedCount: number;
}

export function studyExport(scenarios: StudyScenario[]): StudyExport {
  return {
    schema: "selene-isru-study",
    version: 2,
    exportedAt: new Date().toISOString(),
    scenarios: scenarios.map((scenario) => ({
      ...scenario,
      params: { ...scenario.params },
      ...(scenario.kind === "custom" && scenario.design !== undefined
        ? { design: canonicalSiteDesign(scenario.design) }
        : {})
    }))
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function previewStudyExport(value: unknown): StudyImportPreview {
  const blocked: StudyImportPreview = {
    sourceKind: "study",
    sourceVersion: null,
    scenarios: [],
    findings: [{
      severity: "error",
      message: "This is not a supported SELENE study export."
    }],
    rejectedCount: 0
  };
  if (typeof value !== "object" || value === null) {
    return blocked;
  }
  if ((value as { schema?: unknown }).schema === CASE_SCHEMA) {
    return previewCaseFile(value as Record<string, unknown>, blocked);
  }
  const payload = value as {
    schema?: unknown;
    version?: unknown;
    scenarios?: unknown;
  };
  if (
    payload.schema !== "selene-isru-study" ||
    (payload.version !== 1 && payload.version !== 2) ||
    !Array.isArray(payload.scenarios)
  ) {
    return blocked;
  }

  const scenarios: StudyScenario[] = [];
  const findings: StudyImportFinding[] = [];
  let rejectedCount = 0;
  for (const [index, raw] of payload.scenarios.entries()) {
    if (typeof raw !== "object" || raw === null) {
      rejectedCount += 1;
      findings.push({
        severity: "error",
        message: `Case ${index + 1} is not an object and will be skipped.`
      });
      continue;
    }
    const candidate = raw as Partial<StudyScenario>;
    const scenarioName = typeof candidate.name === "string"
      ? candidate.name.slice(0, 80)
      : `Case ${index + 1}`;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      typeof candidate.params !== "object" ||
      candidate.params === null ||
      !finiteNumber(candidate.createdAt) ||
      !finiteNumber(candidate.updatedAt) ||
      typeof candidate.pinned !== "boolean"
    ) {
      rejectedCount += 1;
      findings.push({
        severity: "error",
        scenarioName,
        message: "The case is missing stable identity, parameters, timestamps, or pin state and will be skipped."
      });
      continue;
    }
    if (
      payload.version === 2 &&
      candidate.kind !== undefined &&
      candidate.kind !== "authored" &&
      candidate.kind !== "custom"
    ) {
      rejectedCount += 1;
      findings.push({
        severity: "error",
        scenarioName,
        message: `The case kind "${String(candidate.kind)}" is not supported and will be skipped.`
      });
      continue;
    }

    const wantsCustom = payload.version === 2 && candidate.kind === "custom";
    const parsedDesign = wantsCustom
      ? parseSiteDesign(candidate.design)
      : null;
    if (wantsCustom && parsedDesign?.document === null) {
      rejectedCount += 1;
      findings.push({
        severity: "error",
        scenarioName,
        message: "The custom design document is unsupported or malformed and will be skipped."
      });
      continue;
    }
    if (parsedDesign?.document !== null && parsedDesign !== null) {
      const evaluation = evaluateSiteDesign(parsedDesign.document);
      for (const finding of [
        ...parsedDesign.findings,
        ...evaluation.findings
      ]) {
        findings.push({
          severity: finding.severity,
          scenarioName,
          message: finding.message
        });
      }
      scenarios.push({
        id: candidate.id,
        name: scenarioName,
        kind: "custom",
        params: evaluation.normalizedDesign.params,
        design: evaluation.normalizedDesign,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        pinned: candidate.pinned
      });
      continue;
    }

    scenarios.push({
      id: candidate.id,
      name: scenarioName,
      kind: "authored",
      params: {
        ...DEFAULTS,
        ...candidate.params
      },
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      pinned: candidate.pinned
    });
    if (payload.version === 1) {
      findings.push({
        severity: "info",
        scenarioName,
        message: "Migrated from study export version 1 as an authored parameter case."
      });
    }
  }
  return {
    sourceKind: "study",
    sourceVersion: payload.version,
    scenarios,
    findings,
    rejectedCount
  };
}

/**
 * A case file imports as one library case. Its id derives from the file, so
 * importing the same file twice replaces rather than duplicates. Headline
 * results are re-run and any difference from the file is reported, because
 * it means the model changed between export and import.
 */
function previewCaseFile(file: Record<string, unknown>, blocked: StudyImportPreview): StudyImportPreview {
  const meta = file.case as { name?: unknown; kind?: unknown } | undefined;
  const params = file.params;
  const exportedAt = typeof file.exportedAt === "string" ? Date.parse(file.exportedAt) : Number.NaN;
  if (file.version !== CASE_VERSION || typeof meta !== "object" || meta === null || typeof params !== "object" || params === null) {
    return blocked;
  }
  const name = typeof meta.name === "string" && meta.name.trim().length > 0 ? meta.name.slice(0, 80) : "Imported case";
  // Version 1 always writes the kind; anything else would lose design data.
  if (meta.kind !== "authored" && meta.kind !== "custom") {
    return {
      ...blocked,
      sourceKind: "case",
      rejectedCount: 1,
      findings: [{ severity: "error", scenarioName: name, message: "The case kind is missing or unsupported; expected \"authored\" or \"custom\"." }]
    };
  }
  const timestamp = Number.isFinite(exportedAt) ? exportedAt : Date.now();
  const id = `case-${timestamp.toString(36)}-${fileStem(name)}`.slice(0, 64);
  const findings: StudyImportFinding[] = [];
  let scenario: StudyScenario;

  if (meta.kind === "custom") {
    const custom = file.customSite as { design?: unknown } | undefined;
    const parsed = parseSiteDesign(custom?.design);
    if (parsed.document === null) {
      return {
        ...blocked,
        sourceKind: "case",
        rejectedCount: 1,
        findings: [{ severity: "error", scenarioName: name, message: "The case's custom design document is unsupported or malformed." }]
      };
    }
    const evaluation = evaluateSiteDesign(parsed.document);
    for (const finding of [...parsed.findings, ...evaluation.findings]) {
      findings.push({ severity: finding.severity, scenarioName: name, message: finding.message });
    }
    scenario = {
      id, name, kind: "custom",
      params: evaluation.normalizedDesign.params,
      design: evaluation.normalizedDesign,
      createdAt: timestamp, updatedAt: timestamp, pinned: false
    };
  } else {
    // Deliberately not normalized: loading goes through applyPatch, which
    // clamps and reports, exactly as for study imports.
    scenario = {
      id, name, kind: "authored",
      params: { ...DEFAULTS, ...(params as Partial<SimParams>) },
      createdAt: timestamp, updatedAt: timestamp, pinned: false
    };
  }

  const build = file.build as { commit?: unknown } | undefined;
  const from = typeof build?.commit === "string" ? ` (exported from build ${build.commit})` : "";
  for (const drift of resultDrift(file.result, studyScenarioResult(scenario))) {
    findings.push({
      severity: "caution",
      scenarioName: name,
      message: `The current model computes ${drift.label} ${formatQtyText(drift.current, drift.unit, 4)}; the file recorded ${formatQtyText(drift.exported, drift.unit, 4)}${from}. The inputs import unchanged.`
    });
  }
  return { sourceKind: "case", sourceVersion: null, scenarios: [scenario], findings, rejectedCount: 0 };
}

export function parseStudyExport(value: unknown): StudyScenario[] {
  return previewStudyExport(value).scenarios;
}

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function studyScenarioResult(
  scenario: StudyScenario
): ReturnType<typeof simulate> {
  if (scenario.kind !== "custom" || scenario.design === undefined) {
    return simulate(scenario.params);
  }
  const evaluation = evaluateSiteDesign(scenario.design);
  return evaluation.topologyValid
    ? evaluation.achievedResult
    : evaluation.baseResult;
}

interface CsvCaseRow {
  scenario: StudyScenario;
  result: ReturnType<typeof simulate>;
  evaluation: ReturnType<typeof evaluateSiteDesign> | null;
  flows: Map<string, number>;
}

/** Campaign ledger fields in the study CSV; paybackDays is empty when the plant never pays back. */
const CAMPAIGN_COLUMNS: Array<keyof CampaignResult> = [
  "paybackDays",
  "paysBackInCampaign",
  "returnRatio",
  "netLeoMassKg",
  "leoMassSpentKg",
  "leoMassSavedKg",
  "deploymentDays",
  "firstProductDay",
  "deliveredKgPerDay",
  "resupplyKgPerYear",
  "cumulativeProductKg"
];

const STANDARD_MANIFEST = ["excavation fleet", "reactor/plant", "power system", "cryo block"];

/**
 * One row per case and one column per quantity: headline outputs named by
 * their result path (the name carries the unit), each energy-flow stage,
 * every input as `param.<key> [unit]`, the warning text, and provenance.
 * Numbers are unformatted so the file is ready for analysis.
 */
export function scenariosCsv(scenarios: StudyScenario[], exportedAt: Date = new Date(), build: BuildInfo = BUILD_INFO): string {
  const rows: CsvCaseRow[] = scenarios.map((scenario) => {
    const evaluation = scenario.kind === "custom" && scenario.design !== undefined ? evaluateSiteDesign(scenario.design) : null;
    const result = studyScenarioResult(scenario);
    return {
      scenario,
      result,
      evaluation,
      flows: new Map(result.energy.flows.map((flow) => [`${flow.from}->${flow.to}`, flow.kWhPerKg]))
    };
  });
  const flowKeys = [...new Set(rows.flatMap((row) => [...row.flows.keys()]))];
  const manifestMass = (row: CsvCaseRow, subsystem: string): number =>
    row.result.logistics.manifest.filter((item) => item.subsystem === subsystem).reduce((total, item) => total + item.massKg, 0);
  const otherMass = (row: CsvCaseRow): number =>
    row.result.logistics.manifest
      .filter((item) => !STANDARD_MANIFEST.includes(item.subsystem))
      .reduce((total, item) => total + item.massKg, 0);

  const columns: Array<CsvColumn<CsvCaseRow>> = [
    { header: "name", value: (row) => row.scenario.name },
    { header: "kind", value: (row) => row.scenario.kind },
    { header: "site", value: (row) => row.scenario.params.site },
    { header: "pinned", value: (row) => row.scenario.pinned },
    { header: "power.architecture", value: (row) => row.result.power.architecture },
    { header: "production.targetKgPerDay", value: (row) => row.result.production.targetKgPerDay },
    { header: "custom.achievableKgPerDay", value: (row) => row.evaluation?.achievableOutputKgPerDay ?? row.result.production.targetKgPerDay },
    { header: "custom.topologyValid", value: (row) => row.evaluation?.topologyValid ?? true },
    { header: "custom.bottleneck", value: (row) => row.evaluation?.bottleneck?.label ?? "" },
    { header: "energy.secTotal_kWhPerKg", value: (row) => row.result.energy.secTotal_kWhPerKg },
    { header: "energy.gridPowerW", value: (row) => row.result.energy.gridPowerW },
    { header: "logistics.totalInfraMassKg", value: (row) => row.result.logistics.totalInfraMassKg },
    { header: "logistics.nMissions", value: (row) => row.result.logistics.nMissions },
    { header: "logistics.leverageL", value: (row) => row.result.logistics.leverageL },
    { header: "logistics.plantMassThroughputDays", value: (row) => row.result.logistics.plantMassThroughputDays },
    { header: "logistics.payloadPerMissionKg", value: (row) => row.result.logistics.payloadPerMissionKg },
    ...CAMPAIGN_COLUMNS.map((key) => ({
      header: `campaign.${key}`,
      value: (row: CsvCaseRow) => row.result.campaign[key]
    })),
    ...STANDARD_MANIFEST.map((subsystem) => ({
      header: `manifest.${subsystem} [kg]`,
      value: (row: CsvCaseRow) => manifestMass(row, subsystem)
    })),
    { header: "manifest.other [kg]", value: otherMass },
    { header: "power.solarMassKg", value: (row) => row.result.power.solarMassKg },
    { header: "power.nuclearMassKg", value: (row) => row.result.power.nuclearMassKg },
    { header: "power.pCritW", value: (row) => row.result.power.pCritW },
    { header: "power.pCritDynamicW", value: (row) => row.result.power.pCritDynamicW },
    { header: "production.regolithKgPerDay", value: (row) => row.result.production.regolithKgPerDay },
    { header: "production.o2KgPerDay", value: (row) => row.result.production.o2KgPerDay },
    { header: "production.waterKgPerDay", value: (row) => row.result.production.waterKgPerDay },
    { header: "production.h2KgPerDay", value: (row) => row.result.production.h2KgPerDay },
    { header: "production.ch4KgPerDay", value: (row) => row.result.production.ch4KgPerDay },
    { header: "production.co2ImportedKgPerDay", value: (row) => row.result.production.co2ImportedKgPerDay },
    { header: "cryo.boiloffKgPerDay", value: (row) => row.result.cryo.boiloffKgPerDay },
    { header: "cryo.totalStorageMassKg", value: (row) => row.result.cryo.totalStorageMassKg },
    { header: "cryo.cryocoolerPowerW", value: (row) => row.result.cryo.cryocoolerPowerW },
    ...flowKeys.map((key) => ({
      header: `flow.${key} [kWh/kg]`,
      value: (row: CsvCaseRow) => row.flows.get(key) ?? null
    })),
    ...(Object.keys(PARAM_META) as Array<keyof SimParams>)
      .filter((key) => key !== "polarProfileData")
      .map((key) => ({
        header: `param.${String(key)}${PARAM_META[key].unit.length > 0 ? ` [${PARAM_META[key].unit}]` : ""}`,
        value: (row: CsvCaseRow) => row.scenario.params[key] as CsvValue
      })),
    { header: "param.polarProfileData [bytes]", value: (row) => row.scenario.params.polarProfileData.length },
    { header: "warnings.count", value: (row) => row.result.warnings.length },
    {
      header: "warnings.text",
      value: (row) => row.result.warnings.map((warning) => `${warning.severity} ${warning.id}: ${warning.message}`).join(" | ")
    },
    { header: "reproducibilityUrl", value: (row) => (row.scenario.kind === "custom" ? "" : paramsToUrl(row.scenario.params)) },
    { header: "build.commit", value: () => build.commit },
    { header: "build.engine", value: () => build.engine },
    { header: "exportedAt", value: () => exportedAt.toISOString() }
  ];
  return toCsv(columns, rows);
}

/**
 * The cases an engineering report describes: the live case it is written
 * about, followed by the pinned cases in its comparison table. The report's
 * JSON/CSV exports use this, not the whole library, so the file matches the
 * page it was downloaded from.
 */
export function reportScenarios(
  name: string,
  params: SimParams,
  library: StudyScenario[],
  now: number = Date.now()
): StudyScenario[] {
  const live: StudyScenario = {
    id: `report-${now.toString(36)}`,
    name: name.trim() || "Untitled lunar ISRU case",
    kind: "authored",
    params: { ...params },
    createdAt: now,
    updatedAt: now,
    pinned: false
  };
  return [live, ...library.filter((scenario) => scenario.pinned)];
}

export interface ReportUncertainty {
  spec: UncertaintySpec[];
  samples: number;
  seed: number;
  bands: ReturnType<typeof sampleUncertainty>;
}

export function reportSnapshot(params: SimParams): {
  result: ReturnType<typeof simulate>;
  uncertainty: ReportUncertainty;
} {
  const result = simulate(params);
  const dominant: keyof SimParams = params.site === "polar" ? "chiIce" : "etaCurrent";
  // A fixed, stated spec so a printed report says exactly what it sampled.
  const spec: UncertaintySpec[] = [
    { key: "targetKgPerDay", rel: 0.1 },
    { key: dominant, rel: dominant === "chiIce" ? 0.25 : 0.12 }
  ];
  const samples = 192;
  const seed = 2026;
  return { result, uncertainty: { spec, samples, seed, bands: sampleUncertainty(params, spec, { n: samples, seed }) } };
}

export interface ChangedInputRow {
  key: keyof SimParams;
  label: string;
  value: string;
  defaultValue: string;
  unit: string;
  maturity: string;
}

/** Every input that differs from its default, with unit and evidence maturity, for the report. */
export function changedInputRows(params: SimParams): ChangedInputRow[] {
  return (Object.entries(nonDefaultParams(params)) as Array<[keyof SimParams, SimParams[keyof SimParams]]>).map(([key, value]) => {
    const meta: ParamMeta = PARAM_META[key];
    const show = (raw: unknown): string =>
      key === "polarProfileData" ? `imported profile (${String(raw).length} bytes)` : String(raw);
    return {
      key,
      label: meta.description,
      value: show(value),
      defaultValue: show(DEFAULTS[key]),
      unit: meta.unit === "1" || meta.unit === "mode" ? "" : meta.unit,
      maturity:
        typeof meta.min === "number" && typeof meta.max === "number"
          ? evidenceForParam({ key, group: meta.group, source: meta.source, min: meta.min, max: meta.max, unit: meta.unit }).maturity
          : "MODEL SWITCH"
    };
  });
}
