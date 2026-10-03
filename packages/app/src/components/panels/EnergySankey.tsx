import { useMemo, useState } from "react";
import { sankey, sankeyJustify, type SankeyGraph } from "d3-sankey";
import { line as d3line } from "d3-shape";
import { useSize } from "../../lib/hooks";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";
import { flowsCsv } from "../../analysis/panelExports";
import { perKgBasis } from "../../analysis/summary";
import { Qty } from "../Qty";
import { ExportButton } from "./ExportButton";

/** fixed node order — no relayout jumps on param change (§4.1) */
const NODE_ORDER = ["mine", "melt", "beneficiation", "reduction", "sublimation", "electrolysis", "parasitic", "cryo", "product"];

const NODE_COLOR: Record<string, string> = {
  mine: "var(--regolith)",
  melt: "var(--melt)",
  beneficiation: "var(--regolith)",
  reduction: "var(--melt)",
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
  beneficiation: "BENEFICIATION",
  reduction: "H₂ REDUCTION",
  electrolysis: "ELECTROLYSIS",
  parasitic: "PARASITIC LOSS",
  sublimation: "SUBLIMATION",
  cryo: "CRYO STORAGE",
  product: "PRODUCT"
};

const nodeName = (id: string): string => NODE_NAME[id] ?? id.toUpperCase();

/** Width of one label character: 11px mono with 0.06em tracking [px]. */
const LABEL_CHAR_PX = 7.3;
const LABEL_LINE_PX = 14;

export interface SankeyLabelInput {
  id: string;
  /** label anchor point before any shift [px] */
  x: number;
  y: number;
  anchor: "start" | "end";
  text: string;
}

/**
 * Horizontal label positions that do not overlap. A chain with more stages
 * than columns of room (the ilmenite plant has five) puts neighbouring
 * labels on the same line, so each label, taken left to right, moves to the
 * nearest free line within the chart.
 */
export function placeSankeyLabels(labels: SankeyLabelInput[], height: number): Map<string, number> {
  const placed: Array<{ left: number; right: number; y: number }> = [];
  const positions = new Map<string, number>();
  const span = (label: SankeyLabelInput): [number, number] => {
    const width = label.text.length * LABEL_CHAR_PX;
    return label.anchor === "start" ? [label.x, label.x + width] : [label.x - width, label.x];
  };
  const ordered = [...labels].sort((a, b) => span(a)[0] - span(b)[0] || a.y - b.y);
  for (const label of ordered) {
    const [left, right] = span(label);
    const clashes = (y: number): boolean =>
      placed.some((other) => left < other.right && other.left < right && Math.abs(other.y - y) < LABEL_LINE_PX);
    let y = label.y;
    for (let step = 1; clashes(y) && step < 40; step += 1) {
      const offset = Math.ceil(step / 2) * LABEL_LINE_PX * (step % 2 === 1 ? 1 : -1);
      const candidate = label.y + offset;
      if (candidate >= LABEL_LINE_PX / 2 && candidate <= height - LABEL_LINE_PX / 2) y = candidate;
    }
    placed.push({ left, right, y });
    positions.set(label.id, y);
  }
  return positions;
}

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
  const params = useStore((s) => s.params);
  const basis = perKgBasis(params, result);
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
    // Known stages keep their fixed order; a stage the table does not know yet
    // goes last rather than leaving a link without a node.
    const nodes: NodeDatum[] = [
      ...NODE_ORDER.filter((id) => present.has(id)),
      ...[...present].filter((id) => !NODE_ORDER.includes(id))
    ].map((id) => ({ id }));
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

  // What each stage spends: its outgoing lines, or for an end node (product,
  // parasitic loss) what reaches it. The layout's own node value is the larger
  // of in and out, which for a stage cheaper than the one before it (ilmenite
  // reduction after beneficiation) is the previous stage's energy.
  const stageValue = useMemo(() => {
    const out = new Map<string, number>();
    const into = new Map<string, number>();
    for (const f of result.energy.flows) {
      out.set(f.from, (out.get(f.from) ?? 0) + f.kWhPerKg);
      into.set(f.to, (into.get(f.to) ?? 0) + f.kWhPerKg);
    }
    return (id: string): number => out.get(id) ?? into.get(id) ?? 0;
  }, [result.energy.flows]);

  // Label anchors: beside each node when the chart runs left to right, just
  // above its bar when it runs top to bottom. Nodes in the far half read back
  // toward the middle so their labels stay inside the chart, and labels that
  // would overlap move to the nearest free line.
  const labels = useMemo(() => {
    const anchors = graph.nodes.map((n) => {
      const x0 = n.x0 ?? 0;
      const x1 = n.x1 ?? 0;
      const y0 = n.y0 ?? 0;
      const y1 = n.y1 ?? 0;
      const isRight = vertical ? y0 > width / 2 : x0 > layoutW / 2;
      const x = vertical ? (isRight ? y1 - 2 : y0 + 2) : isRight ? x0 - 6 : x1 + 6;
      return {
        id: n.id,
        x,
        y: vertical ? x0 - 4 : (y0 + y1) / 2,
        anchor: isRight ? ("end" as const) : ("start" as const),
        text: `${nodeName(n.id)} ${formatQtyText(stageValue(n.id), "kWh/kg")}`
      };
    });
    const y = placeSankeyLabels(anchors, vertical ? height : layoutH);
    return new Map(anchors.map((anchor) => [anchor.id, { ...anchor, y: y.get(anchor.id) ?? anchor.y }]));
  }, [graph, vertical, width, height, layoutW, layoutH, stageValue]);

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
          <div className="panel-header">{nameMode === "code" ? "SEC TOTAL" : `ENERGY PER KG OF ${basis.toUpperCase()}`}</div>
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
            return (
              <rect
                key={n.id}
                x={vertical ? y0 : x0}
                y={vertical ? x0 : y0}
                width={vertical ? y1 - y0 : x1 - x0}
                height={vertical ? x1 - x0 : y1 - y0}
                fill={NODE_COLOR[n.id] ?? "var(--text-low)"}
                stroke="var(--bg-inset)"
                strokeWidth={1.5}
              />
            );
          })}
          {/* Labels after every bar, so no later bar is drawn over a label. */}
          {graph.nodes.map((n) => {
            const label = labels.get(n.id);
            if (label === undefined) return null;
            return (
              <text
                key={`label-${n.id}`}
                className="sankey-node-label"
                x={label.x}
                y={label.y}
                dominantBaseline={vertical ? "auto" : "middle"}
                textAnchor={label.anchor}
              >
                {nodeName(n.id)}
                <tspan className="sankey-node-value">{` ${formatQtyText(stageValue(n.id), "kWh/kg")}`}</tspan>
              </text>
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
        <caption>Energy flows per kg of {basis}</caption>
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
