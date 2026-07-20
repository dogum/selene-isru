import { useMemo } from "react";
import { useSize } from "../../lib/hooks";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";
import { Qty } from "../Qty";
import { AssayChart } from "./AssayChart";

const MAX_FAIRINGS = 8;

function subsystemColor(subsystem: string, architecture: "solar" | "nuclear"): string {
  if (subsystem.includes("excavation")) {
    return "var(--regolith)";
  }
  if (subsystem.includes("reactor")) {
    return "var(--melt)";
  }
  if (subsystem.includes("power")) {
    return architecture === "solar" ? "var(--solar)" : "var(--fission)";
  }
  if (subsystem.includes("cryo")) {
    return "var(--cryo)";
  }
  return "var(--text-low)";
}

/** §4.2 — manifest stacked bar + payload packing diagram. */
export function MassManifest(): React.JSX.Element {
  const result = useStore((s) => s.result);
  const etaPack = useStore((s) => s.params.etaPack);
  const [ref, size] = useSize<HTMLDivElement>();
  const width = Math.max(280, size.width);

  const { manifest, totalInfraMassKg, payloadPerMissionKg, nMissions } = result.logistics;
  const arch = result.power.architecture;
  const rows = manifest.filter((r) => r.massKg > 0);

  /* stacked manifest bar */
  const barH = 34;
  let acc = 0;
  const segments = rows.map((r) => {
    const x = totalInfraMassKg > 0 ? (acc / totalInfraMassKg) * width : 0;
    const w = totalInfraMassKg > 0 ? (r.massKg / totalInfraMassKg) * width : 0;
    acc += r.massKg;
    return { ...r, x, w, color: subsystemColor(r.subsystem, arch) };
  });

  /* packing diagram: greedy fill of infra blocks across fairings */
  const packing = useMemo(() => {
    const usable = etaPack * payloadPerMissionKg;
    const fairings: Array<Array<{ subsystem: string; massKg: number; color: string }>> = [];
    let remaining = rows.map((r) => ({ ...r, color: subsystemColor(r.subsystem, arch) }));
    for (let m = 0; m < nMissions && m < MAX_FAIRINGS; m++) {
      let cap = usable;
      const blocks: Array<{ subsystem: string; massKg: number; color: string }> = [];
      remaining = remaining.flatMap((r) => {
        if (cap <= 0) {
          return [r];
        }
        const take = Math.min(cap, r.massKg);
        cap -= take;
        if (take > 0) {
          blocks.push({ ...r, massKg: take });
        }
        const left = r.massKg - take;
        return left > 1e-9 ? [{ ...r, massKg: left }] : [];
      });
      fairings.push(blocks);
    }
    const margin = usable * nMissions - totalInfraMassKg;
    return { fairings, usable, margin, truncated: nMissions > MAX_FAIRINGS };
  }, [rows, etaPack, payloadPerMissionKg, nMissions, totalInfraMassKg, arch]);

  const fairingH = 250;
  const fairingW = 82;
  const gap = 22;
  const diagramW = packing.fairings.length * (fairingW + gap);

  return (
    <div className="panel-section" ref={ref}>
      <div className="panel-header">
        INFRASTRUCTURE MANIFEST
        <span className="num">{formatQtyText(totalInfraMassKg, "kg")}</span>
      </div>
      <div className="chart-well manifest-well">
        <svg width={width} height={barH + 40} role="img" aria-label="Mass manifest stacked bar">
          {segments.map((s) => (
            <rect key={s.subsystem} x={s.x} y={8} width={Math.max(1, s.w - 1)} height={barH} fill={s.color} />
          ))}
        </svg>
        <div className="manifest-legend">
          {segments.map((s) => (
            <span key={s.subsystem} className="manifest-key mono">
              <i style={{ background: s.color }} />
              {s.subsystem.toUpperCase()} <b className="num">{formatQtyText(s.massKg, "kg")}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="panel-header" style={{ marginTop: 18 }}>
        PAYLOAD PACKING
        <span className="num">{formatQtyText(payloadPerMissionKg, "kg")} / MISSION</span>
      </div>
      <div className="mass-pack">
        <div className="chart-well mass-pack-well">
          <svg width={Math.max(diagramW, 120)} height={fairingH + 28} role="img" aria-label="Payload packing per mission">
            <defs>
              <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--text-low)" strokeWidth="1" />
              </pattern>
            </defs>
            {packing.fairings.map((blocks, m) => {
              const x = m * (fairingW + gap) + 4;
              const lossH = fairingH * (1 - etaPack);
              let yAcc = fairingH;
              return (
                <g key={m}>
                  <rect
                    x={x}
                    y={10}
                    width={fairingW}
                    height={fairingH}
                    fill="none"
                    stroke="var(--line)"
                    strokeWidth="1.5"
                  />
                  {/* packing-loss hatch zone at the top */}
                  <rect x={x} y={10} width={fairingW} height={lossH} fill="url(#hatch)" opacity={0.5} />
                  {blocks.map((b, i) => {
                    const h = (b.massKg / payloadPerMissionKg) * fairingH;
                    yAcc -= h;
                    return (
                      <rect
                        key={`${b.subsystem}-${i}`}
                        x={x + 2}
                        y={10 + yAcc}
                        width={fairingW - 4}
                        height={Math.max(1, h - 1)}
                        fill={b.color}
                      >
                        <title>{`${b.subsystem} · ${formatQtyText(b.massKg, "kg")}`}</title>
                      </rect>
                    );
                  })}
                  <text className="sankey-node-label" x={x + fairingW / 2} y={fairingH + 24} textAnchor="middle">
                    MSN {m + 1}
                  </text>
                </g>
              );
            })}
          </svg>
          {packing.truncated && (
            <div className="panel-caption mono">
              SHOWING {MAX_FAIRINGS} OF {nMissions} FAIRINGS
            </div>
          )}
          <div className="mass-margin mono num">
            {packing.margin >= 0
              ? `MARGIN +${formatQtyText(packing.margin, "kg")}`
              : `OVERBOOKED ${formatQtyText(packing.margin, "kg")}`}
          </div>
        </div>
        <div className="mass-missions">
          <div className="mass-missions-n num">{nMissions}</div>
          <div className="kpi-label" style={{ borderColor: "var(--regolith)" }}>
            MISSIONS
          </div>
          <div className="mass-missions-stats mono">
            <div>
              LEVERAGE <b className="num">{formatQtyText(result.logistics.leverageL, "×")}</b>
            </div>
            <div>
              PAYBACK <b className="num">{formatQtyText(result.logistics.paybackDays, "days")}</b>
            </div>
          </div>
        </div>
      </div>

      <p className="panel-caption">
        Hatched zone is packing loss (1 − η<sub>pack</sub>); blocks are infrastructure mass
        greedily manifested across missions.{" "}
        <span className="num">
          <Qty value={totalInfraMassKg} unit="kg" />
        </span>{" "}
        total infra.
      </p>

      <AssayChart />
    </div>
  );
}
