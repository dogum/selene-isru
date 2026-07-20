import { useMemo, useState } from "react";
import { simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { scaleLog } from "d3-scale";
import { useSize } from "../../lib/hooks";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";

type SweepKey = "targetKgPerDay" | "Vcell" | "etaCurrent" | "reserveDays" | "missionYears";
type Objective = "payback-missions" | "sec-power";

const PARAMS: Array<{ key: SweepKey; label: string; min: number; max: number; log?: boolean }> = [
  { key: "targetKgPerDay", label: "Output", min: 100, max: 10000, log: true },
  { key: "Vcell", label: "Cell V", min: 3, max: 5 },
  { key: "etaCurrent", label: "Current eff.", min: 0.5, max: 0.95 },
  { key: "reserveDays", label: "Reserve days", min: 1, max: 60 },
  { key: "missionYears", label: "Mission years", min: 1, max: 10 }
];

const OBJECTIVES: Array<{ id: Objective; label: string }> = [
  { id: "payback-missions", label: "Payback / missions" },
  { id: "sec-power", label: "SEC / power" }
];

interface FrontierPoint {
  x: number;
  y: number;
  patch: Partial<SimParams>;
  frontier: boolean;
}

function valuesFor(key: SweepKey, n: number): number[] {
  const param = PARAMS.find((p) => p.key === key)!;
  const lo = Math.max(1e-9, param.min);
  const hi = Math.max(lo * 1.01, param.max);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    out.push(param.log ? lo * Math.pow(hi / lo, u) : lo + (hi - lo) * u);
  }
  return out;
}

function objectiveValues(result: ReturnType<typeof simulate>, objective: Objective): [number, number] {
  if (objective === "sec-power") {
    return [result.energy.secTotal_kWhPerKg, result.energy.gridPowerW];
  }
  return [result.logistics.paybackDays, result.logistics.nMissions];
}

function markFrontier(points: FrontierPoint[]): FrontierPoint[] {
  return points.map((point) => {
    const dominated = points.some(
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
  const setParam = useStore((s) => s.setParam);
  const [ref, size] = useSize<HTMLDivElement>();
  const [aKey, setAKey] = useState<SweepKey>("targetKgPerDay");
  const [bKey, setBKey] = useState<SweepKey | "none">("Vcell");
  const [objective, setObjective] = useState<Objective>("payback-missions");

  const width = Math.max(280, size.width);
  const height = 250;
  const margin = { top: 14, right: 18, bottom: 34, left: 62 };

  const data = useMemo(() => {
    const aValues = valuesFor(aKey, bKey === "none" ? 41 : 25);
    const bValues = bKey === "none" ? [0] : valuesFor(bKey, 25);
    const raw: FrontierPoint[] = [];
    for (const a of aValues) {
      for (const b of bValues) {
        const patch: Partial<SimParams> = { [aKey]: a } as Partial<SimParams>;
        if (bKey !== "none") {
          (patch as Record<string, number>)[bKey] = b;
        }
        const result = simulate({ ...params, ...patch });
        const [x, y] = objectiveValues(result, objective);
        raw.push({ x, y, patch, frontier: false });
      }
    }
    return markFrontier(raw);
  }, [aKey, bKey, objective, params]);

  const xs = data.map((point) => Math.max(1e-9, point.x));
  const ys = data.map((point) => Math.max(1e-9, point.y));
  const xScale = scaleLog()
    .domain([Math.min(...xs) / 1.1, Math.max(...xs) * 1.1])
    .range([margin.left, width - margin.right]);
  const yScale = scaleLog()
    .domain([Math.min(...ys) / 1.1, Math.max(...ys) * 1.1])
    .range([height - margin.bottom, margin.top]);
  const current = objectiveValues(simulate(params), objective);
  const xUnit = objective === "sec-power" ? "kWh/kg" : "days";
  const yUnit = objective === "sec-power" ? "W" : "";

  return (
    <div className="panel-section frontier-section" ref={ref}>
      <div className="panel-header">
        FRONTIER EXPLORER
        <span className="num">{data.length} RUN CAP</span>
      </div>
      <div className="frontier-controls">
        <select value={aKey} onChange={(e) => setAKey(e.target.value as SweepKey)} aria-label="Frontier parameter A">
          {PARAMS.map((param) => (
            <option key={param.key} value={param.key}>
              {param.label}
            </option>
          ))}
        </select>
        <select value={bKey} onChange={(e) => setBKey(e.target.value as SweepKey | "none")} aria-label="Frontier parameter B">
          <option value="none">One parameter</option>
          {PARAMS.filter((param) => param.key !== aKey).map((param) => (
            <option key={param.key} value={param.key}>
              {param.label}
            </option>
          ))}
        </select>
        <select value={objective} onChange={(e) => setObjective(e.target.value as Objective)} aria-label="Frontier objective">
          {OBJECTIVES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="chart-well frontier-well">
        <svg width={width} height={height} role="img" aria-label="Pareto frontier explorer">
          {data.map((point, i) => (
            <circle
              key={i}
              cx={xScale(Math.max(1e-9, point.x))}
              cy={yScale(Math.max(1e-9, point.y))}
              r={point.frontier ? 4 : 2.2}
              fill={point.frontier ? "var(--melt)" : "var(--text-low)"}
              opacity={point.frontier ? 0.95 : 0.32}
              onClick={() => {
                for (const [key, value] of Object.entries(point.patch)) {
                  setParam(key as keyof SimParams, value as SimParams[keyof SimParams]);
                }
              }}
            />
          ))}
          <circle
            cx={xScale(Math.max(1e-9, current[0]))}
            cy={yScale(Math.max(1e-9, current[1]))}
            r="6"
            fill="none"
            stroke="var(--cryo)"
            strokeWidth="2"
          />
          <text className="axis-label" x={margin.left} y={height - 9}>
            {xUnit.toUpperCase()}
          </text>
          <text className="axis-label" x={8} y={margin.top + 8}>
            {yUnit === "" ? "MISSIONS" : yUnit.toUpperCase()}
          </text>
        </svg>
      </div>
      <div className="frontier-current mono">
        CURRENT {formatQtyText(current[0], xUnit, 3)} / {yUnit === "" ? current[1].toFixed(0) : formatQtyText(current[1], yUnit)}
      </div>
    </div>
  );
}
