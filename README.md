# selene-isru

[![CI](https://github.com/dogum/selene-isru/actions/workflows/ci.yml/badge.svg)](https://github.com/dogum/selene-isru/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-4ade80.svg)](LICENSE)

A single-page, client-side engineering trade-space simulator for a
self-sustaining lunar ISRU chain. Move a slider; the entire lunar industrial
chain — 3D diorama, energy Sankey, mass manifest, mission count, payback
clock — recomputes and re-renders the same frame. No server, no debounce,
no workers: the physics engine runs in well under a millisecond.

The renderer uses a hybrid procedural/Blender pipeline. Lunar terrain, regolith
PBR maps, star fields, Earth, environment lighting, and effects are generated
from code at runtime. Hero equipment can be generated reproducibly from
checked-in Blender/Python source, exported as optimized GLB, and driven by live
simulator state. The equatorial site now uses this workflow for the MRE reactor,
excavation fleet, casting yard, cryogenic farm, power hub, landing system, and
surface habitat. The polar site uses the same workflow for its tracked ice
excavator, sublimation camp, beam receiver and Sabatier skid, cryogenic farm,
rim power towers, nuclear station, and occupied habitat.

**Live demo:** [dogum.github.io/selene-isru](https://dogum.github.io/selene-isru/)
(deployed from `main` by GitHub Actions).

## Two sites, one live engineering model

| Equatorial MRE industry | Shackleton ice industry |
|---|---|
| [![Equatorial lunar ISRU site with MRE reactor, excavation, power, landing, cryogenic, and habitat systems](docs/screenshots/equatorial-assets/base-overview-after-desktop.png)](https://dogum.github.io/selene-isru/) | [![Polar lunar ISRU site with ice excavation, beam receiver, Sabatier plant, cryogenics, power, and habitat systems](docs/screenshots/polar-assets/base-overview-after-desktop.png)](https://dogum.github.io/selene-isru/?site=polar) |
| Molten-regolith electrolysis, casting, surface power, and reusable logistics. | Ice excavation, sublimation, beamed power, Sabatier processing, and cryogenic storage. |

## Equipment that explains itself

Select a subsystem to focus the camera, inspect its live engineering state, and
tune the same model inputs that drive the full simulation. The interaction works
on desktop and as a touch-friendly inspector on mobile.

<p align="center">
  <img src="docs/screenshots/equatorial-assets/habitat-inspector-after-mobile.png" width="320" alt="Mobile inspector for the equatorial shielded habitat showing live shielding and pressure inputs">
  &nbsp;&nbsp;
  <img src="docs/screenshots/polar-assets/receiver-inspector-after-mobile.png" width="320" alt="Mobile inspector for the polar beam receiver and Sabatier plant showing live power and process inputs">
</p>

## Progressive learning and analysis

The default view stays simulator-first. Optional layers add explanation only
when they are useful:

- **Learn** projects clickable asset labels and leader lines into the 3D scene,
  adds a reset-camera control and readability lock, and can overlay live,
  directional material and power paths between equipment. Selecting one asset
  isolates its connected subsystem even when Learn is off.
- **Trade Study** stores up to eight named browser-local cases, pins four into a
  multi-case matrix, shares reproducible URLs, imports/exports JSON and CSV,
  searches a constrained 625-point Pareto grid, ranks local sensitivity, and
  produces a print/PDF-ready engineering report.
- **Brief** is an opt-in goal workflow for questions such as a polar water camp,
  minimum landed mass, or the solar/nuclear crossover. It performs a transparent
  bounded design search, ranks distinct feasible designs, and reports the
  bottleneck, largest drivers, uncertainty range, and caveats before handing an
  accepted case into Trade Study.
- Inputs use plain engineering names by default, can toggle to engine variable
  names, and expose model maturity, source links/sections, uncertainty defaults,
  range rationale, applicability, and validity limits beside the control.

## The parity story

Every equation lives twice:

- **TypeScript** (`packages/engine`) — the runtime engine the app calls on
  every input event. Zero dependencies, pure ESM, < 50 kB built.
- **Python** (`python/selene_isru`) — an independent mirror used for
  derivations, citations, and golden-vector generation.

`python/tools/generate_golden.py` Latin-hypercube samples **200 points**
across the full parameter box (plus named corner scenarios), runs the Python
engine, and writes `packages/engine/test/golden_vectors.json`. Vitest then
asserts that the TypeScript engine reproduces **every numeric leaf to 1e-9
relative tolerance**. CI regenerates the vectors from Python on every push —
a unilateral edit to either implementation breaks the build.

## Architecture

```
constants/constants.json ──── single source of truth (values, bounds, units, citations)
        │ codegen                       │ import
        ▼                               ▼
packages/engine (TS)  ◄── parity ──►  python/selene_isru
        │  simulate(params) → SimResult         │
        ▼                                       ▼
packages/app (React + Three.js)         notebooks / golden vectors
  ├─ state/store.ts    zustand: setParam → simulate() → render, URL sync
  ├─ viewer/           vanilla Three.js Viewer class (no react-three-fiber)
  │   ├─ bindings.ts   SimResult → scene contract + graphics tiers (§ tested)
  │   ├─ post.ts       EffectComposer chain: GTAO, bloom, SMAA, output
  │   ├─ textures.ts   generated PBR maps + PMREM environment
  │   └─ dioramas/     equatorial + polar hybrid mission scenes
  └─ components/       control rail, KPI strip, Sankey/Mass/Power panels
assets/blender/         reproducible hero-asset generators + editable .blend source
```

The app consumes **only** the engine's public API (`simulate`, `DEFAULTS`,
`PARAM_META`, and the exported pure helpers) — zero physics re-derivation in
UI code. The starfield, Earth, and terrain/textures remain seeded math; authored
hero equipment includes its generator, editable Blender source, optimized web
asset, and license entry in `assets/ASSET_LICENSES.md`.
The top-bar graphics menu exposes Auto/Low/Medium/High/Ultra tiers, bloom,
the dev HUD, photo mode, and PNG export.

Visual QA and performance notes are recorded in the [MRE vertical slice](docs/vertical-slice-mre.md), the [equatorial equipment overhaul](docs/equatorial-asset-overhaul.md), the [polar equipment overhaul](docs/polar-asset-overhaul.md), and the [analysis and explainability sprint](docs/analysis-polish-sprint.md).

## Workspace

- `constants/constants.json` — constants, defaults, slider bounds, units, citations.
- `packages/engine` — TS physics engine (frozen public API).
- `packages/app` — React + Three.js frontend (Vite, deployed to Pages).
- `assets/blender` — original Blender/Python source for reproducible 3D assets.
- `python/` — mirror package, pytest suite, derivation notebook, golden generator.
- `docs/screenshots/` — captured via `pnpm screenshots` against a dev server.

## Commands

```bash
pnpm install
pnpm dev                     # app dev server (http://localhost:5173)
pnpm test                    # engine + app vitest suites
pnpm build                   # engine build + app production build
pnpm asset:mre               # regenerate the MRE .blend and optimized GLB
pnpm asset:equatorial        # regenerate the remaining equatorial equipment library
pnpm asset:polar             # regenerate the polar equipment library
pnpm demo:analysis -- http://localhost:5173
                             # record the short engineering-analysis browser tour

# Python mirror (uv creates and manages the project environment)
uv sync --project python --locked --group dev
uv run --project python pytest python/tests
uv run --project python python python/tools/generate_golden.py
```

Run the complete parity, test, lint, and production-build pipeline with
`pnpm run ci`. See [CONTRIBUTING.md](CONTRIBUTING.md) for model-change guidance.

## Engine API

```ts
import { simulate, DEFAULTS, PARAM_META } from "@selene-isru/engine";

const result = simulate({ targetKgPerDay: 1000, site: "equatorial" });
```

All internal model units are SI. Energy Sankey lines are exposed as
`kWhPerKg`, and all out-of-range numeric inputs are clamped to
`constants/constants.json` bounds with a `param-clamped` warning.

Scenarios share via URL — non-default params serialize to a compact query
string (`?site=polar&chiIce=0.03`) that round-trips to an identical
`SimResult` (asserted in tests).
