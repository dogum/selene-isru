import { sampleUncertainty, simulate } from "@selene-isru/engine";
import type { SimParams, SimResult, UncertaintySpec } from "@selene-isru/engine";
import { useEffect, useState } from "react";
import { formatQtyText } from "../lib/format";
import { useStore } from "../state/store";

type GoalSite = "either" | SimParams["site"];
type GoalObjective = "landed-mass" | "energy" | "missions" | "payback" | "crossover";

interface MissionConstraints {
  site: GoalSite;
  objective: GoalObjective;
  targetKgPerDay: number;
  missionYears: number;
  maxMissions: number;
  maxPowerMw: number;
  maxInfraT: number;
  allowSabatier: boolean;
}

interface BriefGoal {
  id: string;
  title: string;
  prompt: string;
  constraints: MissionConstraints;
  caveats: string[];
}

interface Candidate {
  params: SimParams;
  result: SimResult;
  feasible: boolean;
  score: number;
  violations: string[];
}

interface OptimizationResult {
  candidates: Candidate[];
  evaluated: number;
  feasible: number;
}

const GOALS: BriefGoal[] = [
  {
    id: "oxygen",
    title: "1 t/day oxygen",
    prompt: "Find a low-mass equatorial oxygen-production case.",
    constraints: { site: "equatorial", objective: "landed-mass", targetKgPerDay: 1000, missionYears: 5, maxMissions: 30, maxPowerMw: 20, maxInfraT: 250, allowSabatier: false },
    caveats: ["Aggregate oxygen recovery stands in for a reactor-scale kinetics model.", "Crew, spares, and campaign scheduling are outside the manifest."]
  },
  {
    id: "polar-water",
    title: "Polar water camp",
    prompt: "Find a feasible polar excavation, sublimation, and storage chain.",
    constraints: { site: "polar", objective: "landed-mass", targetKgPerDay: 1000, missionYears: 5, maxMissions: 30, maxPowerMw: 20, maxInfraT: 250, allowSabatier: false },
    caveats: ["Ice fraction is treated as a uniform bulk assay.", "Thermal transport uses a representative pore scale and steady-state bed model."]
  },
  {
    id: "landed-mass",
    title: "Minimize landed mass",
    prompt: "Search both sites under explicit mission and power caps.",
    constraints: { site: "either", objective: "landed-mass", targetKgPerDay: 1000, missionYears: 8, maxMissions: 24, maxPowerMw: 20, maxInfraT: 200, allowSabatier: false },
    caveats: ["The optimizer searches a bounded engineering grid, not a continuous global solution.", "Reliability and schedule-risk mass are not represented."]
  },
  {
    id: "energy",
    title: "Minimize energy",
    prompt: "Rank feasible designs by total product-specific energy.",
    constraints: { site: "either", objective: "energy", targetKgPerDay: 1000, missionYears: 8, maxMissions: 30, maxPowerMw: 20, maxInfraT: 250, allowSabatier: false },
    caveats: ["High-efficiency input values are engineering targets, not guaranteed hardware states.", "Energy minimization may trade against mass, maturity, and operating margin."]
  },
  {
    id: "crossover",
    title: "Solar / nuclear crossover",
    prompt: "Find an operating point nearest the modeled architecture crossover.",
    constraints: { site: "either", objective: "crossover", targetKgPerDay: 5000, missionYears: 8, maxMissions: 60, maxPowerMw: 100, maxInfraT: 500, allowSabatier: false },
    caveats: ["Break-even is a system-mass correlation, not a reliability or cost crossover.", "Launch packaging, redundancy, and operational risk are not monetized."]
  }
];

const OBJECTIVES: Array<{ id: GoalObjective; label: string }> = [
  { id: "landed-mass", label: "Minimum landed mass" },
  { id: "energy", label: "Minimum energy" },
  { id: "missions", label: "Minimum missions" },
  { id: "payback", label: "Fastest payback" },
  { id: "crossover", label: "Solar/nuclear crossover" }
];

interface Driver { label: string; value: number }
const DRIVER_LABELS: Record<string, string> = {
  product: "Product processing + conditioning",
  parasitic: "Parasitic systems",
  electrolysis: "Molten-regolith electrolysis",
  melt: "Regolith melt heating",
  sublimation: "Ice sublimation",
  cryo: "Cryogenic storage",
  excavation: "Excavation"
};

function energyDrivers(result: SimResult): Driver[] {
  const totals = new Map<string, number>();
  for (const flow of result.energy.flows) totals.set(flow.to, (totals.get(flow.to) ?? 0) + flow.kWhPerKg);
  return [...totals.entries()]
    .map(([label, value]) => ({ label: DRIVER_LABELS[label] ?? label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}

function score(result: SimResult, objective: GoalObjective): number {
  switch (objective) {
    case "energy": return result.energy.secTotal_kWhPerKg;
    case "missions": return result.logistics.nMissions;
    case "payback": return result.logistics.paybackDays;
    case "crossover": return Math.abs(result.energy.gridPowerW - result.power.pCritDynamicW) / Math.max(1, result.power.pCritDynamicW);
    default: return result.logistics.totalInfraMassKg;
  }
}

function violations(result: SimResult, constraints: MissionConstraints): string[] {
  const list: string[] = [];
  if (result.logistics.nMissions > constraints.maxMissions) list.push(`missions ${result.logistics.nMissions} > ${constraints.maxMissions}`);
  if (result.energy.gridPowerW > constraints.maxPowerMw * 1_000_000) list.push(`grid ${formatQtyText(result.energy.gridPowerW, "W")} > ${constraints.maxPowerMw} MW`);
  if (result.logistics.totalInfraMassKg > constraints.maxInfraT * 1000) list.push(`infrastructure ${formatQtyText(result.logistics.totalInfraMassKg, "kg")} > ${constraints.maxInfraT} t`);
  if (result.warnings.some((warning) => warning.severity === "alarm")) list.push("active engine alarm");
  return list;
}

function optimize(base: SimParams, constraints: MissionConstraints): OptimizationResult {
  const sites: SimParams["site"][] = constraints.site === "either" ? ["equatorial", "polar"] : [constraints.site];
  const candidates: Candidate[] = [];
  for (const site of sites) {
    const reserves = [3, 14, 30];
    const pvEfficiencies = [0.2, 0.29, 0.38];
    const nuclearSpecificMass = [8, 25, 60];
    const processA = site === "equatorial" ? [3.6, 4.2, 4.8] : [0.01, 0.03, 0.06, 0.1];
    const processB = site === "equatorial" ? [0.62, 0.8, 0.93] : [650, 800, 1050];
    const sabatierStates = site === "polar" && constraints.allowSabatier ? [false, true] : [false];
    for (const reserveDays of reserves) {
      for (const etaCell of pvEfficiencies) {
        for (const alphaSpecific of nuclearSpecificMass) {
          for (const a of processA) {
            for (const b of processB) {
              for (const enableSabatier of sabatierStates) {
                const params: SimParams = {
                  ...base,
                  site,
                  targetKgPerDay: constraints.targetKgPerDay,
                  missionYears: constraints.missionYears,
                  reserveDays,
                  etaCell,
                  alphaSpecific,
                  enableSabatier,
                  ...(site === "equatorial" ? { Vcell: a, etaCurrent: b } : { chiIce: a, cpRegCold: b })
                };
                const result = simulate(params);
                const failed = violations(result, constraints);
                candidates.push({ params, result, feasible: failed.length === 0, score: score(result, constraints.objective), violations: failed });
              }
            }
          }
        }
      }
    }
  }
  const penalty = (candidate: Candidate): number => candidate.violations.length * 1e15 + candidate.score;
  candidates.sort((a, b) => (a.feasible && !b.feasible ? -1 : !a.feasible && b.feasible ? 1 : penalty(a) - penalty(b)));
  // A sweep can contain equivalent designs when a parameter is irrelevant to
  // the architecture selected by the engine (for example PV efficiency in a
  // nuclear case). Keep the shortlist materially distinct and deterministic.
  const seen = new Set<string>();
  const distinct = candidates.filter((candidate) => {
    const result = candidate.result;
    const signature = [
      candidate.params.site,
      result.power.architecture,
      Math.round(result.logistics.totalInfraMassKg / 50),
      result.energy.secTotal_kWhPerKg.toFixed(2),
      Math.round(result.energy.gridPowerW / 5_000),
      result.logistics.nMissions,
      candidate.params.reserveDays,
      candidate.params.site === "equatorial" ? candidate.params.Vcell.toFixed(1) : candidate.params.chiIce.toFixed(3)
    ].join("|");
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  return { candidates: distinct.slice(0, 5), evaluated: candidates.length, feasible: candidates.filter((candidate) => candidate.feasible).length };
}

function candidateDetail(candidate: Candidate): string {
  const process = candidate.params.site === "equatorial"
    ? `${candidate.params.Vcell.toFixed(1)} V · η ${Math.round(candidate.params.etaCurrent * 100)}%`
    : `${(candidate.params.chiIce * 100).toFixed(1)}% ice · ${candidate.params.cpRegCold.toFixed(0)} J/(kg·K)`;
  const power = candidate.result.power.architecture === "solar"
    ? `PV η ${Math.round(candidate.params.etaCell * 100)}%`
    : `${candidate.params.alphaSpecific.toFixed(0)} kg/kW nuclear`;
  return `${candidate.params.reserveDays} d reserve · ${process} · ${power}`;
}

function recommendationTitle(candidate: Candidate): string {
  return `${candidate.params.site === "polar" ? "Polar ice" : "Equatorial MRE"} · ${candidate.result.power.architecture} power · ${formatQtyText(candidate.result.production.targetKgPerDay, "kg/day")}`;
}

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

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setUi({ missionBriefOpen: false });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setUi]);

  if (!open) return null;
  const close = (): void => setUi({ missionBriefOpen: false });
  const drivers = selected === null ? [] : energyDrivers(selected.result);
  const uncertainty = selected === null ? null : sampleUncertainty(
    selected.params,
    [
      { key: "targetKgPerDay", rel: 0.1 },
      selected.params.site === "polar" ? { key: "chiIce", rel: 0.25 } : { key: "etaCurrent", rel: 0.12 }
    ] as UncertaintySpec[],
    { n: 192, seed: 2026 }
  );

  return (
    <div className="modal-scrim" onClick={close}>
      <div className="modal mission-brief" role="dialog" aria-modal="true" aria-label="Mission brief optimizer" onClick={(event) => event.stopPropagation()}>
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
                <div><span className="reactor-eyebrow">RECOMMENDED BOUNDED DESIGN</span><h3>{recommendationTitle(selected)}</h3><small>{optimization.feasible} feasible of {optimization.evaluated} evaluated cases</small></div>
                <span className={`brief-status ${selected.feasible ? "nominal" : "alarm"}`}>{selected.feasible ? "FEASIBLE UNDER CAPS" : "NO FULLY FEASIBLE CASE"}</span>
              </div>
              <div className="brief-summary-grid">
                <div><span>PRIMARY ENERGY DRIVER</span><strong>{drivers[0]?.label.toUpperCase() ?? "—"}</strong><small>{formatQtyText(drivers[0]?.value ?? 0, "kWh/kg")}</small></div>
                <div><span>PAYBACK · P10–P90</span><strong>{formatQtyText(uncertainty.paybackDays.p10, "days")}–{formatQtyText(uncertainty.paybackDays.p90, "days")}</strong><small>192 uncertainty samples</small></div>
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
                <button type="button" className="topbar-btn" onClick={close}>CLOSE WITHOUT APPLYING</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
