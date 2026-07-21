import { useStore } from "../state/store";

export function AboutModal(): React.JSX.Element | null {
  const open = useStore((s) => s.ui.aboutOpen);
  const setUi = useStore((s) => s.setUi);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-scrim" onClick={() => setUi({ aboutOpen: false })}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="About selene-isru"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slideover-head">
          <span className="panel-header">ABOUT SELENE-ISRU</span>
          <button className="slideover-close" aria-label="Close" onClick={() => setUi({ aboutOpen: false })}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p>
            <strong>selene-isru</strong> is an open-source engineering trade-space simulator for a
            conceptual integrated lunar in-situ resource utilization chain. Move a slider and the entire
            industrial chain — excavation, molten-regolith electrolysis or polar ice sublimation,
            cryogenic storage, surface power, Earth logistics — recomputes in the same frame, in
            your browser, with no server.
          </p>
          <p className="modal-badge mono">
            ✓ INDEPENDENT IMPLEMENTATIONS PARITY-TESTED TS ↔ PYTHON IN CI · 200 LATIN-HYPERCUBE VECTORS ·
            REL-TOL 1e-9
          </p>
          <p className="modal-badge mono">
            ✓ HYBRID THREE.JS + REPRODUCIBLE BLENDER ASSETS · GENERATED PBR MAPS + IBL
          </p>
          <p>
            The 3D scene uses a hybrid procedural/Blender pipeline. Regolith textures, star fields,
            Earth, terrain, lighting, and effects are generated from code; the MRE reactor is an
            original, reproducibly generated Blender asset with an optimized GLB runtime export.
          </p>
          <h3>Model caveats</h3>
          <p className="model-boundary-callout">
            <strong>Conceptual systems tool — not a flight, hardware, safety, cost, or mission-readiness model.</strong>
            Results support comparative trade exploration inside the implemented boundary. Numerical parity
            between two implementations is not experimental or physical validation.
          </p>
          <ul>
            <li>
              <strong>The χ_ice anchor:</strong> the often-quoted “10.7 kWh/kg of water at χ≈5%
              ice” actually corresponds to χ=0.005 (0.5%); at the default χ=0.05 the sublimation
              chain costs ≈1.78 kWh/kg. The formula is correct — the folklore number is the
              outlier. The regression suite pins both points.
            </li>
            <li>
              MRE now separates reversible decomposition, activation, ohmic, concentration, and
              unallocated voltage terms and sizes electrode area from current density. These remain
              lumped, bounded approximations—not geometry-, bubble-, material-, or lifetime-resolved reactor design.
            </li>
            <li>
              Sabatier is a single-pass conversion-fraction model with explicit CO₂ import, water
              recycle, unreacted H₂, and node-level mass balances. Water, O₂, residual H₂, CH₄, and
              imported CO₂ receive independent reserve, volume, conditioning, heat-leak, mass, and loss ledgers.
            </li>
            <li>
              The Lockheed-style MLI correlation retains the v0.1 calibrated layers/mm convention.
              NASA examples report layers/cm; absolute heat leak remains benchmark-pending until a
              coefficient/unit pair is independently reproduced.
            </li>
            <li>
              Polar power accepts deterministic JSON/CSV illumination, receiver-visibility, and
              surface-temperature profiles. Imported traces are user evidence; the app does not certify their site provenance.
            </li>
            <li>
              Material and declared process-energy nodes expose conservation residuals. The energy
              ledger is an explicit model boundary—not a complete fuel-cycle, exergy, transient, or thermal-network solution.
            </li>
          </ul>
          <p>
            Every implemented equation lives twice — once in TypeScript and once in Python — and CI
            fails if they disagree across 200 sampled scenarios. External benchmark tests are kept
            separately so implementation parity cannot be mistaken for physical validation.
          </p>
          <p>
            <a href="https://github.com/dogum/selene-isru" target="_blank" rel="noreferrer">
              Source on GitHub ↗
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
