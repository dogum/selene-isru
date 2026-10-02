import {
  canonicalSiteDesign,
  DEFAULTS,
  evaluateSiteDesign,
  parseSiteDesign,
  sampleUncertainty,
  simulate
} from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import type { StudyScenario } from "../state/store";
import { formatQtyText } from "../lib/format";
import { paramsToUrl } from "../lib/url";
import { CASE_SCHEMA, CASE_VERSION, fileStem, resultDrift } from "./caseExport";

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

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function scenariosCsv(scenarios: StudyScenario[]): string {
  const rows = scenarios.map((scenario) => {
    const evaluation = scenario.kind === "custom" &&
      scenario.design !== undefined
      ? evaluateSiteDesign(scenario.design)
      : null;
    const result = studyScenarioResult(scenario);
    return {
      name: scenario.name,
      kind: scenario.kind,
      site: scenario.params.site,
      pinned: scenario.pinned,
      targetKgPerDay: scenario.params.targetKgPerDay,
      achievableKgPerDay:
        evaluation?.achievableOutputKgPerDay ??
        result.production.targetKgPerDay,
      topologyValid: evaluation?.topologyValid ?? true,
      bottleneck: evaluation?.bottleneck?.label ?? "",
      missionYears: scenario.params.missionYears,
      architecture: result.power.architecture,
      secKWhPerKg: result.energy.secTotal_kWhPerKg,
      gridPowerW: result.energy.gridPowerW,
      infrastructureMassKg: result.logistics.totalInfraMassKg,
      missions: result.logistics.nMissions,
      plantMassThroughputDays: result.logistics.plantMassThroughputDays,
      leverage: result.logistics.leverageL,
      warnings: result.warnings.length,
      reproducibilityUrl: paramsToUrl(scenario.params)
    };
  });
  const keys = Object.keys(rows[0] ?? {
    name: "",
    kind: "",
    site: "",
    pinned: false,
    targetKgPerDay: 0,
    achievableKgPerDay: 0,
    topologyValid: true,
    bottleneck: "",
    missionYears: 0,
    architecture: "",
    secKWhPerKg: 0,
    gridPowerW: 0,
    infrastructureMassKg: 0,
    missions: 0,
    plantMassThroughputDays: 0,
    leverage: 0,
    warnings: 0,
    reproducibilityUrl: ""
  });
  return [
    keys.join(","),
    ...rows.map((row) =>
      keys.map((key) => csvCell(row[key as keyof typeof row])).join(",")
    )
  ].join("\n");
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

export function reportSnapshot(params: SimParams): {
  result: ReturnType<typeof simulate>;
  uncertainty: ReturnType<typeof sampleUncertainty>;
} {
  const result = simulate(params);
  const dominant: keyof SimParams = params.site === "polar" ? "chiIce" : "etaCurrent";
  return {
    result,
    uncertainty: sampleUncertainty(
      params,
      [
        { key: "targetKgPerDay", rel: 0.1 },
        { key: dominant, rel: dominant === "chiIce" ? 0.25 : 0.12 }
      ],
      { n: 192, seed: 2026 }
    )
  };
}
