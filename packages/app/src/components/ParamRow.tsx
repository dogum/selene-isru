import { useEffect, useRef, useState } from "react";
import type { SimParams } from "@selene-isru/engine";
import type { NumericParamDef } from "../controls/manifest";
import { formatInputValue } from "../lib/format";
import { useStore } from "../state/store";

interface ParamRowProps {
  def: NumericParamDef;
  /** severity if a current warning implicates this param */
  warnSeverity?: "caution" | "alarm";
  /** warning limit value to mark on the track, in param units */
  warnLimit?: number;
}

export function ParamRow({ def, warnSeverity, warnLimit }: ParamRowProps): React.JSX.Element {
  const value = useStore((s) => s.params[def.key] as number);
  const setParam = useStore((s) => s.setParam);
  const resetParam = useStore((s) => s.resetParam);
  const [editing, setEditing] = useState<string | null>(null);
  const sliderRef = useRef<HTMLInputElement | null>(null);

  const span = def.max - def.min;
  const step = span / 200;
  const frac = Math.min(1, Math.max(0, (value - def.min) / span));
  const defaultFrac = (def.defaultValue - def.min) / span;
  const warnFrac =
    warnLimit !== undefined ? Math.min(1, Math.max(0, (warnLimit - def.min) / span)) : null;

  const commit = (raw: string): void => {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setParam(def.key, Math.min(def.max, Math.max(def.min, parsed)) as SimParams[typeof def.key]);
    }
    setEditing(null);
  };

  // arrow keys: step = span/200, shift ×10 (§8.6)
  useEffect(() => {
    const el = sliderRef.current;
    if (el === null) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (!e.shiftKey) {
        return;
      }
      let dir = 0;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        dir = 1;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        dir = -1;
      } else {
        return;
      }
      e.preventDefault();
      const current = useStore.getState().params[def.key] as number;
      const next = Math.min(def.max, Math.max(def.min, current + dir * step * 10));
      setParam(def.key, next as SimParams[typeof def.key]);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [def.key, def.min, def.max, step, setParam]);

  return (
    <div className={`param-row ${warnSeverity ?? ""}`}>
      <div className="param-row-top">
        <label className="param-label" htmlFor={`p-${def.key}`} title={def.description}>
          {def.key}
        </label>
        <span className="param-value">
          {editing !== null ? (
            <input
              className="param-input num"
              inputMode="decimal"
              autoFocus
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commit((e.target as HTMLInputElement).value);
                } else if (e.key === "Escape") {
                  setEditing(null);
                }
              }}
            />
          ) : (
            <button
              className="param-input num"
              onClick={() => setEditing(formatInputValue(value))}
              aria-label={`Edit ${def.key}`}
            >
              {formatInputValue(value)}
            </button>
          )}
          <span className="unit">{def.unit === "1" ? "" : def.unit}</span>
        </span>
      </div>
      <div className="param-track">
        <input
          ref={sliderRef}
          id={`p-${def.key}`}
          type="range"
          min={def.min}
          max={def.max}
          step={step}
          value={value}
          aria-label={def.description}
          style={{
            background: `linear-gradient(to right, var(--melt) ${frac * 100}%, var(--line) ${frac * 100}%)`
          }}
          onChange={(e) => setParam(def.key, Number(e.target.value) as SimParams[typeof def.key])}
          onDoubleClick={() => resetParam(def.key)}
        />
        <span className="param-tick default" style={{ left: `${defaultFrac * 100}%` }} title="default" />
        {warnFrac !== null && (
          <span
            className={`param-tick limit ${warnSeverity ?? "caution"}`}
            style={{ left: `${warnFrac * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
