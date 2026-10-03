import type { SimParams } from "@selene-isru/engine";
import { scaleLinear, scaleLog } from "d3-scale";
import { line } from "d3-shape";
import { useMemo, useState } from "react";
import {
  GRID_POINTS,
  outputValue,
  runSweep,
  sweepCsv,
  sweepInputs,
  sweepOutputs,
  type SweepInput,
  type SweepPoint,
  type SweepRun
} from "../../analysis/generalSweep";
import { formatQtyText } from "../../lib/format";
import { processScope, useScopedState, useSize } from "../../lib/hooks";
import { useStore } from "../../state/store";
import { ExportButton } from "./ExportButton";

/** Sequential ramp, low to high; see --seq-* in tokens.css. */
const RAMP = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"].map((token) => `var(${token})`);
const HEIGHT = 300;
const MARGIN = { top: 26, right: 18, bottom: 44, left: 74 };
/** An output spanning this ratio or more starts on a log colour/axis scale. */
const AUTO_LOG_RATIO = 100;

function tick(value: number): string {
  return formatQtyText(value, "", 3);
}

function inputText(input: SweepInput, value: number): string {
  return `${input.label} ${formatQtyText(value, input.unit, 4)}`;
}

/** Tick values that do not crowd: 1-2-5 steps on a log axis, thinned to at most `max`. */
function axisTicks(scale: { ticks: (count?: number) => number[] }, log: boolean, max = 6): number[] {
  let ticks = scale.ticks(5);
  if (log) {
    const lead = (value: number): number => Math.round(value / Math.pow(10, Math.floor(Math.log10(value))));
    ticks = ticks.filter((value) => [1, 2, 5].includes(lead(value)));
    if (ticks.length > max) ticks = ticks.filter((value) => lead(value) === 1);
  }
  while (ticks.length > max) ticks = ticks.filter((_, index) => index % 2 === 0);
  return ticks;
}

/** Scale for an input axis between two pixel positions. */
function axisScale(values: number[], log: boolean, from: number, to: number) {
  const domain = [values[0]!, values[values.length - 1]!];
  return log ? scaleLog().domain(domain).range([from, to]) : scaleLinear().domain(domain).range([from, to]);
}

/** Output extent across the run (and the live case), padded when flat. */
function outputExtent(run: SweepRun, current: number | null): [number, number] {
  const values = run.points.map((point) => point.value).filter((value): value is number => value !== null);
  if (current !== null) values.push(current);
  if (values.length === 0) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi > lo) return [lo, hi];
  const pad = Math.abs(lo) * 0.05 || 1;
  return [lo - pad, hi + pad];
}

export function SweepPanel(): React.JSX.Element {
  const params = useStore((s) => s.params);
  const result = useStore((s) => s.result);
  const applyPatch = useStore((s) => s.applyPatch);
  const [ref, size] = useSize<HTMLDivElement>();
  const streamKey = result.cryo.inventories.map((inventory) => inventory.stream).sort().join(",");
  const inputs = useMemo(() => sweepInputs(params, new Set(streamKey.split(",").filter(Boolean))), [params, streamKey]);
  const outputs = useMemo(() => sweepOutputs(result), [result]);

  // Choices belong to the site and process they were made for.
  const scope = processScope(params);
  const [xKey, setXKey] = useScopedState<keyof SimParams>(scope, () => "targetKgPerDay");
  const [yKey, setYKey] = useScopedState<keyof SimParams | "none">(scope, () => "none");
  const [outputPath, setOutputPath] = useState("energy.secTotal_kWhPerKg");
  const [logChoice, setLogChoice] = useState<Partial<Record<string, boolean>>>({});
  // null: decided by the output's range until the user picks
  const [logOutput, setLogOutput] = useState<boolean | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const x = inputs.find((input) => input.key === xKey) ?? inputs[0]!;
  const y = yKey === "none" ? null : inputs.find((input) => input.key === yKey && input.key !== x.key) ?? null;
  const output = outputs.find((item) => item.path === outputPath) ?? outputs[0]!;
  const xLog = x.min > 0 && (logChoice[x.key] ?? x.log);
  const yLog = y !== null && y.min > 0 && (logChoice[y.key] ?? y.log);
  const run = useMemo(
    () => runSweep(params, { ...x, log: xLog }, y === null ? null : { ...y, log: yLog }, output.path),
    [params, x, y, xLog, yLog, output.path]
  );
  // A picked point belongs to the grid it was picked from.
  const [selectedIndex, setSelectedIndex] = useScopedState<number | null>(
    `${scope}|${x.key}|${y?.key ?? ""}|${xLog}|${yLog}`,
    () => null
  );
  const selected = selectedIndex === null ? null : run.points[selectedIndex] ?? null;
  const shown = hover === null ? selected : run.points[hover] ?? null;

  const current = outputValue(result, output.path);
  const [lo, hi] = outputExtent(run, current);
  const useLogOutput = lo > 0 && (logOutput ?? hi / lo >= AUTO_LOG_RATIO);
  const alarmCount = run.points.filter((point) => point.alarms > 0).length;
  const width = Math.max(300, size.width);
  const plot = { left: MARGIN.left, right: width - MARGIN.right, top: MARGIN.top, bottom: HEIGHT - MARGIN.bottom };

  const describe = (point: SweepPoint): string =>
    [
      inputText(x, point.x),
      ...(y === null || point.y === null ? [] : [inputText(y, point.y)]),
      `${output.label} ${point.value === null ? "n/a" : formatQtyText(point.value, "", 4)}`,
      ...(point.alarms > 0 ? [`${point.alarms} alarm${point.alarms === 1 ? "" : "s"}`] : [])
    ].join(" · ");

  const step = (event: React.KeyboardEvent, columns: number): void => {
    const total = run.points.length;
    const at = hover ?? selectedIndex ?? 0;
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: columns, ArrowDown: -columns };
    if (event.key in moves) {
      event.preventDefault();
      setHover(Math.min(total - 1, Math.max(0, at + moves[event.key]!)));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedIndex(at);
    }
  };

  return (
    <div className="panel-section sweep-section" ref={ref}>
      <div className="panel-header">
        INPUT SWEEP
        <span className="num">
          {run.points.length} RUNS{alarmCount > 0 ? ` · ${alarmCount} WITH ALARMS` : ""}
        </span>
      </div>
      <div className="frontier-controls sweep-controls">
        <label>
          <span>INPUT</span>
          <select
            value={x.key}
            aria-label="Sweep input"
            onChange={(event) => {
              const next = event.target.value as keyof SimParams;
              setXKey(next);
              if (yKey === next) setYKey("none");
              setHover(null);
            }}
          >
            <InputOptions inputs={inputs} />
          </select>
        </label>
        <label>
          <span>SECOND INPUT</span>
          <select
            value={y?.key ?? "none"}
            aria-label="Second sweep input"
            onChange={(event) => {
              setYKey(event.target.value as keyof SimParams | "none");
              setHover(null);
            }}
          >
            <option value="none">None: a line</option>
            <InputOptions inputs={inputs.filter((input) => input.key !== x.key)} />
          </select>
        </label>
        <label>
          <span>OUTPUT</span>
          <select value={output.path} aria-label="Sweep output" onChange={(event) => setOutputPath(event.target.value)}>
            {[...new Set(outputs.map((item) => item.section))].map((section) => (
              <optgroup key={section} label={section}>
                {outputs.filter((item) => item.section === section).map((item) => (
                  <option key={item.path} value={item.path}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="frontier-constraints sweep-scales">
        <label className="sweep-toggle">
          <input
            type="checkbox"
            checked={xLog}
            disabled={x.min <= 0}
            onChange={(event) => setLogChoice({ ...logChoice, [x.key]: event.target.checked })}
          />
          LOG INPUT
        </label>
        {y !== null && (
          <label className="sweep-toggle">
            <input
              type="checkbox"
              checked={yLog}
              disabled={y.min <= 0}
              onChange={(event) => setLogChoice({ ...logChoice, [y.key]: event.target.checked })}
            />
            LOG SECOND INPUT
          </label>
        )}
        <label className="sweep-toggle">
          <input type="checkbox" checked={useLogOutput} disabled={lo <= 0} onChange={(event) => setLogOutput(event.target.checked)} />
          LOG OUTPUT
        </label>
        <ExportButton
          label="SWEEP CSV"
          what="sweep"
          title="Every sweep point: the swept inputs with units, the output by engine path, and its alarm count"
          build={() => sweepCsv(run)}
        />
      </div>

      <p className="sweep-readout mono" aria-live="polite">
        {shown === null ? `LIVE CASE · ${output.label} ${current === null ? "n/a" : formatQtyText(current, "", 4)}` : describe(shown)}
      </p>

      <div className="chart-well sweep-well">
        {y === null ? (
          <LineSweep
            run={run}
            x={x}
            xLog={xLog}
            plot={plot}
            width={width}
            extent={[lo, hi]}
            logOutput={useLogOutput}
            liveX={params[x.key] as number}
            liveValue={current}
            hover={hover}
            selected={selectedIndex}
            onHover={setHover}
            onSelect={setSelectedIndex}
            onKey={(event) => step(event, 0)}
            outputLabel={output.label}
          />
        ) : (
          <HeatSweep
            run={run}
            x={x}
            y={y}
            xLog={xLog}
            yLog={yLog}
            plot={plot}
            width={width}
            extent={[lo, hi]}
            logOutput={useLogOutput}
            liveX={params[x.key] as number}
            liveY={params[y.key] as number}
            hover={hover}
            selected={selectedIndex}
            onHover={setHover}
            onSelect={setSelectedIndex}
            onKey={(event) => step(event, GRID_POINTS)}
            outputLabel={output.label}
          />
        )}
      </div>

      {selected !== null && (
        <div className="frontier-candidate">
          <div>
            <span className="reactor-section-title">SELECTED POINT</span>
            <strong>{selected.alarms > 0 ? `${selected.alarms} ALARM${selected.alarms === 1 ? "" : "S"} AT THIS POINT` : "NO ALARMS AT THIS POINT"}</strong>
            <small>{describe(selected)}</small>
          </div>
          <button type="button" className="topbar-btn" onClick={() => applyPatch({ ...params, ...selected.patch })}>
            APPLY POINT
          </button>
        </div>
      )}
      <p className="panel-caption">
        Every point is a full engine run with all other inputs held at the live case, across the input's full
        engine range. Only inputs the rail shows for this case are offered. APPLY can be undone.
      </p>
    </div>
  );
}

/** Key for the two point markers: the live case (text ink) and alarms (alarm status colour, with its label). */
function MarkerKey(): React.JSX.Element {
  return (
    <>
      ◯ LIVE CASE · <tspan className="sweep-key-alarm">○</tspan> ALARM
    </>
  );
}

function InputOptions({ inputs }: { inputs: SweepInput[] }): React.JSX.Element {
  const groups = [...new Set(inputs.map((input) => input.group))];
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group} label={group.toUpperCase()}>
          {inputs.filter((input) => input.group === group).map((input) => (
            <option key={input.key} value={input.key}>
              {input.label}{input.unit.length > 0 ? ` [${input.unit}]` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

interface Plot {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface ChartProps {
  run: SweepRun;
  x: SweepInput;
  xLog: boolean;
  plot: Plot;
  width: number;
  extent: [number, number];
  logOutput: boolean;
  liveX: number;
  hover: number | null;
  selected: number | null;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
  onKey: (event: React.KeyboardEvent) => void;
  outputLabel: string;
}

function LineSweep(props: ChartProps & { liveValue: number | null }): React.JSX.Element {
  const { run, x, xLog, plot, width, extent, logOutput, liveX, liveValue, hover, selected, onHover, onSelect, onKey, outputLabel } = props;
  const xScale = axisScale(run.x.values, xLog, plot.left, plot.right);
  const yScale = (logOutput ? scaleLog() : scaleLinear()).domain(extent).range([plot.bottom, plot.top]).nice();
  const path = line<SweepPoint>()
    .defined((point) => point.value !== null)
    .x((point) => xScale(point.x))
    .y((point) => yScale(point.value!))(run.points) ?? "";
  const nearest = (px: number): number => {
    let best = 0;
    run.points.forEach((point, index) => {
      if (Math.abs(xScale(point.x) - px) < Math.abs(xScale(run.points[best]!.x) - px)) best = index;
    });
    return best;
  };
  const pointAt = (event: React.MouseEvent<SVGRectElement>): number => {
    const box = (event.currentTarget.ownerSVGElement ?? event.currentTarget).getBoundingClientRect();
    return nearest(event.clientX - box.left);
  };
  const focus = hover ?? selected;
  const focusPoint = focus === null ? null : run.points[focus] ?? null;
  const yTicks = axisTicks(yScale, logOutput);
  const xTicks = axisTicks(xScale, xLog);

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={`${outputLabel} against ${x.label}`}>
      {yTicks.map((value) => (
        <g key={`y${value}`}>
          <line className="sweep-grid" x1={plot.left} x2={plot.right} y1={yScale(value)} y2={yScale(value)} />
          <text className="axis-label" x={plot.left - 6} y={yScale(value) + 4} textAnchor="end">{tick(value)}</text>
        </g>
      ))}
      {xTicks.map((value) => {
        // labels at the plot's edges grow inward so they are not clipped
        const at = xScale(value);
        const anchor = at > plot.right - 24 ? "end" : at < plot.left + 24 ? "start" : "middle";
        return <text key={`x${value}`} className="axis-label" x={at} y={plot.bottom + 16} textAnchor={anchor}>{tick(value)}</text>;
      })}
      <text className="axis-label" x={plot.left} y={plot.top - 10}>{outputLabel}{logOutput ? " · LOG" : ""}</text>
      <text className="axis-label" x={plot.right} y={plot.top - 10} textAnchor="end"><MarkerKey /></text>
      <path className="sweep-line" d={path} />
      {run.points.map((point, index) =>
        point.alarms > 0 ? (
          <circle key={index} className="sweep-alarm" cx={xScale(point.x)} cy={point.value === null ? plot.bottom : yScale(point.value)} r={4} />
        ) : null
      )}
      {liveX >= run.x.values[0]! && liveX <= run.x.values[run.x.values.length - 1]! && (
        <g className="sweep-live">
          <line x1={xScale(liveX)} x2={xScale(liveX)} y1={plot.top} y2={plot.bottom} />
          {liveValue !== null && <circle cx={xScale(liveX)} cy={yScale(liveValue)} r={5} />}
        </g>
      )}
      {focusPoint !== null && (
        <g className="sweep-focus">
          <line x1={xScale(focusPoint.x)} x2={xScale(focusPoint.x)} y1={plot.top} y2={plot.bottom} />
          {focusPoint.value !== null && <circle cx={xScale(focusPoint.x)} cy={yScale(focusPoint.value)} r={4.5} />}
        </g>
      )}
      <text className="axis-label" x={plot.left} y={HEIGHT - 8}>{x.label}{x.unit.length > 0 ? ` [${x.unit}]` : ""}{xLog ? " · LOG" : ""}</text>
      <rect
        className="sweep-hit"
        x={plot.left}
        y={plot.top}
        width={Math.max(0, plot.right - plot.left)}
        height={Math.max(0, plot.bottom - plot.top)}
        tabIndex={0}
        aria-label="Sweep points: arrow keys move, Enter selects"
        onPointerMove={(event) => onHover(pointAt(event))}
        onPointerLeave={() => onHover(null)}
        // a tap may arrive with no pointermove before it, so it picks by its own position
        onClick={(event) => onSelect(pointAt(event))}
        onKeyDown={onKey}
        onBlur={() => onHover(null)}
      />
    </svg>
  );
}

function HeatSweep(
  props: ChartProps & { y: SweepInput; yLog: boolean; liveY: number }
): React.JSX.Element {
  const { run, x, y, xLog, yLog, plot, width, extent, logOutput, liveX, liveY, hover, selected, onHover, onSelect, onKey, outputLabel } = props;
  const columns = run.x.values.length;
  const rows = run.y?.values.length ?? 1;
  const legendHeight = 26;
  const top = plot.top + legendHeight;
  const cw = (plot.right - plot.left) / columns;
  const ch = (plot.bottom - top) / rows;
  // Bin the output into the ramp's steps, on log values when asked.
  const bin = (value: number): number => {
    const t = logOutput
      ? (Math.log(value) - Math.log(extent[0])) / (Math.log(extent[1]) - Math.log(extent[0]))
      : (value - extent[0]) / (extent[1] - extent[0]);
    return Math.min(RAMP.length - 1, Math.max(0, Math.floor(t * RAMP.length)));
  };
  const xCenter = axisScale(run.x.values, xLog, plot.left + cw / 2, plot.right - cw / 2);
  const yCenter = axisScale(run.y!.values, yLog, plot.bottom - ch / 2, top + ch / 2);
  const cellAt = (event: React.MouseEvent<SVGRectElement>): number => {
    const box = (event.currentTarget.ownerSVGElement ?? event.currentTarget).getBoundingClientRect();
    const i = Math.min(columns - 1, Math.max(0, Math.floor((event.clientX - box.left - plot.left) / cw)));
    const j = Math.min(rows - 1, Math.max(0, rows - 1 - Math.floor((event.clientY - box.top - top) / ch)));
    return j * columns + i;
  };
  const focus = hover ?? selected;
  const labelEvery = Math.ceil(columns / 5);
  const swatch = Math.min(46, (plot.right - plot.left) / RAMP.length);

  return (
    <svg width={width} height={HEIGHT + legendHeight} role="img" aria-label={`${outputLabel} across ${x.label} and ${y.label}`}>
      <g className="sweep-legend">
        {RAMP.map((fill, index) => (
          <rect key={fill} x={plot.left + index * swatch} y={plot.top} width={swatch - 2} height={9} fill={fill} />
        ))}
        <text className="axis-label" x={plot.left} y={plot.top + 21}>{tick(extent[0])}</text>
        <text className="axis-label" x={plot.left + RAMP.length * swatch - 2} y={plot.top + 21} textAnchor="end">{tick(extent[1])}</text>
        <text className="axis-label" x={plot.left + RAMP.length * swatch + 8} y={plot.top + 9}>
          {logOutput ? "LOG STEPS" : "EQUAL STEPS"} · <MarkerKey />
        </text>
      </g>
      {run.points.map((point, index) => {
        const i = index % columns;
        const j = Math.floor(index / columns);
        return (
          <rect
            key={index}
            className={index === focus ? "sweep-cell focus" : "sweep-cell"}
            x={plot.left + i * cw + 0.5}
            y={top + (rows - 1 - j) * ch + 0.5}
            width={Math.max(0, cw - 1)}
            height={Math.max(0, ch - 1)}
            fill={point.value === null ? "var(--bg-inset)" : RAMP[bin(point.value)]}
          />
        );
      })}
      {run.points.map((point, index) =>
        point.alarms > 0 ? (
          <circle
            key={`a${index}`}
            className="sweep-alarm"
            cx={plot.left + (index % columns) * cw + cw / 2}
            cy={top + (rows - 1 - Math.floor(index / columns)) * ch + ch / 2}
            r={Math.min(3, cw / 4)}
          />
        ) : null
      )}
      {run.x.values.map((value, i) =>
        i % labelEvery === 0 || i === columns - 1 ? (
          <text
            key={`x${i}`}
            className="axis-label"
            x={i === columns - 1 ? plot.right : plot.left + i * cw + cw / 2}
            y={plot.bottom + 16}
            textAnchor={i === columns - 1 ? "end" : "middle"}
          >
            {tick(value)}
          </text>
        ) : null
      )}
      {run.y!.values.map((value, j) =>
        j % labelEvery === 0 || j === rows - 1 ? (
          <text key={`y${j}`} className="axis-label" x={plot.left - 6} y={top + (rows - 1 - j) * ch + ch / 2 + 4} textAnchor="end">{tick(value)}</text>
        ) : null
      )}
      {liveX >= run.x.values[0]! && liveX <= run.x.values[columns - 1]! &&
        liveY >= run.y!.values[0]! && liveY <= run.y!.values[rows - 1]! && (
        <circle className="sweep-live-ring" cx={xCenter(liveX)} cy={yCenter(liveY)} r={Math.max(5, Math.min(cw, ch) / 2)} />
      )}
      <text className="axis-label" x={plot.left} y={HEIGHT + legendHeight - 8}>
        {x.label}{x.unit.length > 0 ? ` [${x.unit}]` : ""}{xLog ? " · LOG" : ""} → · {y.label}{y.unit.length > 0 ? ` [${y.unit}]` : ""}{yLog ? " · LOG" : ""} ↑
      </text>
      <rect
        className="sweep-hit"
        x={plot.left}
        y={top}
        width={Math.max(0, plot.right - plot.left)}
        height={Math.max(0, plot.bottom - top)}
        tabIndex={0}
        aria-label="Sweep grid: arrow keys move, Enter selects"
        onPointerMove={(event) => onHover(cellAt(event))}
        onPointerLeave={() => onHover(null)}
        // a tap may arrive with no pointermove before it, so it picks by its own position
        onClick={(event) => onSelect(cellAt(event))}
        onKeyDown={onKey}
        onBlur={() => onHover(null)}
      />
    </svg>
  );
}
