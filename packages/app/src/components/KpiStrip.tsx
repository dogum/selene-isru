import type { SimResult } from "@selene-isru/engine";
import { useStore } from "../state/store";
import { Qty } from "./Qty";

interface KpiDef {
  label: string;
  unit: string;
  color: string;
  value: (r: SimResult) => number;
  sig?: number;
}

const KPIS: KpiDef[] = [
  { label: "SEC TOTAL", unit: "kWh/kg", color: "var(--melt)", value: (r) => r.energy.secTotal_kWhPerKg, sig: 4 },
  { label: "GRID POWER", unit: "W", color: "var(--melt)", value: (r) => r.energy.gridPowerW },
  { label: "MISSIONS", unit: "", color: "var(--regolith)", value: (r) => r.logistics.nMissions },
  { label: "PAYBACK", unit: "days", color: "var(--regolith)", value: (r) => r.logistics.paybackDays },
  { label: "LEVERAGE L", unit: "×", color: "var(--regolith)", value: (r) => r.logistics.leverageL },
  { label: "OUTPUT", unit: "kg/day", color: "var(--cryo)", value: (r) => r.production.targetKgPerDay, sig: 4 }
];

export function KpiCells({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const result = useStore((s) => s.result);
  const archColor = result.power.architecture === "solar" ? "var(--solar)" : "var(--fission)";
  return (
    <>
      {KPIS.map((k) => (
        <div className={`kpi ${compact ? "compact" : ""}`} key={k.label}>
          <div className="kpi-value">
            <Qty value={k.value(result)} unit={k.unit} sig={k.sig ?? 3} animate />
          </div>
          <div
            className="kpi-label"
            style={{ borderColor: k.label === "GRID POWER" ? archColor : k.color }}
          >
            {k.label}
          </div>
        </div>
      ))}
    </>
  );
}

export function KpiStrip(): React.JSX.Element {
  const warnings = useStore((s) => s.result.warnings);
  const dockOpen = useStore((s) => s.ui.dockOpen);
  const setUi = useStore((s) => s.setUi);
  const real = warnings.filter((w) => w.id !== "param-clamped");
  const clamped = warnings.length - real.length;
  const count = real.length + (clamped > 0 ? 1 : 0);
  const anyAlarm = real.some((w) => w.severity === "alarm");

  return (
    <footer className="kpi-strip">
      <div className="kpi-cells">
        <KpiCells />
      </div>
      <button
        className={`warn-pill ${anyAlarm ? "alarm" : count > 0 ? "caution" : "clear"}`}
        aria-pressed={dockOpen}
        onClick={() => setUi({ dockOpen: !dockOpen })}
      >
        ⚠ {count}
      </button>
    </footer>
  );
}
