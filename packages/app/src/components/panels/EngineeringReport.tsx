import { simulate } from "@selene-isru/engine";
import { useMemo } from "react";
import {
  downloadText,
  reportSnapshot,
  scenariosCsv,
  studyExport
} from "../../analysis/studyExport";
import { formatQtyText } from "../../lib/format";
import { paramsToUrl } from "../../lib/url";
import { useStore } from "../../state/store";

function energyRows(result: ReturnType<typeof simulate>): Array<{ label: string; value: number }> {
  const totals = new Map<string, number>();
  for (const edge of result.energy.flows) {
    totals.set(edge.to, (totals.get(edge.to) ?? 0) + edge.kWhPerKg);
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function EngineeringReport(): React.JSX.Element {
  const params = useStore((s) => s.params);
  const currentName = useStore((s) => s.ui.currentScenarioName);
  const scenarios = useStore((s) => s.scenarioLibrary);
  const pinned = scenarios.filter((scenario) => scenario.pinned);
  const snapshot = useMemo(() => reportSnapshot(params), [params]);
  const result = snapshot.result;
  const flows = energyRows(result);
  const generatedAt = new Date().toLocaleString();

  return (
    <section className="engineering-report" aria-label="Engineering study report">
      <div className="report-toolbar no-print">
        <span>REVIEW-READY STUDY SNAPSHOT</span>
        <button type="button" className="topbar-btn" onClick={() => window.print()}>
          PRINT / SAVE PDF
        </button>
        <button
          type="button"
          className="topbar-btn"
          onClick={() => downloadText(
            "selene-engineering-study.json",
            JSON.stringify(studyExport(scenarios), null, 2),
            "application/json"
          )}
        >
          JSON
        </button>
        <button
          type="button"
          className="topbar-btn"
          onClick={() => downloadText("selene-engineering-study.csv", scenariosCsv(scenarios), "text/csv")}
        >
          CSV
        </button>
      </div>

      <header className="report-head">
        <div>
          <span className="reactor-eyebrow">SELENE-ISRU · ENGINEERING STUDY</span>
          <h2>{currentName || "Untitled lunar ISRU case"}</h2>
          <p>{result.site.toUpperCase()} SITE · {result.power.architecture.toUpperCase()} POWER · GENERATED {generatedAt}</p>
        </div>
        <div className={result.warnings.length > 0 ? "report-status caution" : "report-status"}>
          {result.warnings.length > 0 ? `${result.warnings.length} MODEL CAUTION${result.warnings.length === 1 ? "" : "S"}` : "IN MODEL RANGE"}
        </div>
      </header>

      <div className="report-kpis">
        <div><span>PRODUCT TARGET</span><strong>{formatQtyText(result.production.targetKgPerDay, "kg/day")}</strong></div>
        <div><span>TOTAL SEC</span><strong>{formatQtyText(result.energy.secTotal_kWhPerKg, "kWh/kg", 4)}</strong></div>
        <div><span>GRID POWER</span><strong>{formatQtyText(result.energy.gridPowerW, "W")}</strong></div>
        <div><span>INFRASTRUCTURE</span><strong>{formatQtyText(result.logistics.totalInfraMassKg, "kg")}</strong></div>
        <div><span>MISSIONS</span><strong>{formatQtyText(result.logistics.nMissions, "msn", 0)}</strong></div>
        <div><span>PAYBACK</span><strong>{formatQtyText(result.logistics.paybackDays, "days")}</strong></div>
      </div>

      <div className="report-grid">
        <section>
          <h3>Mission definition</h3>
          <dl>
            <div><dt>Site</dt><dd>{params.site}</dd></div>
            <div><dt>Output</dt><dd>{formatQtyText(params.targetKgPerDay, "kg/day")}</dd></div>
            <div><dt>Lifetime</dt><dd>{formatQtyText(params.missionYears, "yr")}</dd></div>
            <div><dt>Power</dt><dd>{result.power.architecture}</dd></div>
            <div><dt>Reserve</dt><dd>{formatQtyText(params.reserveDays, "days")}</dd></div>
            <div><dt>Sabatier</dt><dd>{params.enableSabatier ? "enabled" : "disabled"}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Uncertainty · P10 / P50 / P90</h3>
          <dl>
            <div>
              <dt>Payback</dt>
              <dd>{formatQtyText(snapshot.uncertainty.paybackDays.p10, "days")} / {formatQtyText(snapshot.uncertainty.paybackDays.p50, "days")} / {formatQtyText(snapshot.uncertainty.paybackDays.p90, "days")}</dd>
            </div>
            <div>
              <dt>SEC</dt>
              <dd>{formatQtyText(snapshot.uncertainty.secTotal.p10, "kWh/kg", 4)} / {formatQtyText(snapshot.uncertainty.secTotal.p50, "kWh/kg", 4)} / {formatQtyText(snapshot.uncertainty.secTotal.p90, "kWh/kg", 4)}</dd>
            </div>
            <div>
              <dt>Missions</dt>
              <dd>{snapshot.uncertainty.nMissions.p10.toFixed(0)} / {snapshot.uncertainty.nMissions.p50.toFixed(0)} / {snapshot.uncertainty.nMissions.p90.toFixed(0)}</dd>
            </div>
          </dl>
          <p className="report-note">192 deterministic samples: ±10% output plus the dominant site-process uncertainty.</p>
        </section>
      </div>

      <div className="report-grid">
        <section>
          <h3>Specific-energy breakdown</h3>
          <table>
            <tbody>
              {flows.map((row) => (
                <tr key={row.label}><th>{row.label}</th><td>{formatQtyText(row.value, "kWh/kg", 4)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3>Landed mass manifest</h3>
          <table>
            <tbody>
              {result.logistics.manifest.map((row) => (
                <tr key={row.subsystem}><th>{row.subsystem}</th><td>{formatQtyText(row.massKg, "kg")}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="report-section">
        <h3>Constraints and caveats</h3>
        {result.warnings.length > 0 ? (
          <ul>{result.warnings.map((warning) => <li key={`${warning.id}-${warning.module}`}>{warning.message}</li>)}</ul>
        ) : (
          <p>No engine warning is active at the current operating point.</p>
        )}
        <ul>
          <li>Steady-state analytical sizing; campaign scheduling, reliability, crew, and spares are outside the present boundary.</li>
          <li>Input evidence and validity limits are available from each control's information disclosure.</li>
          <li>Python and TypeScript engines are parity-tested, but parity does not constitute physical validation.</li>
        </ul>
      </section>

      {pinned.length > 0 && (
        <section className="report-section report-comparison">
          <h3>Pinned scenario comparison</h3>
          <table>
            <thead><tr><th>Case</th><th>Site</th><th>SEC</th><th>Power</th><th>Infra mass</th><th>Missions</th></tr></thead>
            <tbody>
              {pinned.map((scenario) => {
                const compared = simulate(scenario.params);
                return (
                  <tr key={scenario.id}>
                    <th>{scenario.name}</th>
                    <td>{scenario.params.site}</td>
                    <td>{formatQtyText(compared.energy.secTotal_kWhPerKg, "kWh/kg", 4)}</td>
                    <td>{formatQtyText(compared.energy.gridPowerW, "W")}</td>
                    <td>{formatQtyText(compared.logistics.totalInfraMassKg, "kg")}</td>
                    <td>{compared.logistics.nMissions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <footer className="report-footer">
        <span>REPRODUCIBILITY LINK</span>
        <a href={paramsToUrl(params)}>{paramsToUrl(params)}</a>
      </footer>
    </section>
  );
}
