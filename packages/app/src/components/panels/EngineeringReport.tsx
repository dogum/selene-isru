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
  const alarmCount = result.warnings.filter((warning) => warning.severity === "alarm").length;

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
        <div className={alarmCount > 0 ? "report-status caution" : "report-status"}>
          {alarmCount > 0 ? `${alarmCount} IMPLEMENTED CONSTRAINT VIOLATION${alarmCount === 1 ? "" : "S"}` : "NO IMPLEMENTED CONSTRAINT VIOLATIONS"}
        </div>
      </header>

      <div className="report-kpis">
        <div><span>PRODUCT TARGET</span><strong>{formatQtyText(result.production.targetKgPerDay, "kg/day")}</strong></div>
        <div><span>TOTAL SEC</span><strong>{formatQtyText(result.energy.secTotal_kWhPerKg, "kWh/kg", 4)}</strong></div>
        <div><span>GRID POWER</span><strong>{formatQtyText(result.energy.gridPowerW, "W")}</strong></div>
        <div><span>INFRASTRUCTURE</span><strong>{formatQtyText(result.logistics.totalInfraMassKg, "kg")}</strong></div>
        <div><span>MISSIONS</span><strong>{formatQtyText(result.logistics.nMissions, "msn", 0)}</strong></div>
        <div><span>PLANT-MASS THROUGHPUT EQUIV.</span><strong>{formatQtyText(result.logistics.plantMassThroughputDays, "days")}</strong></div>
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
            <div><dt>Stored stream</dt><dd>{result.cryo.stream}</dd></div>
            <div><dt>Heat control</dt><dd>{result.cryo.controlMode}</dd></div>
            <div><dt>Storage inventories</dt><dd>{result.cryo.inventories.length}</dd></div>
            <div><dt>Site profile</dt><dd>{result.power.siteProfile.name}</dd></div>
            <div><dt>Sabatier</dt><dd>{params.site === "polar" ? (params.enableSabatier ? "enabled" : "disabled") : "not applicable"}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Illustrative sensitivity · P10 / P50 / P90</h3>
          <dl>
            <div>
              <dt>Mass-throughput equivalent</dt>
              <dd>{formatQtyText(snapshot.uncertainty.plantMassThroughputDays.p10, "days")} / {formatQtyText(snapshot.uncertainty.plantMassThroughputDays.p50, "days")} / {formatQtyText(snapshot.uncertainty.plantMassThroughputDays.p90, "days")}</dd>
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
          <p className="report-note">192 deterministic samples: illustrative parameter variation, not a calibrated probabilistic forecast.</p>
        </section>
      </div>

      <section className="report-section">
        <h3>Material conservation audit</h3>
        <table>
          <thead><tr><th>Process node</th><th>Mass in</th><th>Mass out</th><th>Residual</th></tr></thead>
          <tbody>
            {result.materials.balances.map((row) => (
              <tr key={row.id}>
                <th>{row.label}</th>
                <td>{formatQtyText(row.massInKgPerDay, "kg/day")}</td>
                <td>{formatQtyText(row.massOutKgPerDay, "kg/day")}</td>
                <td>{formatQtyText(row.residualKgPerDay, "kg/day", 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="report-note">Maximum absolute process-node residual: {formatQtyText(result.materials.maxAbsResidualKgPerDay, "kg/day", 4)}.</p>
      </section>

      <section className="report-section">
        <h3>Independent storage inventories</h3>
        <table>
          <thead><tr><th>Stream</th><th>Role</th><th>Rate</th><th>Reserve</th><th>Volume</th><th>Storage mass</th><th>Conditioning</th><th>Actual loss</th></tr></thead>
          <tbody>{result.cryo.inventories.map((item) => (
            <tr key={item.id}>
              <th>{item.stream}</th><td>{item.role}</td><td>{formatQtyText(item.rateKgPerDay, "kg/day")}</td>
              <td>{formatQtyText(item.reserveInventoryKg, "kg")}</td><td>{formatQtyText(item.volumeM3, "m³", 4)}</td>
              <td>{formatQtyText(item.storageMassKg, "kg")}</td><td>{formatQtyText(item.conditioningPowerW, "W")}</td>
              <td>{formatQtyText(item.actualLossKgPerDay, "kg/day", 4)}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <section className="report-section">
        <h3>Process-node energy conservation</h3>
        <table>
          <thead><tr><th>Process node</th><th>Electrical</th><th>Coupled input</th><th>Useful</th><th>Rejected</th><th>Accumulation</th><th>Residual</th></tr></thead>
          <tbody>{result.energy.balances.map((row) => (
            <tr key={row.id}>
              <th>{row.label}</th><td>{formatQtyText(row.electricalInputW, "W")}</td><td>{formatQtyText(row.coupledInputW, "W")}</td>
              <td>{formatQtyText(row.usefulOutputW, "W")}</td><td>{formatQtyText(row.rejectedHeatW, "W")}</td>
              <td>{formatQtyText(row.accumulationW, "W")}</td><td>{formatQtyText(row.residualW, "W", 4)}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="report-note">Maximum modeled energy residual: {formatQtyText(result.energy.maxAbsResidualW, "W", 4)} · grid allocation residual: {formatQtyText(result.energy.gridAllocationResidualW, "W", 4)}.</p>
      </section>

      {result.site === "equatorial" && (
        <section className="report-section">
          <h3>MRE voltage and electrode operating point</h3>
          <table><tbody>
            <tr><th>Reversible decomposition</th><td>{formatQtyText(result.electrolysis.reversibleVoltageV, "V", 4)}</td></tr>
            <tr><th>Activation overpotential</th><td>{formatQtyText(result.electrolysis.activationOverpotentialV, "V", 4)}</td></tr>
            <tr><th>Ohmic overpotential</th><td>{formatQtyText(result.electrolysis.ohmicOverpotentialV, "V", 4)}</td></tr>
            <tr><th>Concentration overpotential</th><td>{formatQtyText(result.electrolysis.concentrationOverpotentialV, "V", 4)}</td></tr>
            <tr><th>Unallocated voltage</th><td>{formatQtyText(result.electrolysis.unallocatedVoltageV, "V", 4)}</td></tr>
            <tr><th>Voltage margin</th><td>{formatQtyText(result.electrolysis.voltageMarginV, "V", 4)}</td></tr>
            <tr><th>Electrode area / current utilization</th><td>{formatQtyText(result.electrolysis.electrodeAreaM2, "m²", 4)} · {(result.electrolysis.currentUtilization * 100).toFixed(1)}%</td></tr>
          </tbody></table>
          <p className="report-note">This is a transparent lumped voltage-loss decomposition, not a validated geometry-, material-, bubble-, or lifetime-resolved MRE reactor solve.</p>
        </section>
      )}

      {result.site === "polar" && (
        <section className="report-section">
          <h3>Polar site-profile summary</h3>
          <table><tbody>
            <tr><th>Mode / name</th><td>{result.power.siteProfile.mode} · {result.power.siteProfile.name}</td></tr>
            <tr><th>Cycle / average illumination</th><td>{formatQtyText(result.power.siteProfile.cycleHours, "h")} · {(result.power.siteProfile.averageIllumination * 100).toFixed(1)}%</td></tr>
            <tr><th>Receiver visibility / longest outage</th><td>{(result.power.siteProfile.averageReceiverVisibility * 100).toFixed(1)}% · {formatQtyText(result.power.siteProfile.longestReceiverOutageHours, "h")}</td></tr>
            <tr><th>Average delivered fraction</th><td>{(result.power.siteProfile.averageDeliveredFraction * 100).toFixed(1)}%</td></tr>
            <tr><th>Surface-temperature range</th><td>{result.power.siteProfile.minimumSurfaceTemperatureK.toFixed(0)}–{result.power.siteProfile.maximumSurfaceTemperatureK.toFixed(0)} K</td></tr>
          </tbody></table>
        </section>
      )}

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
          <li>Conceptual systems tool only; not suitable for hardware design, safety analysis, cost commitment, or mission certification.</li>
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
