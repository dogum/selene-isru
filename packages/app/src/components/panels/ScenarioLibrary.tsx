import { serializeSiteDesign } from "@selene-isru/engine";
import { useRef, useState } from "react";
import {
  downloadText,
  previewStudyExport,
  scenariosCsv,
  studyExport,
  studyScenarioResult
} from "../../analysis/studyExport";
import type { StudyImportPreview } from "../../analysis/studyExport";
import { formatQtyText } from "../../lib/format";
import { paramsToUrl } from "../../lib/url";
import {
  MAX_PINNED_SCENARIOS,
  MAX_STUDY_SCENARIOS,
  useStore
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

export function ScenarioLibrary(): React.JSX.Element {
  const scenarios = useStore((s) => s.scenarioLibrary);
  const currentName = useStore((s) => s.ui.currentScenarioName);
  const saveCurrentScenario = useStore((s) => s.saveCurrentScenario);
  const loadScenario = useStore((s) => s.loadScenario);
  const renameScenario = useStore((s) => s.renameScenario);
  const duplicateScenario = useStore((s) => s.duplicateScenario);
  const deleteScenario = useStore((s) => s.deleteScenario);
  const toggleScenarioPin = useStore((s) => s.toggleScenarioPin);
  const importScenarios = useStore((s) => s.importScenarios);
  const [saveName, setSaveName] = useState(currentName);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importPreview, setImportPreview] =
    useState<StudyImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pinned = scenarios.filter((scenario) => scenario.pinned).slice(0, MAX_PINNED_SCENARIOS);

  resultCache.clear();

  return (
    <section className="scenario-library">
      <div className="panel-header">
        LOCAL SCENARIO LIBRARY
        <span className="num">{scenarios.length}/{MAX_STUDY_SCENARIOS}</span>
      </div>
      <p className="panel-caption">
        Cases stay in this browser. Pin up to four for the comparison matrix; export them for review or transfer.
      </p>

      <div className="scenario-save-row">
        <input
          value={saveName}
          aria-label="New scenario name"
          onChange={(event) => setSaveName(event.target.value)}
        />
        <button
          type="button"
          className="topbar-btn"
          disabled={scenarios.length >= MAX_STUDY_SCENARIOS}
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
              VERSION {importPreview.sourceVersion ?? "?"} ·{" "}
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
                importScenarios(importPreview.scenarios);
                setImportStatus(
                  `${importPreview.scenarios.length} case${
                    importPreview.scenarios.length === 1 ? "" : "s"
                  } imported`
                );
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
              <div className="scenario-card-actions">
                <button type="button" onClick={() => loadScenario(scenario.id)}>LOAD</button>
                <button type="button" onClick={() => toggleScenarioPin(scenario.id)}>
                  {scenario.pinned ? "UNPIN" : "PIN"}
                </button>
                <button type="button" onClick={() => duplicateScenario(scenario.id)}>COPY</button>
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
        </div>
      )}
    </section>
  );
}
