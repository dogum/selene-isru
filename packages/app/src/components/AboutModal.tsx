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
            self-sustaining lunar in-situ resource utilization chain. Move a slider and the entire
            industrial chain — excavation, molten-regolith electrolysis or polar ice sublimation,
            cryogenic storage, surface power, Earth logistics — recomputes in the same frame, in
            your browser, with no server.
          </p>
          <p className="modal-badge mono">
            ✓ PHYSICS CROSS-VALIDATED TS ↔ PYTHON IN CI · 200 LATIN-HYPERCUBE GOLDEN VECTORS ·
            REL-TOL 1e-9
          </p>
          <p className="modal-badge mono">
            ✓ PROCEDURAL THREE.JS RENDER · GENERATED PBR MAPS + IBL · ZERO BINARY SCENE ASSETS
          </p>
          <p>
            The 3D scene is still asset-free: regolith textures, hardware roughness, star fields,
            Earth, bloom, contact occlusion, crater terrain, and beam effects are generated from
            code at runtime. No image maps, HDRs, models, or GLTF files are required to render the
            lunar scene.
          </p>
          <h3>Model caveats</h3>
          <ul>
            <li>
              <strong>The χ_ice anchor:</strong> the often-quoted “10.7 kWh/kg of water at χ≈5%
              ice” actually corresponds to χ=0.005 (0.5%); at the default χ=0.05 the sublimation
              chain costs ≈1.78 kWh/kg. The formula is correct — the folklore number is the
              outlier. The regression suite pins both points.
            </li>
            <li>
              Regolith heat capacity is held constant per regime (cold and melt averages) instead
              of a full Cp(T) polynomial; oxygen yield uses an aggregate x_O2 · f_extract rather
              than a per-oxide Gibbs matrix.
            </li>
            <li>
              Sabatier is a single-pass conversion-fraction model; the MLI correlation interprets
              layer density per millimetre internally to honor the published cryocooler anchors.
            </li>
            <li>
              Solar/nuclear break-even uses closed-form specific-mass slopes; the dynamic P_crit
              applies compounding array degradation, not a time-domain power sim.
            </li>
          </ul>
          <p>
            Every equation lives twice — once in TypeScript (this app&apos;s engine) and once in
            Python (the derivation notebook) — and CI fails if they ever disagree on any of 200
            sampled scenarios to one part in a billion.
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
