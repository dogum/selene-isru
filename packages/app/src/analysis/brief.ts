import { simulate } from "@selene-isru/engine";
import type { SimParams, SimResult } from "@selene-isru/engine";
import { formatQtyText } from "../lib/format";
import { energyStages } from "./energyStages";

export type GoalSite = "either" | SimParams["site"];
export type GoalObjective = "landed-mass" | "energy" | "missions" | "mass-throughput" | "crossover";

export interface MissionConstraints {
  site: GoalSite;
  objective: GoalObjective;
  targetKgPerDay: number;
  missionYears: number;
  maxMissions: number;
  maxPowerMw: number;
  maxInfraT: number;
  allowSabatier: boolean;
}

export interface BriefGoal {
  id: string;
  title: string;
  prompt: string;
  constraints: MissionConstraints;
  caveats: string[];
}

export interface Candidate {
  params: SimParams;
  result: SimResult;
  feasible: boolean;
  score: number;
  violations: string[];
}

export interface OptimizationResult {
  /** distinct shortlist, best first */
  candidates: Candidate[];
  /** every evaluated grid point in ranked order, for export */
  all: Candidate[];
  evaluated: number;
  feasible: number;
}

export const GOALS: BriefGoal[] = [
  {
    id: "oxygen",
    title: "1 t/day oxygen",
    prompt: "Find a low-mass equatorial oxygen-production case.",
    constraints: { site: "equatorial", objective: "landed-mass", targetKgPerDay: 1000, missionYears: 5, maxMissions: 30, maxPowerMw: 20, maxInfraT: 250, allowSabatier: false },
    caveats: ["Aggregate oxygen recovery stands in for a reactor-scale kinetics model.", "Crew is outside the manifest; spares and deployment timing appear in the Campaign view, not in this landed-mass ranking."]
  },
  {
    id: "polar-water",
    title: "Polar water camp",
    prompt: "Find a polar chain with no implemented constraint violations under the active caps.",
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
    prompt: "Rank designs inside the active caps by total product-specific energy.",
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

export const OBJECTIVES: Array<{ id: GoalObjective; label: string }> = [
  { id: "landed-mass", label: "Minimum landed mass" },
  { id: "energy", label: "Minimum energy" },
  { id: "missions", label: "Minimum missions" },
  { id: "mass-throughput", label: "Lowest plant-mass throughput equivalent" },
  { id: "crossover", label: "Solar/nuclear crossover" }
];

export interface Driver { label: string; value: number }

/** The three stages that spend the most energy per kg. */
export function energyDrivers(result: SimResult): Driver[] {
  return energyStages(result)
    .slice(0, 3)
    .map((stage) => ({ label: stage.label, value: stage.kWhPerKg }));
}

export function score(result: SimResult, objective: GoalObjective): number {
  switch (objective) {
    case "energy": return result.energy.secTotal_kWhPerKg;
    case "missions": return result.logistics.nMissions;
    case "mass-throughput": return result.logistics.plantMassThroughputDays;
    case "crossover": return Math.abs(result.energy.gridPowerW - result.power.pCritDynamicW) / Math.max(1, result.power.pCritDynamicW);
    default: return result.logistics.totalInfraMassKg;
  }
}

export function violations(result: SimResult, constraints: MissionConstraints): string[] {
  const list: string[] = [];
  if (result.logistics.nMissions > constraints.maxMissions) list.push(`missions ${result.logistics.nMissions} > ${constraints.maxMissions}`);
  if (result.energy.gridPowerW > constraints.maxPowerMw * 1_000_000) list.push(`grid ${formatQtyText(result.energy.gridPowerW, "W")} > ${constraints.maxPowerMw} MW`);
  if (result.logistics.totalInfraMassKg > constraints.maxInfraT * 1000) list.push(`infrastructure ${formatQtyText(result.logistics.totalInfraMassKg, "kg")} > ${constraints.maxInfraT} t`);
  if (result.warnings.some((warning) => warning.severity === "alarm")) list.push("active engine alarm");
  return list;
}

export interface BriefGrid {
  reserves: number[];
  pvEfficiencies: number[];
  nuclearSpecificMass: number[];
  /** Vcell (V) at the equatorial site, chiIce (kg/kg) at the polar site. */
  processA: number[];
  /** etaCurrent at the equatorial site, cpRegCold (J/(kg*K)) at the polar site. */
  processB: number[];
}

/**
 * Search levels per site. Every level must sit inside the engine bounds: a
 * level the engine clamps is simulated at a different value than the brief
 * labels and later applies (asserted in analysis-tools.test.ts).
 */
export function briefGrid(site: SimParams["site"]): BriefGrid {
  return {
    reserves: [5, 14, 30],
    pvEfficiencies: [0.2, 0.29, 0.38],
    nuclearSpecificMass: [8, 25, 60],
    processA: site === "equatorial" ? [3.6, 4.2, 4.8] : [0.01, 0.03, 0.06, 0.1],
    processB: site === "equatorial" ? [0.62, 0.8, 0.93] : [650, 800, 1050]
  };
}

export function optimize(base: SimParams, constraints: MissionConstraints): OptimizationResult {
  const sites: SimParams["site"][] = constraints.site === "either" ? ["equatorial", "polar"] : [constraints.site];
  const candidates: Candidate[] = [];
  for (const site of sites) {
    const { reserves, pvEfficiencies, nuclearSpecificMass, processA, processB } = briefGrid(site);
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
                  // The equatorial levers are MRE's, so its candidates run MRE.
                  ...(site === "equatorial" ? { equatorialProcess: "mre" as const, Vcell: a, etaCurrent: b } : { chiIce: a, cpRegCold: b })
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
  return {
    candidates: distinct.slice(0, 5),
    all: candidates,
    evaluated: candidates.length,
    feasible: candidates.filter((candidate) => candidate.feasible).length
  };
}

export function candidateDetail(candidate: Candidate): string {
  const process = candidate.params.site === "equatorial"
    ? `${candidate.params.Vcell.toFixed(1)} V · η ${Math.round(candidate.params.etaCurrent * 100)}%`
    : `${(candidate.params.chiIce * 100).toFixed(1)}% ice · ${candidate.params.cpRegCold.toFixed(0)} J/(kg·K)`;
  const power = candidate.result.power.architecture === "solar"
    ? `PV η ${Math.round(candidate.params.etaCell * 100)}%`
    : `${candidate.params.alphaSpecific.toFixed(0)} kg/kW nuclear`;
  return `${candidate.params.reserveDays} d reserve · ${process} · ${power}`;
}

export function recommendationTitle(candidate: Candidate): string {
  return `${candidate.params.site === "polar" ? "Polar ice" : "Equatorial MRE"} · ${candidate.result.power.architecture} power · ${formatQtyText(candidate.result.production.targetKgPerDay, "kg/day")}`;
}
