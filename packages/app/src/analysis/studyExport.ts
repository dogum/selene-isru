import { sampleUncertainty, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import type { StudyScenario } from "../state/store";
import { paramsToUrl } from "../lib/url";

export interface StudyExport {
  schema: "selene-isru-study";
  version: 1;
  exportedAt: string;
  scenarios: StudyScenario[];
}

export function studyExport(scenarios: StudyScenario[]): StudyExport {
  return {
    schema: "selene-isru-study",
    version: 1,
    exportedAt: new Date().toISOString(),
    scenarios
  };
}

export function parseStudyExport(value: unknown): StudyScenario[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const payload = value as Partial<StudyExport>;
  return payload.schema === "selene-isru-study" && Array.isArray(payload.scenarios)
    ? payload.scenarios
    : [];
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

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function scenariosCsv(scenarios: StudyScenario[]): string {
  const rows = scenarios.map((scenario) => {
    const result = simulate(scenario.params);
    return {
      name: scenario.name,
      site: scenario.params.site,
      pinned: scenario.pinned,
      targetKgPerDay: scenario.params.targetKgPerDay,
      missionYears: scenario.params.missionYears,
      architecture: result.power.architecture,
      secKWhPerKg: result.energy.secTotal_kWhPerKg,
      gridPowerW: result.energy.gridPowerW,
      infrastructureMassKg: result.logistics.totalInfraMassKg,
      missions: result.logistics.nMissions,
      paybackDays: result.logistics.paybackDays,
      leverage: result.logistics.leverageL,
      warnings: result.warnings.length,
      reproducibilityUrl: paramsToUrl(scenario.params)
    };
  });
  const keys = Object.keys(rows[0] ?? {
    name: "",
    site: "",
    pinned: false,
    targetKgPerDay: 0,
    missionYears: 0,
    architecture: "",
    secKWhPerKg: 0,
    gridPowerW: 0,
    infrastructureMassKg: 0,
    missions: 0,
    paybackDays: 0,
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
