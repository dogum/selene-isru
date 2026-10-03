import type { SimResult } from "@selene-isru/engine";
import { COMPARE_METRICS, deltaTone } from "../../analysis/compare";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";
import { ScenarioLibrary } from "./ScenarioLibrary";
import { energyStages } from "../../analysis/energyStages";

function signed(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`;
}

function flowSegments(result: SimResult): Array<{ key: string; label: string; value: number; pct: number }> {
  const stages = energyStages(result);
  const total = stages.reduce((sum, stage) => sum + stage.kWhPerKg, 0);
  return stages
    .map((stage) => ({ key: stage.id, label: stage.label, value: stage.kWhPerKg, pct: total > 0 ? (stage.kWhPerKg / total) * 100 : 0 }))
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
            title={`${segment.label}: ${formatQtyText(segment.value, "kWh/kg")}`}
          />
        ))}
      </div>
      <div className="compare-flow-legend mono">
        {segments.map((segment) => (
          <span key={segment.key}>
            {segment.label.toUpperCase()} <b>{formatQtyText(segment.value, "kWh/kg")}</b>
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
        {COMPARE_METRICS.map((metric) => {
          const a = metric.value(result);
          const b = metric.value(compareResult);
          const delta = a - b;
          const pct = b !== 0 ? (delta / Math.abs(b)) * 100 : 0;
          return (
            <div className="compare-row" key={metric.label}>
              <span>{metric.label}</span>
              <span className="num">{formatQtyText(a, metric.unit, metric.sig ?? 3)}</span>
              <span className="num">{formatQtyText(b, metric.unit, metric.sig ?? 3)}</span>
              <span className={`num ${deltaTone(delta, metric.better)}`}>{signed(pct)}</span>
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
