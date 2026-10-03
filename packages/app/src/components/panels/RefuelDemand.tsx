import { useMemo } from "react";
import { refuelTimeline } from "@selene-isru/engine";
import type { RefuelResult } from "@selene-isru/engine";
import { scaleLinear } from "d3-scale";
import { line as d3line } from "d3-shape";
import { refuelCsv } from "../../analysis/panelExports";
import { useSize } from "../../lib/hooks";
import { formatQty, formatQtyProse, formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";
import { ExportButton } from "./ExportButton";

/**
 * Refuelling demand: what a reusable lander based at the plant burns, how
 * much of it the plant supplies, and how its stores draw down sortie by
 * sortie. Every number is an engine output; the drawdown comes from the
 * engine's refuelTimeline().
 */
export function RefuelDemand({ refuel }: { refuel: RefuelResult }): React.JSX.Element {
  const params = useStore((s) => s.params);
  const result = useStore((s) => s.result);
  const [ref, size] = useSize<HTMLDivElement>();
  const timeline = useMemo(() => refuelTimeline(params, result), [params, result]);

  const width = Math.max(280, size.width);
  const height = 220;
  const margin = { top: 16, right: 18, bottom: 34, left: 80 };
  const start = result.campaign.firstProductDay;
  const makesHydrogen = refuel.supplyH2KgPerDay > 0;
  const tankExceeded = result.warnings.some((warning) => warning.id === "refuel-tank-exceeded");
  const share = Math.round(refuel.isruShare * 100);

  const chart = useMemo(() => {
    const endYears = Math.max(0.05, ((timeline.at(-1)?.tDays ?? start) - start) / 365);
    const top = Math.max(1, ...timeline.map((point) => Math.max(point.o2Kg, point.h2Kg)));
    const x = scaleLinear().domain([0, endYears]).range([margin.left, width - margin.right]);
    const y = scaleLinear().domain([0, top]).nice(4).range([height - margin.bottom, margin.top]);
    const path = (value: (point: (typeof timeline)[number]) => number): string =>
      d3line<(typeof timeline)[number]>()
        .x((point) => x((point.tDays - start) / 365))
        .y((point) => y(value(point)))(timeline) ?? "";
    return {
      x,
      y,
      o2: path((point) => point.o2Kg),
      h2: path((point) => point.h2Kg),
      sorties: timeline.filter((point) => /^sortie \d+$/.test(point.event)).map((point) => x((point.tDays - start) / 365)),
      xTicks: x.ticks(Math.min(6, Math.max(2, Math.ceil(endYears * 2)))),
      yTicks: y.ticks(4)
    };
  }, [timeline, start, width, margin.left, margin.right, margin.top, margin.bottom]);

  return (
    <div className="panel-section refuel-demand" ref={ref}>
      <div className="panel-header">
        REFUELLING DEMAND · REUSABLE LANDER
        <span className="num">PLANT SUPPLIES {share}% OF ITS PROPELLANT</span>
      </div>

      <div className="campaign-cards refuel-cards">
        <div>
          <span>PER SORTIE</span>
          <strong className="num">{formatQtyText(refuel.propellantPerSortieKg, "kg")}</strong>
          <small>
            {formatQtyProse(refuel.oxidizerPerSortieKg, "kg")} O₂ + {formatQtyProse(refuel.fuelPerSortieKg, "kg")} H₂
            {tankExceeded ? ` · over the ${formatQtyProse(params.MtankReusable, "kg")} tanks` : ""}
          </small>
        </div>
        <div>
          <span>DEMAND</span>
          <strong className="num">{formatQtyText(refuel.demandO2KgPerDay + refuel.demandFuelKgPerDay, "kg/day")}</strong>
          <small>{params.sortiesPerYear} sortie{params.sortiesPerYear === 1 ? "" : "s"} a year</small>
        </div>
        <div>
          <span>OXYGEN COVERS</span>
          <strong className="num">{refuel.oxidizerSortiesPerYear.toFixed(1)} /YR</strong>
          <small>
            {makesHydrogen
              ? `sorties; its hydrogen covers ${refuel.fuelSortiesPerYear.toFixed(1)} /yr`
              : "sorties; all hydrogen comes from Earth"}
          </small>
        </div>
        <div>
          <span>NOT NEEDED</span>
          <strong className="num">{formatQtyText(refuel.surplusKgPerDay, "kg/day")}</strong>
          <small>
            {refuel.surplusKgPerDay > 0
              ? `of ${formatQtyProse(refuel.supplyO2KgPerDay + refuel.supplyH2KgPerDay, "kg/day")} made`
              : `Earth supplies ${formatQtyProse(refuel.earthPropellantKgPerYear, "kg/yr")}`}
          </small>
        </div>
      </div>

      <div className="chart-well">
        <svg width={width} height={height} role="img" aria-label={`Propellant in store over the first sorties. The plant supplies ${share}% of the lander's propellant.`}>
          {chart.yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={margin.left} x2={width - margin.right} y1={chart.y(t)} y2={chart.y(t)} stroke="var(--earthshine)" strokeOpacity="0.22" />
              <text className="axis-label" x={margin.left - 8} y={chart.y(t) + 3} textAnchor="end">
                {t === 0 ? "0" : `${formatQty(t, "kg").value} ${formatQty(t, "kg").unit}`}
              </text>
            </g>
          ))}
          {chart.xTicks.map((t) => (
            <text key={`x${t}`} className="axis-label" x={chart.x(t)} y={height - margin.bottom + 16} textAnchor="middle">
              {t} YR
            </text>
          ))}
          {chart.sorties.map((sx, index) => (
            <line key={`s${index}`} x1={sx} x2={sx} y1={margin.top} y2={height - margin.bottom} stroke="var(--text-low)" strokeDasharray="2 4" />
          ))}
          <path d={chart.o2} fill="none" stroke="var(--cryo)" strokeWidth="2" />
          {makesHydrogen && <path d={chart.h2} fill="none" stroke="var(--fission)" strokeWidth="2" />}
        </svg>
        <div className="campaign-legend mono" aria-hidden="true">
          <span className="refuel-key-o2">LOX IN STORE</span>
          {makesHydrogen && <span className="refuel-key-h2">LH₂ IN STORE</span>}
          <span className="refuel-key-sortie">SORTIE</span>
        </div>
      </div>

      <p className="panel-caption">
        Each sortie climbs to the staging orbit with {formatQtyProse(params.McargoUp, "kg")} of cargo and the propellant for its
        return ({formatQtyProse(params.dvAscent, "m/s")}), then lands with {formatQtyProse(params.McargoDown, "kg")} (
        {formatQtyProse(params.dvDescent, "m/s")}), all loaded on the surface. The ideal rocket equation at Isp {params.IspReusable} s
        gives the load, split at O/F {params.mixtureRatio}. The plant supplies each component up to its demand and Earth
        supplies the rest. The campaign credits only the {formatQtyProse(refuel.usedKgPerDay, "kg/day")} the lander burns.
        Stores hold at least one sortie's load and start empty at production start.
      </p>

      <div className="panel-exports">
        <ExportButton
          label="DRAWDOWN CSV"
          what="refuel-drawdown"
          title="LOX and LH2 in store from production start, at each sortie and each time a store fills"
          build={() => refuelCsv(timeline)}
        />
      </div>
    </div>
  );
}
