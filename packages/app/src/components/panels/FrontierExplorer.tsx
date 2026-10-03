import { simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { scaleLog } from "d3-scale";
import { useMemo, useState } from "react";
import { processScope, useScopedState, useSize } from "../../lib/hooks";
import { sweepInputs } from "../../analysis/generalSweep";
import { appliesToCase, FRONTIER_PARAMS, sweepValues, type SweepKey, type SweepParam } from "../../analysis/sweep";
import { frontierCsv } from "../../analysis/panelExports";
import { useStore } from "../../state/store";
import { ExportButton } from "./ExportButton";

type Objective = "mass-throughput-missions" | "sec-power" | "mass-sec" | "mass-missions";

const OBJECTIVES: Array<{ id: Objective; label: string; x: string; y: string; xPath: string; yPath: string }> = [
  { id: "mass-throughput-missions", label: "Plant-mass equivalent / missions", x: "PLANT-MASS EQUIV. · DAYS", y: "MISSIONS", xPath: "logistics.plantMassThroughputDays", yPath: "logistics.nMissions" },
  { id: "sec-power", label: "SEC / grid power", x: "SEC · KWH/KG", y: "GRID POWER · W", xPath: "energy.secTotal_kWhPerKg", yPath: "energy.gridPowerW" },
  { id: "mass-sec", label: "Infra mass / SEC", x: "INFRA MASS · KG", y: "SEC · KWH/KG", xPath: "logistics.totalInfraMassKg", yPath: "energy.secTotal_kWhPerKg" },
  { id: "mass-missions", label: "Infra mass / missions", x: "INFRA MASS · KG", y: "MISSIONS", xPath: "logistics.totalInfraMassKg", yPath: "logistics.nMissions" }
];

interface FrontierPoint {
  x: number;
  y: number;
  patch: Partial<SimParams>;
  frontier: boolean;
  feasible: boolean;
  warningCount: number;
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
  const result = useStore((s) => s.result);
  const streamKey = result.cryo.inventories.map((inventory) => inventory.stream).sort().join(",");
  // The curated axes come first; any other input the rail shows can be an axis
  // too, across its full engine range.
  const suggested = FRONTIER_PARAMS.filter((param) => appliesToCase(param, params));
  const others: SweepParam[] = useMemo(() => {
    const curated = new Set(suggested.map((param) => param.key));
    return sweepInputs(params, new Set(streamKey.split(",").filter(Boolean)))
      .filter((input) => !curated.has(input.key))
      .map((input) => ({
        key: input.key,
        label: `${input.label}${input.unit.length > 0 ? ` [${input.unit}]` : ""}`,
        group: input.group,
        min: input.min,
        max: input.max,
        log: input.log
      }));
  }, [params, streamKey]);
  const available = [...suggested, ...others];
  // Axes and the picked point belong to the site and process they were chosen for.
  const scope = processScope(params);
  const [aKey, setAKey] = useScopedState<SweepKey>(scope, () => "targetKgPerDay");
  const [bKey, setBKey] = useScopedState<SweepKey | "none">(scope, () =>
    params.site === "polar" ? "chiIce" : params.equatorialProcess === "ilmenite" ? "fIlmenite" : "etaCurrent"
  );
  const [objective, setObjective] = useState<Objective>("mass-sec");
  const [maxMissions, setMaxMissions] = useState(30);
  const [maxPowerMw, setMaxPowerMw] = useState(20);
  const [candidate, setCandidate] = useScopedState<FrontierPoint | null>(scope, () => null);

  const width = Math.max(280, size.width);
  const height = 280;
  const margin = { top: 14, right: 18, bottom: 42, left: 72 };
  const aParam = available.find((param) => param.key === aKey) ?? available[0]!;
  const bParam = bKey === "none" ? null : available.find((param) => param.key === bKey) ?? null;
  const objectiveMeta = OBJECTIVES.find((item) => item.id === objective) ?? OBJECTIVES[0]!;

  const data = useMemo(() => {
    const aValues = sweepValues(aParam, bParam === null ? 49 : 25);
    const bValues = bParam === null ? [0] : sweepValues(bParam, 25);
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
            <AxisOptions suggested={suggested} others={others} />
          </select>
        </label>
        <label>
          <span>SWEEP B</span>
          <select value={bParam?.key ?? "none"} onChange={(event) => {
            setBKey(event.target.value as SweepKey | "none");
            setCandidate(null);
          }} aria-label="Frontier parameter B">
            <option value="none">One parameter</option>
            <AxisOptions
              suggested={suggested.filter((param) => param.key !== aParam.key)}
              others={others.filter((param) => param.key !== aParam.key)}
            />
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
        <ExportButton
          label="POINTS CSV"
          what="pareto-points"
          title="Every grid point with its sweep inputs, both objectives, constraint status, and Pareto flag"
          build={() => frontierCsv(data, bParam === null ? [aParam.key] : [aParam.key, bParam.key], { x: objectiveMeta.xPath, y: objectiveMeta.yPath })}
        />
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

function AxisOptions({ suggested, others }: { suggested: SweepParam[]; others: SweepParam[] }): React.JSX.Element {
  const groups = [...new Set(others.map((param) => param.group ?? ""))];
  return (
    <>
      <optgroup label="SUGGESTED">
        {suggested.map((param) => <option key={param.key} value={param.key}>{param.label}</option>)}
      </optgroup>
      {groups.map((group) => (
        <optgroup key={group} label={group.toUpperCase()}>
          {others.filter((param) => (param.group ?? "") === group).map((param) => (
            <option key={param.key} value={param.key}>{param.label}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
