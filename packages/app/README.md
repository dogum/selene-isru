# @selene-isru/app

React + Three.js frontend for the selene-isru trade-space simulator.

- `src/state/store.ts` — zustand store; `setParam` → synchronous `simulate()`
  → result fan-out to React and the 3D viewer; URL sync (500 ms throttled
  `replaceState`).
- `src/viewer/Viewer.ts` — vanilla Three.js class owning renderer, scene,
  camera and the render-on-demand loop. React mounts it via ref and calls
  `apply(result, params)`, `flyTo(pose)`, `focusAsset(key, severity)`.
- `src/viewer/bindings.ts` — the table-driven `SimResult` → scene-parameter
  contract (clamped/log-scaled mappings, camera poses, quality profiles).
  Unit-tested in `test/bindings.test.ts`.
- `src/viewer/dioramas/` — equatorial and polar sites built exclusively from
  Three.js primitives and `InstancedMesh` (no models, no textures).
- `src/components/` — control rail auto-generated from `PARAM_META` (curated
  by `src/controls/manifest.ts`), KPI strip, warnings dock, and the
  ENERGY / MASS / POWER slide-over panels (d3-sankey + hand-rolled SVG).
- Mobile (<1100 px) is a first-class stage + bottom-sheet layout with
  subsystem chips and a hand-rolled drag/snap sheet.

```bash
pnpm --filter @selene-isru/app dev      # dev server
pnpm --filter @selene-isru/app test     # vitest smoke suite
pnpm --filter @selene-isru/app build    # typecheck + production build
```

The production build sets `base` from `PAGES_BASE` (the Pages deploy job
passes `/<repo-name>/`).
