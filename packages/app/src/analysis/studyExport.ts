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
import { paramsToUrl } from "../lib/url";

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
    sourceVersion: payload.version,
    scenarios,
    findings,
    rejectedCount
  };
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
