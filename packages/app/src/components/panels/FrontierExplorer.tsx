import { simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { scaleLog } from "d3-scale";
import { useMemo, useState } from "react";
import { useSize } from "../../lib/hooks";
import { useStore } from "../../state/store";

type SweepKey =
  | "targetKgPerDay"
  | "Vcell"
  | "etaCurrent"
  | "reserveDays"
  | "missionYears"
  | "chiIce"
  | "Nmli"
  | "etaCell"
  | "alphaSpecific"
  | "shieldDesignM";
type Objective = "mass-throughput-missions" | "sec-power" | "mass-sec" | "mass-missions";

interface SweepParam {
  key: SweepKey;
  label: string;
  min: number;
  max: number;
  log?: boolean;
  site?: SimParams["site"];
}

const PARAMS: SweepParam[] = [
  { key: "targetKgPerDay", label: "Output", min: 10, max: 20_000, log: true },
  { key: "missionYears", label: "Mission years", min: 1, max: 20 },
  { key: "reserveDays", label: "Reserve days", min: 1, max: 60 },
  { key: "etaCell", label: "PV efficiency", min: 0.15, max: 0.4 },
  { key: "alphaSpecific", label: "Nuclear kg/kW", min: 5, max: 80, log: true },
  { key: "Nmli", label: "MLI layers", min: 10, max: 80 },
  { key: "Vcell", label: "MRE cell voltage", min: 3.5, max: 5, site: "equatorial" },
  { key: "etaCurrent", label: "Current efficiency", min: 0.5, max: 0.95, site: "equatorial" },
  { key: "shieldDesignM", label: "Shield depth", min: 0.1, max: 5, site: "equatorial" },
  { key: "chiIce", label: "Polar ice fraction", min: 0.005, max: 0.12, log: true, site: "polar" }
];

const OBJECTIVES: Array<{ id: Objective; label: string; x: string; y: string }> = [
  { id: "mass-throughput-missions", label: "Plant-mass equivalent / missions", x: "PLANT-MASS EQUIV. · DAYS", y: "MISSIONS" },
  { id: "sec-power", label: "SEC / grid power", x: "SEC · KWH/KG", y: "GRID POWER · W" },
  { id: "mass-sec", label: "Infra mass / SEC", x: "INFRA MASS · KG", y: "SEC · KWH/KG" },
  { id: "mass-missions", label: "Infra mass / missions", x: "INFRA MASS · KG", y: "MISSIONS" }
];

interface FrontierPoint {
  x: number;
  y: number;
  patch: Partial<SimParams>;
  frontier: boolean;
  feasible: boolean;
  warningCount: number;
}

function valuesFor(param: SweepParam, n: number): number[] {
  const lo = Math.max(1e-9, param.min);
  const hi = Math.max(lo * 1.01, param.max);
  return Array.from({ length: n }, (_, index) => {
    const u = n === 1 ? 0.5 : index / (n - 1);
    return param.log ? lo * Math.pow(hi / lo, u) : lo + (hi - lo) * u;
  });
}

function objectiveValues(result: ReturnType<typeof simulate>, objective: Objective): [number, number] {
  switch (objective) {
    case "sec-power":
      return [result.energy.secTotal_kWhPerKg, result.energy.gridPowerW];
    case "mass-sec":
      return [result.logistics.totalInfraMassKg, result.energy.secTotal_kWhPerKg];
    case "mass-missions":
      return [result.logistics.totalInfraMassKg, result.logistics.nMissions];
    default:
      return [result.logistics.plantMassThroughputDays, result.logistics.nMissions];
  }
}

function markFrontier(points: FrontierPoint[]): FrontierPoint[] {
  const feasible = points.filter((point) => point.feasible);
  return points.map((point) => {
    if (!point.feasible) {
      return point;
    }
    const dominated = feasible.some(
      (other) =>
        other !== point &&
        other.x <= point.x &&
        other.y <= point.y &&
        (other.x < point.x || other.y < point.y)
    );
    return { ...point, frontier: !dominated };
  });
}

export function FrontierExplorer(): React.JSX.Element {
  const params = useStore((s) => s.params);
  const applyPatch = useStore((s) => s.applyPatch);
  const [ref, size] = useSize<HTMLDivElement>();
  const available = PARAMS.filter((param) => param.site === undefined || param.site === params.site);
  const [aKey, setAKey] = useState<SweepKey>("targetKgPerDay");
  const [bKey, setBKey] = useState<SweepKey | "none">(params.site === "polar" ? "chiIce" : "etaCurrent");
  const [objective, setObjective] = useState<Objective>("mass-sec");
  const [maxMissions, setMaxMissions] = useState(30);
  const [maxPowerMw, setMaxPowerMw] = useState(20);
  const [candidate, setCandidate] = useState<FrontierPoint | null>(null);

  const width = Math.max(280, size.width);
  const height = 280;
  const margin = { top: 14, right: 18, bottom: 42, left: 72 };
  const aParam = available.find((param) => param.key === aKey) ?? available[0]!;
  const bParam = bKey === "none" ? null : available.find((param) => param.key === bKey) ?? null;
  const objectiveMeta = OBJECTIVES.find((item) => item.id === objective) ?? OBJECTIVES[0]!;

  const data = useMemo(() => {
    const aValues = valuesFor(aParam, bParam === null ? 49 : 25);
    const bValues = bParam === null ? [0] : valuesFor(bParam, 25);
    const raw: FrontierPoint[] = [];
    for (const a of aValues) {
      for (const b of bValues) {
        const patch: Partial<SimParams> = { [aParam.key]: a } as Partial<SimParams>;
        if (bParam !== null) {
          (patch as Record<string, number>)[bParam.key] = b;
        }
        const result = simulate({ ...params, ...patch });
        const [x, y] = objectiveValues(result, objective);
        const alarms = result.warnings.filter((warning) => warning.severity === "alarm");
        raw.push({
          x,
          y,
          patch,
          frontier: false,
          feasible:
            alarms.length === 0 &&
            result.logistics.nMissions <= maxMissions &&
            result.energy.gridPowerW <= maxPowerMw * 1_000_000,
          warningCount: result.warnings.length
        });
      }
    }
    return markFrontier(raw);
  }, [aParam, bParam, maxMissions, maxPowerMw, objective, params]);

  const xs = data.map((point) => Math.max(1e-9, point.x));
  const ys = data.map((point) => Math.max(1e-9, point.y));
  const xScale = scaleLog()
    .domain([Math.min(...xs) / 1.1, Math.max(...xs) * 1.1])
    .range([margin.left, width - margin.right]);
  const yScale = scaleLog()
    .domain([Math.min(...ys) / 1.1, Math.max(...ys) * 1.1])
    .range([height - margin.bottom, margin.top]);
  const current = objectiveValues(simulate(params), objective);
  const feasibleCount = data.filter((point) => point.feasible).length;

  return (
    <div className="panel-section frontier-section" ref={ref}>
      <div className="panel-header">
        CONSTRAINED FRONTIER EXPLORER
        <span className="num">{feasibleCount}/{data.length} WITHIN ACTIVE CONSTRAINTS</span>
      </div>
      <div className="frontier-controls">
        <label>
          <span>SWEEP A</span>
          <select value={aParam.key} onChange={(event) => {
            const next = event.target.value as SweepKey;
            setAKey(next);
            if (bKey === next) setBKey("none");
            setCandidate(null);
          }} aria-label="Frontier parameter A">
            {available.map((param) => <option key={param.key} value={param.key}>{param.label}</option>)}
          </select>
        </label>
        <label>
          <span>SWEEP B</span>
          <select value={bParam?.key ?? "none"} onChange={(event) => {
            setBKey(event.target.value as SweepKey | "none");
            setCandidate(null);
          }} aria-label="Frontier parameter B">
            <option value="none">One parameter</option>
            {available.filter((param) => param.key !== aParam.key).map((param) => (
              <option key={param.key} value={param.key}>{param.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>OBJECTIVES</span>
          <select value={objective} onChange={(event) => {
            setObjective(event.target.value as Objective);
            setCandidate(null);
          }} aria-label="Frontier objective">
            {OBJECTIVES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="frontier-constraints">
        <label>
          MAX MISSIONS
          <input type="number" min="1" max="200" value={maxMissions} onChange={(event) => setMaxMissions(Number(event.target.value))} />
        </label>
        <label>
          MAX GRID · MW
          <input type="number" min="0.1" max="500" step="0.5" value={maxPowerMw} onChange={(event) => setMaxPowerMw(Number(event.target.value))} />
        </label>
        <span><i className="frontier-key frontier-key-good" /> PARETO</span>
        <span><i className="frontier-key frontier-key-bad" /> OUTSIDE ACTIVE CONSTRAINTS</span>
      </div>
      <div className="chart-well frontier-well">
        <svg width={width} height={height} role="img" aria-label="Constrained Pareto frontier explorer">
          {data.map((point, index) => (
            <circle
              key={index}
              cx={xScale(Math.max(1e-9, point.x))}
              cy={yScale(Math.max(1e-9, point.y))}
              r={point.frontier ? 4.4 : point.feasible ? 2.3 : 1.8}
              fill={point.frontier ? "var(--melt)" : point.feasible ? "var(--text-low)" : "var(--alarm)"}
              opacity={point.frontier ? 0.96 : point.feasible ? 0.3 : 0.22}
              tabIndex={point.frontier ? 0 : -1}
              onClick={() => setCandidate(point)}
              onKeyDown={(event) => event.key === "Enter" && setCandidate(point)}
            >
              <title>{`${objectiveMeta.x}: ${point.x.toPrecision(4)} · ${objectiveMeta.y}: ${point.y.toPrecision(4)} · ${point.feasible ? "inside active constraints" : "outside active constraints"}`}</title>
            </circle>
          ))}
          <circle
            cx={xScale(Math.max(1e-9, current[0]))}
            cy={yScale(Math.max(1e-9, current[1]))}
            r="6"
            fill="none"
            stroke="var(--cryo)"
            strokeWidth="2"
          />
          <text className="axis-label" x={margin.left} y={height - 10}>{objectiveMeta.x}</text>
          <text className="axis-label" x={8} y={margin.top + 8}>{objectiveMeta.y}</text>
        </svg>
      </div>
      <div className="frontier-current mono">
        CURRENT {current[0].toPrecision(4)} / {current[1].toPrecision(4)}
      </div>
      {candidate !== null && (
        <div className="frontier-candidate">
          <div>
            <span className="reactor-section-title">SELECTED DESIGN POINT</span>
            <strong>{candidate.feasible ? "NO IMPLEMENTED CONSTRAINT VIOLATIONS" : "OUTSIDE ACTIVE CONSTRAINTS"}</strong>
            <small>{Object.entries(candidate.patch).map(([key, value]) => `${key}=${Number(value).toPrecision(4)}`).join(" · ")}</small>
          </div>
          <button type="button" className="topbar-btn" disabled={!candidate.feasible} onClick={() => applyPatch({ ...params, ...candidate.patch })}>
            APPLY POINT
          </button>
        </div>
      )}
      <p className="panel-caption">
        Orange points are non-dominated among cases satisfying the mission and power caps. Select a point to inspect it before changing the live case.
      </p>
    </div>
  );
}
