import { formatQtyText } from "../lib/format";
import { useStore } from "../state/store";

export function ConservationInspector(): React.JSX.Element | null {
  const open = useStore((state) => state.ui.conservationOpen);
  const result = useStore((state) => state.result);
  const setUi = useStore((state) => state.setUi);
  if (!open) return null;
  const balanced = result.materials.maxAbsResidualKgPerDay <= 1e-6 && result.energy.maxAbsResidualW <= 1e-6;

  return (
    <div className="model-modal-backdrop" onMouseDown={() => setUi({ conservationOpen: false })}>
      <section className="conservation-inspector" role="dialog" aria-modal="true" aria-label="Conservation and inventory inspector" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="reactor-eyebrow">CONSERVATION INSPECTOR</span>
            <h2>Process ledgers and stored inventories</h2>
            <p>Every displayed residual uses the same TypeScript engine state driving the simulator.</p>
          </div>
          <div className={balanced ? "conservation-status" : "conservation-status alarm"}>{balanced ? "BALANCED" : "RESIDUAL ACTIVE"}</div>
          <button type="button" aria-label="Close conservation inspector" onClick={() => setUi({ conservationOpen: false })}>✕</button>
        </header>

        <section>
          <h3>Independent storage inventories</h3>
          <div className="model-table-wrap">
            <table>
              <thead><tr><th>Stream</th><th>Role</th><th>Rate</th><th>Reserve</th><th>Volume</th><th>Conditioning</th><th>Actual loss</th></tr></thead>
              <tbody>{result.cryo.inventories.map((item) => (
                <tr key={item.id}>
                  <th>{item.stream}</th><td>{item.role}</td><td>{formatQtyText(item.rateKgPerDay, "kg/day")}</td>
                  <td>{formatQtyText(item.reserveInventoryKg, "kg")}</td><td>{formatQtyText(item.volumeM3, "m³", 4)}</td>
                  <td>{formatQtyText(item.conditioningPowerW, "W")}</td><td>{formatQtyText(item.actualLossKgPerDay, "kg/day", 4)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section>
          <h3>Material-node conservation</h3>
          <div className="model-table-wrap"><table>
            <thead><tr><th>Node</th><th>In</th><th>Out</th><th>Residual</th></tr></thead>
            <tbody>{result.materials.balances.map((item) => (
              <tr key={item.id}><th>{item.label}</th><td>{formatQtyText(item.massInKgPerDay, "kg/day")}</td><td>{formatQtyText(item.massOutKgPerDay, "kg/day")}</td><td>{formatQtyText(item.residualKgPerDay, "kg/day", 4)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>

        <section>
          <h3>Energy-node conservation</h3>
          <div className="model-table-wrap"><table>
            <thead><tr><th>Node</th><th>Electrical</th><th>Coupled input</th><th>Useful</th><th>Rejected</th><th>Accumulation</th><th>Residual</th></tr></thead>
            <tbody>{result.energy.balances.map((item) => (
              <tr key={item.id}>
                <th>{item.label}</th><td>{formatQtyText(item.electricalInputW, "W")}</td><td>{formatQtyText(item.coupledInputW, "W")}</td>
                <td>{formatQtyText(item.usefulOutputW, "W")}</td><td>{formatQtyText(item.rejectedHeatW, "W")}</td>
                <td>{formatQtyText(item.accumulationW, "W")}</td><td>{formatQtyText(item.residualW, "W", 4)}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="model-inspector-note">Grid allocation residual: {formatQtyText(result.energy.gridAllocationResidualW, "W", 4)}. This ledger conserves the model’s declared electrical, coupled-heat, useful-duty, rejected-heat, and accumulation boundaries; it is not a full exergy model.</p>
        </section>
      </section>
    </div>
  );
}
