import { useMemo, useState } from "react";
import { pCritDynamicKw } from "@selene-isru/engine";
import { scaleLog } from "d3-scale";
import { line as d3line } from "d3-shape";
import { useSize } from "../../lib/hooks";
import { formatQty, formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";

/**
 * §4.3 — solar vs nuclear mass trade on log-log axes, driven only by
 * SimResult + input params and the engine's public pCritDynamicKw helper.
 */
export function PowerTrade(): React.JSX.Element {
  const result = useStore((s) => s.result);
  const compareResult = useStore((s) => s.compareResult);
  const params = useStore((s) => s.params);
  const [ref, size] = useSize<HTMLDivElement>();
  const [tYears, setTYears] = useState(0);

  const width = Math.max(280, size.width);
  const height = 380;
  const margin = { top: 16, right: 20, bottom: 38, left: 78 };

  const pGridKw = result.energy.gridPowerW / 1000;
  const comparePGridKw = compareResult.energy.gridPowerW / 1000;
  // β from the engine's own solar sizing at the operating point (no re-derivation)
  const beta = pGridKw > 0 ? result.power.solarMassKg / pGridKw : 0;
  const alpha = params.alphaSpecific;
  const mShield = params.MshieldKg;

  // degradation-adjusted slopes at scrubber time t
  const betaT = beta / Math.pow(1 - params.dSolar, tYears);
  const alphaT = alpha * (1 + params.dNuclear * tYears);
  const pCritT = pCritDynamicKw(mShield, beta, alpha, params.dSolar, params.dNuclear, tYears);

  const chart = useMemo(() => {
    const compareMassKg =
      compareResult.power.architecture === "solar" ? compareResult.power.solarMassKg : compareResult.power.nuclearMassKg;
    const anchors = [pGridKw, comparePGridKw, result.power.pCritW / 1000, pCritT ?? 0].filter((v) => v > 0);
    const lo = Math.max(0.1, Math.min(...anchors) / 12);
    const hi = Math.max(...anchors) * 12;
    const x = scaleLog().domain([lo, hi]).range([margin.left, width - margin.right]);

    const massAt = (pKw: number, slope: number, intercept: number): number =>
      Math.max(1, intercept + slope * pKw);
    const samples = 60;
    const pts: number[] = [];
    for (let i = 0; i <= samples; i++) {
      pts.push(lo * Math.pow(hi / lo, i / samples));
    }
    const solarPts = pts.map((p) => [p, massAt(p, betaT, 0)] as const);
    const nukePts = pts.map((p) => [p, massAt(p, alphaT, mShield)] as const);
    const allMass = [...solarPts, ...nukePts].map((d) => d[1]);
    allMass.push(Math.max(1, compareMassKg));
    const y = scaleLog()
      .domain([Math.max(1, Math.min(...allMass) / 2), Math.max(...allMass) * 2])
      .range([height - margin.bottom, margin.top]);

    const gen = d3line<readonly [number, number]>()
      .x((d) => x(d[0]))
      .y((d) => y(d[1]));

    return {
      x,
      y,
      solarPath: gen(solarPts) ?? "",
      nukePath: gen(nukePts) ?? "",
      xTicks: x.ticks(4),
      yTicks: y.ticks(4)
    };
  }, [pGridKw, comparePGridKw, compareResult.power.architecture, compareResult.power.solarMassKg, compareResult.power.nuclearMassKg, result.power.pCritW, pCritT, betaT, alphaT, mShield, width, margin.left, margin.right, margin.top, margin.bottom]);

  const opMassKg =
    result.power.architecture === "solar" ? result.power.solarMassKg : result.power.nuclearMassKg;
  const compareOpMassKg =
    compareResult.power.architecture === "solar" ? compareResult.power.solarMassKg : compareResult.power.nuclearMassKg;

  return (
    <div className="panel-section" ref={ref}>
      <div className="panel-header">
        SOLAR ↔ NUCLEAR TRADE
        <span className="num">P_CRIT {formatQtyText((pCritT ?? result.power.pCritW / 1000) * 1000, "W")}</span>
      </div>

      <div className="chart-well power-well">
        <svg width={width} height={height} role="img" aria-label="Power architecture mass trade">
          {/* gridlines */}
          {chart.xTicks.map((t) => (
            <line
              key={`x${t}`}
              x1={chart.x(t)}
              x2={chart.x(t)}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke="var(--earthshine)"
              strokeOpacity="0.22"
            />
          ))}
          {chart.yTicks.map((t) => (
            <line
              key={`y${t}`}
              x1={margin.left}
              x2={width - margin.right}
              y1={chart.y(t)}
              y2={chart.y(t)}
              stroke="var(--earthshine)"
              strokeOpacity="0.22"
            />
          ))}
          {chart.xTicks.map((t) => (
            <text key={`xl${t}`} className="axis-label" x={chart.x(t)} y={height - margin.bottom + 16} textAnchor="middle">
              {formatQty(t * 1000, "W").value} {formatQty(t * 1000, "W").unit}
            </text>
          ))}
          {chart.yTicks.map((t) => (
            <text key={`yl${t}`} className="axis-label" x={margin.left - 8} y={chart.y(t) + 3} textAnchor="end">
              {formatQty(t, "kg").value} {formatQty(t, "kg").unit}
            </text>
          ))}

          {/* P_crit hairline */}
          {pCritT !== null && pCritT > 0 && (
            <g>
              <line
                x1={chart.x(pCritT)}
                x2={chart.x(pCritT)}
                y1={margin.top}
                y2={height - margin.bottom}
                stroke="var(--text-mid)"
                strokeDasharray="3 3"
              />
              <text className="axis-label" x={chart.x(pCritT) + 5} y={margin.top + 10}>
                P_CRIT
              </text>
            </g>
          )}

          <path d={chart.solarPath} fill="none" stroke="var(--solar)" strokeWidth="1.8" />
          <path d={chart.nukePath} fill="none" stroke="var(--fission)" strokeWidth="1.8" />

          {/* operating point */}
          {pGridKw > 0 && (
            <circle
              cx={chart.x(pGridKw)}
              cy={chart.y(Math.max(1, opMassKg))}
              r="6"
              fill="none"
              stroke="var(--melt)"
              strokeWidth="2"
            />
          )}
          {comparePGridKw > 0 && (
            <g>
              <circle
                cx={chart.x(comparePGridKw)}
                cy={chart.y(Math.max(1, compareOpMassKg))}
                r="5"
                fill="none"
                stroke="var(--cryo)"
                strokeWidth="1.8"
                strokeDasharray="3 2"
              />
              <text className="axis-label" x={chart.x(comparePGridKw) + 8} y={chart.y(Math.max(1, compareOpMassKg)) - 6}>
                B
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className="power-scrub">
        <label className="mono" htmlFor="power-t">
          T+<span className="num">{tYears.toFixed(1)}</span> YR
        </label>
        <input
          id="power-t"
          type="range"
          min={0}
          max={params.missionYears}
          step={params.missionYears / 100}
          value={tYears}
          aria-label="Mission elapsed time"
          onChange={(e) => setTYears(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, var(--melt) ${(tYears / params.missionYears) * 100}%, var(--line) ${(tYears / params.missionYears) * 100}%)`
          }}
        />
      </div>
      <p className="panel-caption">
        Scrub mission time: solar array degradation compounds and rotates the yellow line upward,
        drifting the break-even point P_crit to the right.
      </p>

      <div className="power-stats mono">
        <div>
          ARCHITECTURE <b className="num">{result.power.architecture.toUpperCase()}</b>
        </div>
        <div>
          SOLAR SYS <b className="num">{formatQtyText(result.power.solarMassKg, "kg")}</b>
        </div>
        <div>
          NUCLEAR SYS <b className="num">{formatQtyText(result.power.nuclearMassKg, "kg")}</b>
        </div>
        <div>
          ARRAY <b className="num">{formatQtyText(result.power.solarArrayM2, "m^2")}</b>
        </div>
        <div>
          RADIATOR <b className="num">{formatQtyText(result.power.radiatorM2, "m^2")}</b>
        </div>
        {result.power.beamedFloorPowerW !== null && (
          <div>
            BEAMED FLOOR <b className="num">{formatQtyText(result.power.beamedFloorPowerW, "W")}</b>
          </div>
        )}
        {result.site === "polar" && (
          <>
            <div>PROFILE <b className="num">{result.power.siteProfile.mode.toUpperCase()}</b></div>
            <div>AVG DELIVERED <b className="num">{(result.power.siteProfile.averageDeliveredFraction * 100).toFixed(1)}%</b></div>
            <div>RX OUTAGE <b className="num">{formatQtyText(result.power.siteProfile.longestReceiverOutageHours, "h")}</b></div>
          </>
        )}
      </div>
    </div>
  );
}
