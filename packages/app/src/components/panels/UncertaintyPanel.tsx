import { useMemo, useState } from "react";
import { sampleUncertainty } from "@selene-isru/engine";
import type { SimParams, UncertaintySpec } from "@selene-isru/engine";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";

const OPTIONS: Array<{ key: keyof SimParams; label: string }> = [
  { key: "targetKgPerDay", label: "Output" },
  { key: "etaCurrent", label: "Current eff." },
  { key: "Vcell", label: "Cell V" },
  { key: "chiIce", label: "Ice fraction" }
];

function toggle(list: Array<keyof SimParams>, key: keyof SimParams): Array<keyof SimParams> {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

export function UncertaintyPanel(): React.JSX.Element {
  const params = useStore((s) => s.params);
  const [keys, setKeys] = useState<Array<keyof SimParams>>(["targetKgPerDay", "etaCurrent"]);
  const [sigma, setSigma] = useState(0.1);
  const bands = useMemo(() => {
    const spec: UncertaintySpec[] = keys.map((key) => ({ key, rel: sigma }));
    return sampleUncertainty(params, spec, { n: 96, seed: 2026 });
  }, [params, keys, sigma]);
  const payback = bands.paybackDays;
  const sec = bands.secTotal;
  const span = Math.max(1e-9, payback.p90 - payback.p10);
  const p50 = ((payback.p50 - payback.p10) / span) * 100;

  return (
    <div className="panel-section uncertainty-section">
      <div className="panel-header">
        UNCERTAINTY BAND
        <span className="num">SIGMA {(sigma * 100).toFixed(0)}%</span>
      </div>
      <div className="uncertainty-controls mono">
        {OPTIONS.map((option) => (
          <label key={option.key}>
            <input
              type="checkbox"
              checked={keys.includes(option.key)}
              onChange={() => setKeys((current) => toggle(current, option.key))}
            />
            {option.label}
          </label>
        ))}
      </div>
      <div className="power-scrub">
        <label className="mono" htmlFor="uncertainty-sigma">
          SIGMA
        </label>
        <input
          id="uncertainty-sigma"
          type="range"
          min={0.02}
          max={0.25}
          step={0.01}
          value={sigma}
          aria-label="Uncertainty relative sigma"
          onChange={(e) => setSigma(Number(e.target.value))}
        />
      </div>
      <div className="chart-well uncertainty-well">
        <div className="uncertainty-band">
          <span style={{ left: `${p50}%` }} />
        </div>
        <div className="uncertainty-values mono">
          <span>P10 {formatQtyText(payback.p10, "days")}</span>
          <span>P50 {formatQtyText(payback.p50, "days")}</span>
          <span>P90 {formatQtyText(payback.p90, "days")}</span>
        </div>
        <div className="uncertainty-values mono">
          <span>SEC P10 {formatQtyText(sec.p10, "kWh/kg", 4)}</span>
          <span>SEC P50 {formatQtyText(sec.p50, "kWh/kg", 4)}</span>
          <span>SEC P90 {formatQtyText(sec.p90, "kWh/kg", 4)}</span>
        </div>
      </div>
    </div>
  );
}
