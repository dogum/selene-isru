import { useMemo } from "react";
import { traceParameter, type CausalNode } from "../analysis/causal";
import { useStore } from "../state/store";

function value(value: number | string, unit: string): string {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return String(value);
  const magnitude = Math.abs(value);
  const formatted = magnitude !== 0 && (magnitude >= 100_000 || magnitude < 0.001)
    ? value.toExponential(3)
    : value.toLocaleString(undefined, { maximumSignificantDigits: 5 });
  return `${formatted}${unit.length > 0 ? ` ${unit}` : ""}`;
}

function NodeCard({ node }: { node: CausalNode }): React.JSX.Element {
  return (
    <article className={`causal-node ${node.category}`}>
      <span>{node.category}</span>
      <strong>{node.label}</strong>
      <small className="mono">{value(node.before, node.unit)} → {value(node.after, node.unit)}</small>
    </article>
  );
}

export function CausalGraph(): React.JSX.Element | null {
  const key = useStore((state) => state.ui.causalParam);
  const params = useStore((state) => state.params);
  const setUi = useStore((state) => state.setUi);
  const trace = useMemo(() => key === null ? null : traceParameter(key, params), [key, params]);
  if (trace === null) return null;
  const modelNodes = trace.nodes.filter((node) => node.category !== "kpi");
  const kpis = trace.nodes.filter((node) => node.category === "kpi");

  return (
    <div className="model-modal-backdrop" onMouseDown={() => setUi({ causalParam: null })}>
      <section className="causal-graph" role="dialog" aria-modal="true" aria-label={`Runtime causal trace for ${trace.label}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="reactor-eyebrow">RUNTIME CAUSAL TRACE</span>
            <h2>{trace.label}</h2>
            <p>Differential execution of the actual engine at the current scenario—not a static documentation map.</p>
          </div>
          <button type="button" aria-label="Close causal trace" onClick={() => setUi({ causalParam: null })}>✕</button>
        </header>
        <div className="causal-perturbation mono">
          <span>INPUT</span>
          <strong>{String(trace.key)}</strong>
          <code>{String(trace.before)} → {String(trace.after)}</code>
        </div>
        <div className="causal-columns">
          <section>
            <h3>Changed equations, processes, and constraints</h3>
            <div className="causal-node-list">
              {modelNodes.length > 0 ? modelNodes.map((node) => <NodeCard key={node.id} node={node} />) : <p>No observed model node changed under the local perturbation.</p>}
            </div>
          </section>
          <section>
            <h3>Changed headline outcomes</h3>
            <div className="causal-node-list">
              {kpis.length > 0 ? kpis.map((node) => <NodeCard key={node.id} node={node} />) : <p>No headline KPI changed under the local perturbation.</p>}
            </div>
          </section>
        </div>
        <footer>
          <span>{trace.nodes.length} of {trace.nodes.length + trace.unchangedObservedCount} observed nodes changed</span>
          <small>Local derivatives can miss discontinuous behavior away from this operating point; threshold warnings remain separately visible.</small>
        </footer>
      </section>
    </div>
  );
}
