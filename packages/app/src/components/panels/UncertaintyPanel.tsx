import { sampleUncertainty, simulate } from "@selene-isru/engine";
import type { SimParams, UncertaintySpec } from "@selene-isru/engine";
import { useMemo, useState } from "react";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";

type SensitivityMetric = "mass-throughput" | "sec" | "missions" | "mass";

interface UncertaintyOption {
  key: keyof SimParams;
  label: string;
  rel: number;
  site?: SimParams["site"];
}

const OPTIONS: UncertaintyOption[] = [
  { key: "targetKgPerDay", label: "Product target", rel: 0.1 },
  { key: "eMining", label: "Mining energy", rel: 0.2 },
  { key: "reserveDays", label: "Reserve duration", rel: 0.1 },
  { key: "Nmli", label: "MLI construction", rel: 0.15 },
  { key: "etaCell", label: "PV efficiency", rel: 0.08 },
  { key: "alphaSpecific", label: "Nuclear specific mass", rel: 0.2 },
  { key: "Vcell", label: "MRE cell voltage", rel: 0.08, site: "equatorial" },
  { key: "etaCurrent", label: "MRE current efficiency", rel: 0.12, site: "equatorial" },
  { key: "xO2", label: "Regolith O₂ fraction", rel: 0.12, site: "equatorial" },
  { key: "kReactorMass", label: "Reactor mass factor", rel: 0.2, site: "equatorial" },
  { key: "chiIce", label: "Polar ice fraction", rel: 0.25, site: "polar" },
  { key: "cpRegCold", label: "Cold heat capacity", rel: 0.12, site: "polar" },
  { key: "rPore", label: "Representative pore radius", rel: 0.3, site: "polar" }
];

function toggle(list: Array<keyof SimParams>, key: keyof SimParams): Array<keyof SimParams> {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

function metricValue(result: ReturnType<typeof simulate>, metric: SensitivityMetric): number {
  switch (metric) {
    case "sec": return result.energy.secTotal_kWhPerKg;
    case "missions": return result.logistics.nMissions;
    case "mass": return result.logistics.totalInfraMassKg;
    default: return result.logistics.plantMassThroughputDays;
  }
}

export function UncertaintyPanel(): React.JSX.Element {
  const params = useStore((s) => s.params);
  const available = OPTIONS.filter((option) => option.site === undefined || option.site === params.site);
  const defaultKeys: Array<keyof SimParams> = params.site === "polar"
    ? ["targetKgPerDay", "chiIce", "eMining"]
    : ["targetKgPerDay", "etaCurrent", "Vcell"];
  const [keys, setKeys] = useState<Array<keyof SimParams>>(defaultKeys);
  const [sigma, setSigma] = useState(0.1);
  const [evidenceDefaults, setEvidenceDefaults] = useState(true);
  const [metric, setMetric] = useState<SensitivityMetric>("mass-throughput");

  const spec = useMemo<UncertaintySpec[]>(() =>
    keys
      .map((key) => available.find((option) => option.key === key))
      .filter((option): option is UncertaintyOption => option !== undefined)
      .map((option) => ({ key: option.key, rel: evidenceDefaults ? option.rel : sigma })),
  [available, evidenceDefaults, keys, sigma]);

  const bands = useMemo(
    () => sampleUncertainty(params, spec, { n: 256, seed: 2026 }),
    [params, spec]
  );

  const sensitivity = useMemo(() => {
    const base = simulate(params);
    const baseValue = Math.max(1e-12, Math.abs(metricValue(base, metric)));
    return spec
      .map((item) => {
        const value = params[item.key];
        if (typeof value !== "number") {
          return null;
        }
        const low = simulate({ ...params, [item.key]: value * (1 - item.rel) });
        const high = simulate({ ...params, [item.key]: value * (1 + item.rel) });
        const lowDelta = ((metricValue(low, metric) - metricValue(base, metric)) / baseValue) * 100;
        const highDelta = ((metricValue(high, metric) - metricValue(base, metric)) / baseValue) * 100;
        const option = available.find((candidate) => candidate.key === item.key);
        return {
          key: item.key,
          label: option?.label ?? String(item.key),
          rel: item.rel,
          low: lowDelta,
          high: highDelta,
          swing: Math.abs(highDelta - lowDelta)
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.swing - a.swing);
  }, [available, metric, params, spec]);

  const maxDelta = Math.max(1, ...sensitivity.flatMap((row) => [Math.abs(row.low), Math.abs(row.high)]));
  const massEquivalent = bands.plantMassThroughputDays;
  const sec = bands.secTotal;
  const span = Math.max(1e-9, massEquivalent.p90 - massEquivalent.p10);
  const p50 = ((massEquivalent.p50 - massEquivalent.p10) / span) * 100;

  return (
    <div className="panel-section uncertainty-section">
      <div className="panel-header">
        ILLUSTRATIVE SENSITIVITY
        <span className="num">256 DETERMINISTIC RUNS</span>
      </div>
      <div className="uncertainty-mode-row">
        <button type="button" className={evidenceDefaults ? "active" : ""} onClick={() => setEvidenceDefaults(true)}>
          EVIDENCE-INFORMED SPREADS
        </button>
        <button type="button" className={!evidenceDefaults ? "active" : ""} onClick={() => setEvidenceDefaults(false)}>
          UNIFORM INPUT SPREAD
        </button>
        {!evidenceDefaults && (
          <label>
            σ {(sigma * 100).toFixed(0)}%
            <input type="range" min={0.02} max={0.35} step={0.01} value={sigma} onChange={(event) => setSigma(Number(event.target.value))} />
          </label>
        )}
      </div>
      <div className="uncertainty-controls mono">
        {available.map((option) => (
          <label key={option.key}>
            <input
              type="checkbox"
              checked={keys.includes(option.key)}
              onChange={() => setKeys((current) => toggle(current, option.key))}
            />
            <span>{option.label}</span>
            <small>±{((evidenceDefaults ? option.rel : sigma) * 100).toFixed(0)}%</small>
          </label>
        ))}
      </div>

      <div className="chart-well uncertainty-well">
        <div className="uncertainty-band"><span style={{ left: `${p50}%` }} /></div>
        <div className="uncertainty-values mono">
          <span>MASS EQUIV. P10 {formatQtyText(massEquivalent.p10, "days")}</span>
          <span>P50 {formatQtyText(massEquivalent.p50, "days")}</span>
          <span>P90 {formatQtyText(massEquivalent.p90, "days")}</span>
        </div>
        <div className="uncertainty-values mono">
          <span>SEC P10 {formatQtyText(sec.p10, "kWh/kg", 4)}</span>
          <span>P50 {formatQtyText(sec.p50, "kWh/kg", 4)}</span>
          <span>P90 {formatQtyText(sec.p90, "kWh/kg", 4)}</span>
        </div>
        <div className="uncertainty-values mono">
          <span>MISSIONS P10 {bands.nMissions.p10.toFixed(0)}</span>
          <span>P50 {bands.nMissions.p50.toFixed(0)}</span>
          <span>P90 {bands.nMissions.p90.toFixed(0)}</span>
        </div>
      </div>

      <div className="sensitivity-head">
        <div>
          <span className="reactor-section-title">ONE-AT-A-TIME SENSITIVITY RANKING</span>
          <small>Percent response at each selected illustrative input bound</small>
        </div>
        <select value={metric} onChange={(event) => setMetric(event.target.value as SensitivityMetric)} aria-label="Sensitivity output metric">
          <option value="mass-throughput">Plant-mass throughput equivalent</option>
          <option value="sec">Specific energy</option>
          <option value="missions">Missions</option>
          <option value="mass">Infrastructure mass</option>
        </select>
      </div>
      <div className="sensitivity-ranking">
        {sensitivity.map((row, index) => (
          <div key={row.key}>
            <span>{index + 1}. {row.label}</span>
            <div className="sensitivity-track">
              <i className="low" style={{ width: `${(Math.abs(row.low) / maxDelta) * 50}%` }} />
              <b />
              <i className="high" style={{ width: `${(Math.abs(row.high) / maxDelta) * 50}%` }} />
            </div>
            <strong>{row.low.toFixed(1)}% / {row.high >= 0 ? "+" : ""}{row.high.toFixed(1)}%</strong>
          </div>
        ))}
      </div>
      <p className="panel-caption">
        Deterministic sampled bands combine the selected input spreads. They are illustrative model sensitivity, not calibrated uncertainty or empirical confidence.
      </p>
    </div>
  );
}
