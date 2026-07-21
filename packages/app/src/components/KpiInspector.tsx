import { formatQtyText } from "../lib/format";
import { useStore, type KpiKey } from "../state/store";

interface KpiExplanation {
  title: string;
  equation: string;
  substitution: string;
  maturity: string;
  caveat: string;
}

export function KpiInspector(): React.JSX.Element | null {
  const selected = useStore((state) => state.ui.selectedKpi);
  const params = useStore((state) => state.params);
  const result = useStore((state) => state.result);
  const setUi = useStore((state) => state.setUi);

  if (selected === null) {
    return null;
  }

  const explanation = explainKpi(selected, params, result);
  const alarmCount = result.warnings.filter((warning) => warning.severity === "alarm").length;

  return (
    <aside className="kpi-inspector" role="dialog" aria-label={`Why this number: ${explanation.title}`}>
      <div className="kpi-inspector-head">
        <div>
          <span className="reactor-eyebrow">WHY THIS NUMBER</span>
          <h2>{explanation.title}</h2>
        </div>
        <button type="button" aria-label="Close metric explanation" onClick={() => setUi({ selectedKpi: null })}>✕</button>
      </div>
      <div className="kpi-equation mono">{explanation.equation}</div>
      <p className="kpi-substitution mono">{explanation.substitution}</p>
      <dl>
        <div><dt>Model maturity</dt><dd>{explanation.maturity}</dd></div>
        <div><dt>Interpretation limit</dt><dd>{explanation.caveat}</dd></div>
        <div>
          <dt>Constraint status</dt>
          <dd>{alarmCount === 0 ? "NO IMPLEMENTED CONSTRAINT VIOLATIONS" : `${alarmCount} IMPLEMENTED CONSTRAINT VIOLATION${alarmCount === 1 ? "" : "S"}`}</dd>
        </div>
      </dl>
      <small>Independent TypeScript/Python implementations are parity-tested; this is not a claim of physical validation.</small>
    </aside>
  );
}

function explainKpi(key: KpiKey, params: ReturnType<typeof useStore.getState>["params"], result: ReturnType<typeof useStore.getState>["result"]): KpiExplanation {
  switch (key) {
    case "sec":
      return {
        title: "Total specific energy",
        equation: "SEC = Σ process energy / primary product mass",
        substitution: result.energy.flows.map((flow) => `${flow.from}→${flow.to} ${formatQtyText(flow.kWhPerKg, "kWh/kg", 4)}`).join(" + "),
        maturity: "System-level analytical estimate",
        caveat: `Steady-state only. ${result.energy.balances.length} declared process-energy nodes close to ${formatQtyText(result.energy.maxAbsResidualW, "W", 4)} residual; polar sublimation remains a thermodynamic lower-bound chain.`
      };
    case "power":
      return {
        title: "Continuous grid power",
        equation: "P = target × SEC × 3.6 MJ/kWh ÷ 86,400 s/day",
        substitution: `${formatQtyText(params.targetKgPerDay, "kg/day")} × ${formatQtyText(result.energy.secTotal_kWhPerKg, "kWh/kg", 4)} = ${formatQtyText(result.energy.gridPowerW, "W")}`,
        maturity: "Derived from active process SEC",
        caveat: "Excludes startup, transient duty cycles, redundancy, and availability margins."
      };
    case "missions":
      return {
        title: "Landed mission count",
        equation: "missions = ceil(plant mass / (packing factor × payload per mission))",
        substitution: `ceil(${formatQtyText(result.logistics.totalInfraMassKg, "kg")} / (${params.etaPack.toFixed(2)} × ${formatQtyText(result.logistics.payloadPerMissionKg, "kg")})) = ${result.logistics.nMissions}`,
        maturity: "Ideal rocket-equation logistics proxy",
        caveat: "Does not schedule manifests, volume, center of gravity, spares, or partial-flight constraints."
      };
    case "mass-throughput":
      return {
        title: "Plant-mass throughput equivalent",
        equation: "equivalent days = landed plant mass / daily product throughput",
        substitution: `${formatQtyText(result.logistics.totalInfraMassKg, "kg")} / ${formatQtyText(params.targetKgPerDay, "kg/day")} = ${formatQtyText(result.logistics.plantMassThroughputDays, "days")}`,
        maturity: "Derived sizing proxy",
        caveat: "This is not financial, energy, schedule, or lifecycle payback."
      };
    case "leverage":
      return {
        title: "Mass leverage",
        equation: "L = annual product × mission years × gear ratio / landed plant mass",
        substitution: `${formatQtyText(params.targetKgPerDay * 365, "kg/yr")} × ${params.missionYears.toFixed(1)} yr × ${params.gearRatio.toFixed(2)} / ${formatQtyText(result.logistics.totalInfraMassKg, "kg")}`,
        maturity: "Derived campaign proxy",
        caveat: "Assumes constant production and does not include replacements, downtime, or reliability."
      };
    case "output":
      return {
        title: "Primary product target",
        equation: "output = user-defined mission target",
        substitution: formatQtyText(result.production.targetKgPerDay, "kg/day"),
        maturity: "Causal mission input",
        caveat: `${result.cryo.inventories.length} independently sized storage ${result.cryo.inventories.length === 1 ? "inventory is" : "inventories are"} active: ${result.cryo.inventories.map((item) => item.stream).join(", ")}.`
      };
  }
}
