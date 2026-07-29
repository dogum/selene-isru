import type { SimResult } from "@selene-isru/engine";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";
import { ScenarioLibrary } from "./ScenarioLibrary";

interface CompareMetric {
  label: string;
  unit: string;
  value: (r: SimResult) => number;
  sig?: number;
}

const METRICS: CompareMetric[] = [
  { label: "SEC TOTAL", unit: "kWh/kg", value: (r) => r.energy.secTotal_kWhPerKg, sig: 4 },
  { label: "GRID POWER", unit: "W", value: (r) => r.energy.gridPowerW },
  { label: "MISSIONS", unit: "", value: (r) => r.logistics.nMissions },
  { label: "PLANT-MASS EQUIV.", unit: "days", value: (r) => r.logistics.plantMassThroughputDays },
  { label: "LEVERAGE L", unit: "x", value: (r) => r.logistics.leverageL },
  { label: "OUTPUT", unit: "kg/day", value: (r) => r.production.targetKgPerDay, sig: 4 }
];

function signed(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`;
}

function flowSegments(result: SimResult): Array<{ key: string; value: number; pct: number }> {
  const totals = new Map<string, number>();
  for (const flow of result.energy.flows) {
    totals.set(flow.to, (totals.get(flow.to) ?? 0) + flow.kWhPerKg);
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function FlowStack({ label, result }: { label: string; result: SimResult }): React.JSX.Element {
  const segments = flowSegments(result);
  return (
    <div className="compare-flow">
      <div className="compare-flow-head mono">
        <span>{label}</span>
        <span>{formatQtyText(result.energy.secTotal_kWhPerKg, "kWh/kg", 4)}</span>
      </div>
      <div className="compare-flow-bar">
        {segments.map((segment, i) => (
          <i
            key={segment.key}
            style={{
              width: `${segment.pct}%`,
              background: i === 0 ? "var(--melt)" : i === 1 ? "var(--cryo)" : i === 2 ? "var(--solar)" : "var(--text-low)"
            }}
            title={`${segment.key}: ${formatQtyText(segment.value, "kWh/kg")}`}
          />
        ))}
      </div>
      <div className="compare-flow-legend mono">
        {segments.map((segment) => (
          <span key={segment.key}>
            {segment.key.toUpperCase()} <b>{formatQtyText(segment.value, "kWh/kg")}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ComparePanel(): React.JSX.Element {
  const result = useStore((s) => s.result);
  const compareResult = useStore((s) => s.compareResult);
  const compareParams = useStore((s) => s.compareParams);
  const workspaceMode = useStore((s) => s.workspaceMode);
  const currentName = useStore((s) => s.ui.currentScenarioName);
  const compareName = useStore((s) => s.ui.compareScenarioName);
  const setUi = useStore((s) => s.setUi);
  const setCompareFromCurrent = useStore((s) => s.setCompareFromCurrent);
  const swapCompare = useStore((s) => s.swapCompare);

  return (
    <div className="panel-section">
      <ScenarioLibrary />
      <div className="quick-compare-divider">
        <span>QUICK LIVE A/B</span>
      </div>
      <div className="panel-header">
        NAMED SCENARIO COMPARE
        <span className="num">B {compareParams.site.toUpperCase()}</span>
      </div>

      <div className="scenario-name-grid">
        <label>
          <span>CASE A · LIVE</span>
          <input
            value={currentName}
            aria-label="Current scenario name"
            onChange={(event) => setUi({ currentScenarioName: event.target.value })}
          />
        </label>
        <label>
          <span>CASE B · SAVED</span>
          <input
            value={compareName}
            aria-label="Comparison scenario name"
            onChange={(event) => setUi({ compareScenarioName: event.target.value })}
          />
        </label>
      </div>

      <div className="compare-actions">
        <button className="topbar-btn" onClick={setCompareFromCurrent}>
          SAVE CURRENT AS B
        </button>
        <button
          className="topbar-btn"
          disabled={workspaceMode === "custom"}
          title={workspaceMode === "custom"
            ? "Save and pin custom designs in the library for reproducible comparison."
            : undefined}
          onClick={swapCompare}
        >
          SWAP A / B
        </button>
      </div>

      <div className="compare-grid mono">
        <div className="compare-row compare-row-head">
          <span>METRIC</span>
          <span>CURRENT</span>
          <span>B</span>
          <span>DELTA</span>
        </div>
        {METRICS.map((metric) => {
          const a = metric.value(result);
          const b = metric.value(compareResult);
          const delta = a - b;
          const pct = b !== 0 ? (delta / Math.abs(b)) * 100 : 0;
          return (
            <div className="compare-row" key={metric.label}>
              <span>{metric.label}</span>
              <span className="num">{formatQtyText(a, metric.unit, metric.sig ?? 3)}</span>
              <span className="num">{formatQtyText(b, metric.unit, metric.sig ?? 3)}</span>
              <span className={`num ${delta <= 0 ? "good" : "warn"}`}>{signed(pct)}</span>
            </div>
          );
        })}
      </div>

      <div className="panel-header">
        ENERGY STACKS
        <span className="num">CURRENT / B</span>
      </div>
      <div className="chart-well compare-flow-well">
        <FlowStack label={currentName} result={result} />
        <FlowStack label={compareName} result={compareResult} />
      </div>

      <p className="panel-caption">
        Case A stays live as you tune the simulator. Save it into B to freeze a named
        reference, then continue exploring or swap the two cases.
      </p>
    </div>
  );
}
