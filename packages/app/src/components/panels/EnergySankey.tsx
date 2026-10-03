import { useMemo, useState } from "react";
import { sankey, sankeyJustify, type SankeyGraph } from "d3-sankey";
import { line as d3line } from "d3-shape";
import { useSize } from "../../lib/hooks";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";
import { flowsCsv } from "../../analysis/panelExports";
import { Qty } from "../Qty";
import { ExportButton } from "./ExportButton";

/** fixed node order — no relayout jumps on param change (§4.1) */
const NODE_ORDER = ["mine", "melt", "sublimation", "electrolysis", "parasitic", "cryo", "product"];

const NODE_COLOR: Record<string, string> = {
  mine: "var(--regolith)",
  melt: "var(--melt)",
  electrolysis: "var(--melt)",
  parasitic: "var(--melt)",
  sublimation: "var(--cryo)",
  cryo: "var(--cryo)",
  product: "var(--text-hi)"
};

/** reader-facing stage names; ids stay the engine's */
const NODE_NAME: Record<string, string> = {
  mine: "MINING",
  melt: "MELTING",
  electrolysis: "ELECTROLYSIS",
  parasitic: "PARASITIC LOSS",
  sublimation: "SUBLIMATION",
  cryo: "CRYO STORAGE",
  product: "PRODUCT"
};

const nodeName = (id: string): string => NODE_NAME[id] ?? id.toUpperCase();

interface NodeDatum {
  id: string;
}

interface LinkDatum {
  source: string | NodeDatum;
  target: string | NodeDatum;
  value: number;
  kWhPerKg: number;
}

interface Tooltip {
  x: number;
  y: number;
  text: string;
}

export function EnergySankey({ vertical = false }: { vertical?: boolean }): React.JSX.Element {
  const result = useStore((s) => s.result);
  const history = useStore((s) => s.secHistory);
  const nameMode = useStore((s) => s.ui.parameterNames);
  const [ref, size] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<Tooltip | null>(null);

  const width = Math.max(280, size.width);
  const height = vertical ? 460 : 460;
  // layout extent is transposed when vertical: sankey computes in (W,H) then we swap
  const layoutW = vertical ? height : width;
  const layoutH = vertical ? width : height;

  const total = result.energy.secTotal_kWhPerKg;

  const graph = useMemo(() => {
    const present = new Set<string>();
    for (const f of result.energy.flows) {
      present.add(f.from);
      present.add(f.to);
    }
    const nodes: NodeDatum[] = NODE_ORDER.filter((id) => present.has(id)).map((id) => ({ id }));
    const links: LinkDatum[] = result.energy.flows.map((f) => ({
      source: f.from,
      target: f.to,
      value: Math.max(f.kWhPerKg, 1e-6),
      kWhPerKg: f.kWhPerKg
    }));
    const generator = sankey<NodeDatum, LinkDatum>()
      .nodeId((d) => d.id)
      .nodeWidth(12)
      .nodePadding(34)
      .nodeAlign(sankeyJustify)
      .nodeSort(null)
      .extent([
        [10, 22],
        [layoutW - 10, layoutH - 22]
      ]);
    return generator({ nodes, links }) as SankeyGraph<NodeDatum, LinkDatum>;
  }, [result.energy.flows, layoutW, layoutH]);

  const linkPath = (l: (typeof graph.links)[number]): string => {
    const s = l.source as NodeDatum & { x1: number };
    const t = l.target as NodeDatum & { x0: number };
    const sy = l.y0 ?? 0;
    const ty = l.y1 ?? 0;
    if (!vertical) {
      const x0 = s.x1;
      const x1 = t.x0;
      const c = (x0 + x1) / 2;
      return `M${x0},${sy}C${c},${sy} ${c},${ty} ${x1},${ty}`;
    }
    // transposed: layout x → screen y
    const y0 = s.x1;
    const y1 = t.x0;
    const c = (y0 + y1) / 2;
    return `M${sy},${y0}C${sy},${c} ${ty},${c} ${ty},${y1}`;
  };

  const sparkline = useMemo(() => {
    if (history.length < 2) {
      return null;
    }
    const w = 96;
    const h = 22;
    const min = Math.min(...history);
    const max = Math.max(...history);
    const span = max - min || 1;
    const gen = d3line<number>()
      .x((_, i) => (i / (history.length - 1)) * w)
      .y((v) => h - 2 - ((v - min) / span) * (h - 4));
    return { d: gen(history) ?? "", w, h };
  }, [history]);

  return (
    <div className="panel-section">
      <div className="sankey-head">
        <div>
          <div className="panel-header">{nameMode === "code" ? "SEC TOTAL" : "ENERGY PER KG OF PRODUCT"}</div>
          <div className="sankey-hero">
            <Qty value={total} unit="kWh/kg" sig={4} animate />
          </div>
        </div>
        {sparkline !== null && (
          <svg
            className="sankey-spark"
            width={sparkline.w}
            height={sparkline.h}
            aria-label="SEC total, last 60 values"
          >
            <path d={sparkline.d} fill="none" stroke="var(--melt)" strokeWidth="1.5" />
          </svg>
        )}
      </div>

      <div className="chart-well sankey-well" ref={ref}>
        <svg width={width} height={height} role="img" aria-label="Energy flow Sankey" aria-describedby="sankey-ledger">
          {graph.links.map((l) => {
            const sourceId = (l.source as NodeDatum).id;
            const targetId = (l.target as NodeDatum).id;
            const pct = total > 0 ? (l.kWhPerKg / total) * 100 : 0;
            return (
              <path
                key={`${sourceId}-${targetId}`}
                className="sankey-link"
                d={linkPath(l)}
                fill="none"
                stroke={NODE_COLOR[sourceId] ?? "var(--text-low)"}
                strokeOpacity={tip !== null && tip.text.startsWith(`${nodeName(sourceId)} → ${nodeName(targetId)}`) ? 0.95 : 0.58}
                strokeWidth={Math.max(1, l.width ?? 1)}
                onMouseMove={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    text: `${nodeName(sourceId)} → ${nodeName(targetId)} · ${formatQtyText(l.kWhPerKg, "kWh/kg")} · ${pct.toFixed(1)}%`
                  });
                }}
                onMouseLeave={() => setTip(null)}
              >
                <title>{`${sourceId} → ${targetId}`}</title>
              </path>
            );
          })}
          {graph.nodes.map((n) => {
            const x0 = n.x0 ?? 0;
            const x1 = n.x1 ?? 0;
            const y0 = n.y0 ?? 0;
            const y1 = n.y1 ?? 0;
            const rx = vertical ? y0 : x0;
            const ry = vertical ? x0 : y0;
            const rw = vertical ? y1 - y0 : x1 - x0;
            const rh = vertical ? x1 - x0 : y1 - y0;
            const isRight = !vertical && x0 > layoutW / 2;
            return (
              <g key={n.id}>
                <rect
                  x={rx}
                  y={ry}
                  width={rw}
                  height={rh}
                  fill={NODE_COLOR[n.id] ?? "var(--text-low)"}
                  stroke="var(--bg-inset)"
                  strokeWidth={1.5}
                />
                <text
                  className="sankey-node-label"
                  x={vertical ? rx + rw + 6 : isRight ? rx - 6 : rx + rw + 6}
                  y={vertical ? ry + 4 : ry + rh / 2}
                  dominantBaseline={vertical ? "hanging" : "middle"}
                  textAnchor={!vertical && isRight ? "end" : "start"}
                >
                  {nodeName(n.id)}
                  <tspan className="sankey-node-value">{` ${formatQtyText(n.value ?? 0, "kWh/kg")}`}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
        {tip !== null && (
          <div className="chart-tip mono num" style={{ left: tip.x + 10, top: tip.y - 28 }}>
            {tip.text}
          </div>
        )}
      </div>

      <table className="sankey-ledger mono" id="sankey-ledger">
        <caption>Energy flows per kg of product</caption>
        <thead>
          <tr>
            <th scope="col">FLOW</th>
            <th scope="col">KWH/KG</th>
            <th scope="col">SHARE</th>
          </tr>
        </thead>
        <tbody>
          {[...result.energy.flows]
            .sort((a, b) => b.kWhPerKg - a.kWhPerKg)
            .map((flow) => (
              <tr key={`${flow.from}-${flow.to}`}>
                <th scope="row">{nodeName(flow.from)} → {nodeName(flow.to)}</th>
                <td className="num">{formatQtyText(flow.kWhPerKg, "kWh/kg", 4)}</td>
                <td className="num">{total > 0 ? `${((flow.kWhPerKg / total) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <div className="panel-exports">
        <ExportButton label="FLOWS CSV" what="energy-flows" build={() => flowsCsv(result)} />
      </div>

      <p className="panel-caption">
        Per-kg energy ledger from the engine&apos;s flow edges — link width is kWh per kg of
        product through each stage.
      </p>
    </div>
  );
}
