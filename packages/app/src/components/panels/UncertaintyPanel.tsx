import { sampleUncertainty, simulate } from "@selene-isru/engine";
import type { SimParams, UncertaintySpec } from "@selene-isru/engine";
import { useMemo, useState } from "react";
import { bandsCsv, sensitivityCsv } from "../../analysis/panelExports";
import { oneAtATimeSensitivity } from "../../analysis/sensitivity";
import { ExportButton } from "./ExportButton";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";
import { appliesToCase, ilmeniteGradeKey } from "../../analysis/sweep";
import { processScope, useScopedState } from "../../lib/hooks";

/** Fixed so the bands are reproducible; the CSV export records both. */
const BAND_SAMPLES = 256;
const BAND_SEED = 2026;

type SensitivityMetric = "mass-throughput" | "sec" | "missions" | "mass";

interface UncertaintyOption {
  key: keyof SimParams;
  label: string;
  rel: number;
  site?: SimParams["site"];
  /** restrict to one equatorial oxygen process; omit = either */
  process?: SimParams["equatorialProcess"];
  /** restrict to one ilmenite feedstock; omit = either */
  feed?: SimParams["ilmFeed"];
}

const OPTIONS: UncertaintyOption[] = [
  { key: "targetKgPerDay", label: "Product target", rel: 0.1 },
  { key: "eMining", label: "Mining energy", rel: 0.3 },
  { key: "reserveDays", label: "Reserve duration", rel: 0.1 },
  { key: "Nmli", label: "MLI construction", rel: 0.15 },
  { key: "etaCell", label: "PV efficiency", rel: 0.08 },
  { key: "alphaSpecific", label: "Nuclear specific mass", rel: 0.2 },
  { key: "Vcell", label: "MRE cell voltage", rel: 0.08, site: "equatorial", process: "mre" },
  { key: "etaCurrent", label: "MRE current efficiency", rel: 0.12, site: "equatorial", process: "mre" },
  { key: "xO2", label: "Regolith O₂ fraction", rel: 0.12, site: "equatorial", process: "mre" },
  { key: "kReactorMass", label: "Reactor mass factor", rel: 0.2, site: "equatorial", process: "mre" },
  { key: "fIlmenite", label: "Ilmenite in soil", rel: 0.3, site: "equatorial", process: "ilmenite", feed: "soil" },
  { key: "fIlmBasalt", label: "Ilmenite in basalt", rel: 0.3, site: "equatorial", process: "ilmenite", feed: "basalt" },
  { key: "fIlmLiberated", label: "Ilmenite liberated by grinding", rel: 0.2, site: "equatorial", process: "ilmenite", feed: "basalt" },
  { key: "ilmConcentrateGrade", label: "Concentrate grade", rel: 0.3, site: "equatorial", process: "ilmenite" },
  { key: "tIlmResidenceH", label: "Reactor residence time", rel: 0.3, site: "equatorial", process: "ilmenite" },
  { key: "EaIlmReduction", label: "Reduction activation energy", rel: 0.3, site: "equatorial", process: "ilmenite" },
  { key: "eIlmBeneficiation", label: "Beneficiation energy", rel: 0.3, site: "equatorial", process: "ilmenite", feed: "soil" },
  { key: "eIlmComminution", label: "Crushing and grinding energy", rel: 0.3, site: "equatorial", process: "ilmenite", feed: "basalt" },
  { key: "chiIce", label: "Polar ice fraction", rel: 0.25, site: "polar" },
  { key: "cpRegCold", label: "Cold heat capacity", rel: 0.12, site: "polar" },
  { key: "rPore", label: "Representative pore radius", rel: 0.3, site: "polar" },
  { key: "overburdenRatio", label: "Overburden per kg mined", rel: 0.5, site: "polar" }
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
  const available = OPTIONS.filter((option) =>
    appliesToCase(option, params) &&
    // Superseded by the oxide-composition model while it is on.
    !(option.key === "xO2" && params.oxideModel)
  );
  const defaultKeys: Array<keyof SimParams> = params.site === "polar"
    ? ["targetKgPerDay", "chiIce", "cpRegCold"]
    : params.equatorialProcess === "ilmenite"
      ? ["targetKgPerDay", ilmeniteGradeKey(params), "ilmConcentrateGrade"]
      : ["targetKgPerDay", "etaCurrent", "Vcell"];
  // A selection made for one site or process resets to the new one's defaults.
  const [keys, setKeys] = useScopedState<Array<keyof SimParams>>(processScope(params), () => defaultKeys);
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
    () => sampleUncertainty(params, spec, { n: BAND_SAMPLES, seed: BAND_SEED }),
    [params, spec]
  );

  const sensitivity = useMemo(
    () =>
      oneAtATimeSensitivity(params, spec, (result) => metricValue(result, metric)).map((row) => ({
        ...row,
        label: available.find((candidate) => candidate.key === row.key)?.label ?? String(row.key)
      })),
    [available, metric, params, spec]
  );

  const maxDelta = Math.max(1, ...sensitivity.flatMap((row) => [Math.abs(row.low), Math.abs(row.high)]));
  const massEquivalent = bands.plantMassThroughputDays;
  const sec = bands.secTotal;
  const span = Math.max(1e-9, massEquivalent.p90 - massEquivalent.p10);
  const p50 = ((massEquivalent.p50 - massEquivalent.p10) / span) * 100;

  return (
    <div className="panel-section uncertainty-section">
      <div className="panel-header">
        ILLUSTRATIVE SENSITIVITY
        <span className="num">{BAND_SAMPLES} DETERMINISTIC RUNS</span>
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
            <span>
              {index + 1}. {row.label}
              {row.capped && (
                <small
                  className="sensitivity-capped"
                  title={`Requested ±${(row.rel * 100).toFixed(0)}% reaches past the engine range; simulated ${row.lowInput.toPrecision(3)} to ${row.highInput.toPrecision(3)}.`}
                >
                  {" "}· CAPPED
                </small>
              )}
            </span>
            <div className="sensitivity-track">
              <i className="low" style={{ width: `${(Math.abs(row.low) / maxDelta) * 50}%` }} />
              <b />
              <i className="high" style={{ width: `${(Math.abs(row.high) / maxDelta) * 50}%` }} />
            </div>
            <strong>{row.low.toFixed(1)}% / {row.high >= 0 ? "+" : ""}{row.high.toFixed(1)}%</strong>
          </div>
        ))}
      </div>
      <div className="panel-exports">
        <ExportButton label="RANKING CSV" what="sensitivity-ranking" build={() => sensitivityCsv(sensitivity, metric)} />
        <ExportButton label="BANDS CSV" what="uncertainty-bands" build={() => bandsCsv(bands, spec, BAND_SAMPLES, BAND_SEED)} />
      </div>
      <p className="panel-caption">
        Deterministic sampled bands combine the selected input spreads. They are illustrative model sensitivity, not calibrated uncertainty or empirical confidence.
      </p>
    </div>
  );
}
