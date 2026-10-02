import { sampleUncertainty } from "@selene-isru/engine";
import type { UncertaintySpec } from "@selene-isru/engine";
import { useMemo, useRef, useState } from "react";
import {
  GOALS,
  OBJECTIVES,
  candidateDetail,
  energyDrivers,
  optimize,
  recommendationTitle,
  type GoalObjective,
  type GoalSite,
  type MissionConstraints,
  type OptimizationResult
} from "../analysis/brief";
import { briefCandidatesCsv } from "../analysis/panelExports";
import { useDialog } from "../lib/a11y";
import { ExportButton } from "./panels/ExportButton";
import { formatQtyText } from "../lib/format";
import { useStore } from "../state/store";

export function MissionBrief(): React.JSX.Element | null {
  const open = useStore((s) => s.ui.missionBriefOpen);
  const baseParams = useStore((s) => s.params);
  const applyPatch = useStore((s) => s.applyPatch);
  const setCompareFromCurrent = useStore((s) => s.setCompareFromCurrent);
  const setUi = useStore((s) => s.setUi);
  const [activeId, setActiveId] = useState("landed-mass");
  const [constraints, setConstraints] = useState<MissionConstraints>(GOALS[2]!.constraints);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeGoal = GOALS.find((goal) => goal.id === activeId) ?? GOALS[2]!;
  const selected = optimization?.candidates[selectedIndex] ?? null;

  const dialog = useRef<HTMLDivElement | null>(null);
  useDialog(dialog, { open, modal: true, onClose: () => setUi({ missionBriefOpen: false }) });

  // 192 engine runs; recompute only when the selected candidate changes, not
  // on every keystroke in the constraint fields.
  const uncertainty = useMemo(() => selected === null ? null : sampleUncertainty(
    selected.params,
    [
      { key: "targetKgPerDay", rel: 0.1 },
      selected.params.site === "polar" ? { key: "chiIce", rel: 0.25 } : { key: "etaCurrent", rel: 0.12 }
    ] as UncertaintySpec[],
    { n: 192, seed: 2026 }
  ), [selected]);

  if (!open) return null;
  const close = (): void => setUi({ missionBriefOpen: false });
  const drivers = selected === null ? [] : energyDrivers(selected.result);

  return (
    <div className="modal-scrim" onClick={close}>
      <div ref={dialog} tabIndex={-1} className="modal mission-brief" role="dialog" aria-modal="true" aria-label="Mission brief optimizer" onClick={(event) => event.stopPropagation()}>
        <div className="slideover-head">
          <span className="panel-header">MISSION BRIEF · BOUNDED DESIGN SEARCH</span>
          <button className="slideover-close" aria-label="Close mission brief" onClick={close}>✕</button>
        </div>
        <div className="modal-body mission-brief-body">
          <div className="brief-intro">
            <span className="reactor-eyebrow">CHOOSE A QUESTION, THEN SET THE CONSTRAINTS</span>
            <h2>What should this lunar system optimize for?</h2>
            <p>The brief evaluates a transparent bounded grid and applies nothing until you accept a recommendation.</p>
          </div>

          <div className="brief-goals">
            {GOALS.map((goal) => (
              <button key={goal.id} type="button" className={goal.id === activeId ? "active" : ""} onClick={() => {
                setActiveId(goal.id);
                setConstraints(goal.constraints);
                setOptimization(null);
                setSelectedIndex(0);
              }}>
                <strong>{goal.title}</strong><span>{goal.prompt}</span>
              </button>
            ))}
          </div>

          <section className="brief-constraint-builder">
            <label>SITE
              <select value={constraints.site} onChange={(event) => setConstraints({ ...constraints, site: event.target.value as GoalSite })}>
                <option value="either">Either site</option><option value="equatorial">Equatorial</option><option value="polar">Polar</option>
              </select>
            </label>
            <label>OBJECTIVE
              <select value={constraints.objective} onChange={(event) => setConstraints({ ...constraints, objective: event.target.value as GoalObjective })}>
                {OBJECTIVES.map((objective) => <option key={objective.id} value={objective.id}>{objective.label}</option>)}
              </select>
            </label>
            <label>OUTPUT · KG/DAY
              <input type="number" min="10" max="20000" value={constraints.targetKgPerDay} onChange={(event) => setConstraints({ ...constraints, targetKgPerDay: Number(event.target.value) })} />
            </label>
            <label>LIFETIME · YR
              <input type="number" min="1" max="20" value={constraints.missionYears} onChange={(event) => setConstraints({ ...constraints, missionYears: Number(event.target.value) })} />
            </label>
            <label>MAX MISSIONS
              <input type="number" min="1" max="200" value={constraints.maxMissions} onChange={(event) => setConstraints({ ...constraints, maxMissions: Number(event.target.value) })} />
            </label>
            <label>MAX POWER · MW
              <input type="number" min="0.1" max="500" step="0.5" value={constraints.maxPowerMw} onChange={(event) => setConstraints({ ...constraints, maxPowerMw: Number(event.target.value) })} />
            </label>
            <label>MAX INFRA · T
              <input type="number" min="1" max="5000" value={constraints.maxInfraT} onChange={(event) => setConstraints({ ...constraints, maxInfraT: Number(event.target.value) })} />
            </label>
            <label className="brief-check"><input type="checkbox" checked={constraints.allowSabatier} onChange={(event) => setConstraints({ ...constraints, allowSabatier: event.target.checked })} /> ALLOW SABATIER</label>
            <button type="button" className="brief-run" onClick={() => {
              setOptimization(optimize(baseParams, constraints));
              setSelectedIndex(0);
            }}>RUN DESIGN SEARCH</button>
          </section>

          {optimization !== null && selected !== null && uncertainty !== null && (
            <section className="brief-analysis" aria-live="polite">
              <div className="brief-analysis-head">
                <div><span className="reactor-eyebrow">RECOMMENDED BOUNDED DESIGN</span><h3>{recommendationTitle(selected)}</h3><small>{optimization.feasible} of {optimization.evaluated} cases satisfy the active implemented constraints</small></div>
                <span className={`brief-status ${selected.feasible ? "nominal" : "alarm"}`}>{selected.feasible ? "NO IMPLEMENTED CONSTRAINT VIOLATIONS" : "NO CASE SATISFIES ACTIVE CAPS"}</span>
              </div>
              <div className="brief-summary-grid">
                <div><span>PRIMARY ENERGY DRIVER</span><strong>{drivers[0]?.label.toUpperCase() ?? "—"}</strong><small>{formatQtyText(drivers[0]?.value ?? 0, "kWh/kg")}</small></div>
                <div><span>PLANT-MASS EQUIV. · P10–P90</span><strong>{formatQtyText(uncertainty.plantMassThroughputDays.p10, "days")}–{formatQtyText(uncertainty.plantMassThroughputDays.p90, "days")}</strong><small>192 illustrative sensitivity samples</small></div>
                <div><span>INFRA / MISSIONS</span><strong>{formatQtyText(selected.result.logistics.totalInfraMassKg, "kg")} / {selected.result.logistics.nMissions}</strong><small>{formatQtyText(selected.result.energy.gridPowerW, "W")} grid</small></div>
              </div>

              <div className="brief-candidates">
                {optimization.candidates.slice(0, 3).map((candidate, index) => (
                  <button key={`${candidate.params.site}-${index}`} type="button" className={index === selectedIndex ? "active" : ""} onClick={() => setSelectedIndex(index)}>
                    <span>#{index + 1} · {candidate.params.site.toUpperCase()} · {candidate.result.power.architecture.toUpperCase()}</span>
                    <strong>{formatQtyText(candidate.result.logistics.totalInfraMassKg, "kg")} · {formatQtyText(candidate.result.energy.secTotal_kWhPerKg, "kWh/kg", 4)}</strong>
                    <small>{candidate.feasible ? candidateDetail(candidate) : candidate.violations.join(" · ")}</small>
                  </button>
                ))}
              </div>

              <div className="brief-columns">
                <div><span className="reactor-section-title">THREE LARGEST ENERGY DRIVERS</span><ol>{drivers.map((driver) => <li key={driver.label}><span>{driver.label}</span><strong className="num">{formatQtyText(driver.value, "kWh/kg")}</strong></li>)}</ol></div>
                <div><span className="reactor-section-title">ENGINEERING CAVEATS</span><ul>{activeGoal.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}<li>Search resolution is deliberately finite and reproducible; refine the accepted case in Trade Study.</li></ul></div>
              </div>

              <div className="brief-actions">
                <button type="button" className="topbar-btn" onClick={() => {
                  setCompareFromCurrent();
                  applyPatch(selected.params);
                  setUi({ currentScenarioName: `${activeGoal.title} recommendation`, missionBriefOpen: false, view: "study", mobileTab: "study", sheetDetent: "full", studyTab: "scenarios" });
                }}>APPLY + OPEN TRADE STUDY</button>
                <ExportButton
                  label={`ALL ${optimization.evaluated} CANDIDATES CSV`}
                  what="brief-candidates"
                  title="Every evaluated design in ranked order, with its inputs, outputs, and any violated constraints"
                  build={() => briefCandidatesCsv(optimization.all)}
                />
                <button type="button" className="topbar-btn" onClick={close}>CLOSE WITHOUT APPLYING</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
