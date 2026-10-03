import { PARAM_META, serializeSiteDesign } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { caseExport, fileStem } from "../../analysis/caseExport";
import { BUILD_INFO } from "../../lib/build";
import { useRef, useState } from "react";
import {
  differingInputRows,
  downloadText,
  previewStudyExport,
  scenariosCsv,
  studyExport,
  studyScenarioResult
} from "../../analysis/studyExport";
import type { StudyImportPreview } from "../../analysis/studyExport";
import { formatQtyText } from "../../lib/format";
import { MAX_SCENARIO_NOTES } from "../../lib/scenarioNotes";
import { paramsToUrl } from "../../lib/url";
import {
  MAX_PINNED_SCENARIOS,
  MAX_STUDY_SCENARIOS,
  useStore,
  type ScenarioImportSummary
} from "../../state/store";

const COMPARISON_METRICS = [
  { label: "Output", value: (id: string) => formatQtyText(simulateFor(id).production.targetKgPerDay, "kg/day") },
  { label: "SEC", value: (id: string) => formatQtyText(simulateFor(id).energy.secTotal_kWhPerKg, "kWh/kg", 4) },
  { label: "Grid", value: (id: string) => formatQtyText(simulateFor(id).energy.gridPowerW, "W") },
  { label: "Infra mass", value: (id: string) => formatQtyText(simulateFor(id).logistics.totalInfraMassKg, "kg") },
  { label: "Missions", value: (id: string) => formatQtyText(simulateFor(id).logistics.nMissions, "msn", 0) },
  { label: "Plant-mass throughput equivalent", value: (id: string) => formatQtyText(simulateFor(id).logistics.plantMassThroughputDays, "days") }
];

const resultCache = new Map<string, ReturnType<typeof studyScenarioResult>>();
function simulateFor(id: string): ReturnType<typeof studyScenarioResult> {
  const state = useStore.getState();
  const scenario = state.scenarioLibrary.find((item) => item.id === id);
  const cached = resultCache.get(id);
  if (cached !== undefined && scenario !== undefined) {
    return cached;
  }
  const result = scenario === undefined
    ? state.result
    : studyScenarioResult(scenario);
  resultCache.set(id, result);
  return result;
}

/** How many inputs a saved case sets differently from the live case. */
function inputsDifferingFrom(params: SimParams, live: SimParams): number {
  return (Object.keys(PARAM_META) as Array<keyof SimParams>).filter((key) => params[key] !== live[key]).length;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Report only what the import changed; never echo the preview count. */
function importSummaryText(summary: ScenarioImportSummary): string {
  const parts = [`${plural(summary.added, "case")} added`];
  if (summary.replaced > 0) {
    parts.push(`${summary.replaced} replaced an existing case with the same id`);
  }
  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped: the library holds ${MAX_STUDY_SCENARIOS}`);
  }
  if (summary.unpinned > 0) {
    parts.push(`${summary.unpinned} left unpinned: pin limit ${MAX_PINNED_SCENARIOS}`);
  }
  return parts.join(" · ");
}

export function ScenarioLibrary(): React.JSX.Element {
  const scenarios = useStore((s) => s.scenarioLibrary);
  const currentName = useStore((s) => s.ui.currentScenarioName);
  const saveCurrentScenario = useStore((s) => s.saveCurrentScenario);
  const loadScenario = useStore((s) => s.loadScenario);
  const renameScenario = useStore((s) => s.renameScenario);
  const duplicateScenario = useStore((s) => s.duplicateScenario);
  const deleteScenario = useStore((s) => s.deleteScenario);
  const toggleScenarioPin = useStore((s) => s.toggleScenarioPin);
  const setScenarioNotes = useStore((s) => s.setScenarioNotes);
  const updateScenarioFromCurrent = useStore((s) => s.updateScenarioFromCurrent);
  const importScenarios = useStore((s) => s.importScenarios);
  const liveParams = useStore((s) => s.params);
  const workspaceMode = useStore((s) => s.workspaceMode);
  const [confirmUpdateId, setConfirmUpdateId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState(currentName);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importPreview, setImportPreview] =
    useState<StudyImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pinned = scenarios.filter((scenario) => scenario.pinned).slice(0, MAX_PINNED_SCENARIOS);
  const libraryFull = scenarios.length >= MAX_STUDY_SCENARIOS;
  const pinsFull = scenarios.filter((scenario) => scenario.pinned).length >= MAX_PINNED_SCENARIOS;
  const fullReason = `The library holds ${MAX_STUDY_SCENARIOS} cases. Delete one to save, copy, or import more.`;
  const pinReason = `Up to ${MAX_PINNED_SCENARIOS} cases can be pinned. Unpin one first.`;

  resultCache.clear();

  return (
    <section className="scenario-library">
      <div className="panel-header">
        LOCAL SCENARIO LIBRARY
        <span className="num">{scenarios.length}/{MAX_STUDY_SCENARIOS}</span>
      </div>
      <p className="panel-caption">
        Cases stay in this browser. Pin up to four for the comparison matrix; export them for review or transfer.
        Notes travel with the JSON and CSV exports.
      </p>
      {libraryFull && <p className="scenario-import-status" role="status">LIBRARY FULL · {fullReason}</p>}

      <div className="scenario-save-row">
        <input
          value={saveName}
          aria-label="New scenario name"
          onChange={(event) => setSaveName(event.target.value)}
        />
        <button
          type="button"
          className="topbar-btn"
          disabled={libraryFull}
          title={libraryFull ? fullReason : undefined}
          onClick={() => saveCurrentScenario(saveName)}
        >
          SAVE LIVE CASE
        </button>
      </div>

      <div className="scenario-library-actions">
        <button
          type="button"
          className="topbar-btn"
          onClick={() => downloadText(
            "selene-study.json",
            JSON.stringify(studyExport(scenarios), null, 2),
            "application/json"
          )}
        >
          EXPORT JSON
        </button>
        <button
          type="button"
          className="topbar-btn"
          onClick={() => downloadText("selene-study.csv", scenariosCsv(scenarios), "text/csv")}
        >
          EXPORT CSV
        </button>
        <button type="button" className="topbar-btn" onClick={() => fileRef.current?.click()}>
          IMPORT
        </button>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="application/json,.json"
          aria-label="Import a study or case JSON file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file === undefined) {
              return;
            }
            void file.text().then((text) => {
              try {
                const preview = previewStudyExport(
                  JSON.parse(text) as unknown
                );
                setImportPreview(preview);
                setImportStatus(
                  `${preview.scenarios.length} ready · ` +
                  `${preview.rejectedCount} rejected · review before import`
                );
              } catch {
                setImportStatus("Import failed: choose a SELENE study JSON file");
                setImportPreview(null);
              } finally {
                event.target.value = "";
              }
            });
          }}
        />
      </div>
      {importStatus !== null && <p className="scenario-import-status" role="status">{importStatus}</p>}
      {importPreview !== null && (
        <section className="scenario-import-preview" aria-label="Study import preview">
          <div>
            <strong>
              {importPreview.sourceKind === "case" ? "CASE FILE" : `VERSION ${importPreview.sourceVersion ?? "?"}`} ·{" "}
              {importPreview.scenarios.length} ACCEPTABLE CASES
            </strong>
            <span>
              {importPreview.findings.filter((finding) =>
                finding.severity === "error"
              ).length} errors ·{" "}
              {importPreview.findings.filter((finding) =>
                finding.severity === "caution"
              ).length} cautions ·{" "}
              {importPreview.findings.filter((finding) =>
                finding.severity === "info"
              ).length} notes
            </span>
          </div>
          {(() => {
            const existing = new Set(scenarios.map((scenario) => scenario.id));
            const incomingNew = importPreview.scenarios.filter((scenario) => !existing.has(scenario.id)).length;
            const replacing = importPreview.scenarios.length - incomingNew;
            const free = Math.max(0, MAX_STUDY_SCENARIOS - scenarios.length);
            const notes: string[] = [];
            if (incomingNew > free) {
              notes.push(`Only ${free} of ${incomingNew} new cases fit; the library holds ${MAX_STUDY_SCENARIOS}.`);
            }
            if (replacing > 0) {
              notes.push(`${plural(replacing, "case")} will replace an existing case with the same id.`);
            }
            return notes.length > 0 ? <p className="scenario-import-capacity">{notes.join(" ")}</p> : null;
          })()}
          {importPreview.findings.length > 0 && (
            <ol>
              {importPreview.findings.slice(0, 8).map((finding, index) => (
                <li className={finding.severity} key={`${finding.message}-${index}`}>
                  <span>{finding.severity.toUpperCase()}</span>
                  <p>
                    {finding.scenarioName === undefined
                      ? ""
                      : `${finding.scenarioName}: `}
                    {finding.message}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <div className="scenario-card-actions">
            <button
              type="button"
              disabled={importPreview.scenarios.length === 0}
              onClick={() => {
                setImportStatus(importSummaryText(importScenarios(importPreview.scenarios)));
                setImportPreview(null);
              }}
            >
              ACCEPT IMPORT
            </button>
            <button
              type="button"
              onClick={() => {
                setImportPreview(null);
                setImportStatus("Import cancelled; the library was not changed");
              }}
            >
              CANCEL
            </button>
          </div>
        </section>
      )}

      <div className="scenario-cards">
        {scenarios.map((scenario) => {
          const result = studyScenarioResult(scenario);
          const differing = inputsDifferingFrom(scenario.params, liveParams);
          const sameKind = scenario.kind === workspaceMode;
          const updateReason = !sameKind
            ? `Open the ${workspaceMode === "custom" ? "Equatorial or Polar site" : "Custom Site"} to update this ${scenario.kind} case`
            : differing === 0
              ? "This case already matches the live case"
              : `Replace this case's inputs with the live case (${plural(differing, "input")} change); its name, notes, and pin stay`;
          return (
            <article key={scenario.id} className={scenario.pinned ? "pinned" : ""}>
              <div className="scenario-card-head">
                <input
                  value={scenario.name}
                  aria-label={`Rename ${scenario.name}`}
                  onChange={(event) => renameScenario(scenario.id, event.target.value)}
                />
                <span>
                  {scenario.kind.toUpperCase()} ·{" "}
                  {scenario.params.site.toUpperCase()} ·{" "}
                  {result.power.architecture.toUpperCase()}
                </span>
              </div>
              <div className="scenario-card-metrics mono">
                <span>{formatQtyText(result.production.targetKgPerDay, "kg/day")}</span>
                <span>{formatQtyText(result.energy.secTotal_kWhPerKg, "kWh/kg", 4)}</span>
                <span>{formatQtyText(result.logistics.totalInfraMassKg, "kg")}</span>
              </div>
              <p className={`scenario-card-live mono ${differing === 0 ? "same" : ""}`}>
                {differing === 0 ? "= LIVE CASE" : `LIVE CASE DIFFERS IN ${plural(differing, "INPUT").toUpperCase()}`}
              </p>
              <details className="scenario-card-notes" open={scenario.notes !== undefined}>
                <summary>NOTES{scenario.notes === undefined ? "" : ` · ${scenario.notes.length}/${MAX_SCENARIO_NOTES}`}</summary>
                <textarea
                  value={scenario.notes ?? ""}
                  maxLength={MAX_SCENARIO_NOTES}
                  rows={3}
                  placeholder="Why this case, its assumptions, what to check"
                  aria-label={`Notes for ${scenario.name}`}
                  onChange={(event) => setScenarioNotes(scenario.id, event.target.value)}
                />
              </details>
              <div className="scenario-card-actions">
                <button type="button" onClick={() => loadScenario(scenario.id)}>LOAD</button>
                <button
                  type="button"
                  disabled={!sameKind || differing === 0}
                  title={updateReason}
                  onClick={() => {
                    if (confirmUpdateId !== scenario.id) {
                      setConfirmUpdateId(scenario.id);
                      return;
                    }
                    updateScenarioFromCurrent(scenario.id);
                    setConfirmUpdateId(null);
                  }}
                  onBlur={() => setConfirmUpdateId((id) => (id === scenario.id ? null : id))}
                >
                  {confirmUpdateId === scenario.id ? "CONFIRM UPDATE" : "UPDATE"}
                </button>
                <button
                  type="button"
                  disabled={!scenario.pinned && pinsFull}
                  title={!scenario.pinned && pinsFull ? pinReason : undefined}
                  onClick={() => toggleScenarioPin(scenario.id)}
                >
                  {scenario.pinned ? "UNPIN" : "PIN"}
                </button>
                <button
                  type="button"
                  disabled={libraryFull}
                  title={libraryFull ? fullReason : undefined}
                  onClick={() => duplicateScenario(scenario.id)}
                >
                  COPY
                </button>
                {scenario.kind === "custom" && scenario.design !== undefined ? (
                  <button
                    type="button"
                    onClick={() => downloadText(
                      `${scenario.design!.name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase() || "selene-custom-site"}.json`,
                      serializeSiteDesign(scenario.design!),
                      "application/json"
                    )}
                  >
                    DESIGN JSON
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(paramsToUrl(scenario.params)).then(() => {
                        setCopiedId(scenario.id);
                        setTimeout(() => setCopiedId(null), 1200);
                      });
                    }}
                  >
                    {copiedId === scenario.id ? "COPIED" : "LINK"}
                  </button>
                )}
                <button
                  type="button"
                  title="Full case: every input with units, engine result, timeseries, and build provenance"
                  onClick={() => downloadText(
                    `selene-case-${fileStem(scenario.name)}-${BUILD_INFO.commit}.json`,
                    JSON.stringify(caseExport({
                      name: scenario.name,
                      kind: scenario.kind,
                      params: scenario.params,
                      ...(scenario.design === undefined ? {} : { design: scenario.design }),
                      ...(scenario.notes === undefined ? {} : { notes: scenario.notes })
                    }), null, 2),
                    "application/json"
                  )}
                >
                  JSON
                </button>
                <button type="button" onClick={() => deleteScenario(scenario.id)}>DELETE</button>
              </div>
            </article>
          );
        })}
      </div>

      {pinned.length > 0 && (
        <div className="scenario-matrix-wrap">
          <div className="panel-header">
            PINNED CASE COMPARISON
            <span className="num">{pinned.length} CASES</span>
          </div>
          <table className="scenario-matrix">
            <thead>
              <tr>
                <th>Metric</th>
                {pinned.map((scenario) => <th key={scenario.id}>{scenario.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_METRICS.map((metric) => (
                <tr key={metric.label}>
                  <th>{metric.label}</th>
                  {pinned.map((scenario) => <td key={scenario.id}>{metric.value(scenario.id)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {pinned.length > 1 && (() => {
            const rows = differingInputRows(pinned.map((scenario) => scenario.params));
            return (
              <>
                <div className="panel-header">
                  INPUTS THAT DIFFER
                  <span className="num">{plural(rows.length, "INPUT")}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="panel-caption">The pinned cases share every input.</p>
                ) : (
                  <table className="scenario-matrix scenario-input-diff">
                    <thead>
                      <tr>
                        <th>Input</th>
                        {pinned.map((scenario) => <th key={scenario.id}>{scenario.name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key}>
                          <th title={String(row.key)}>
                            {row.label}
                            {row.unit.length > 0 && <small> [{row.unit}]</small>}
                          </th>
                          {row.values.map((value, index) => (
                            <td key={pinned[index]!.id} className={value === row.values[0] ? "" : "differs"}>{value}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}
