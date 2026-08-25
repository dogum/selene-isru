# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this project is

SELENE-ISRU is a **single-page, fully client-side engineering trade-space
simulator** for a conceptual lunar ISRU (In-Situ Resource Utilization) chain.
Change an input; the physics engine re-runs synchronously (well under a
millisecond) and the 3D diorama, energy Sankey, mass manifest, mission count,
and KPIs all re-render on the same frame. There is no server, no debounce, and
no worker thread — keep it that way.

It ships as a static site deployed to GitHub Pages from `main`
(<https://dogum.github.io/selene-isru/>).

**Model boundary (repeat it in docs and UI copy):** this is a conceptual
systems and comparative trade tool — not a flight, hardware, safety, cost, or
mission-readiness model. TypeScript/Python parity proves *implementation
agreement*, not physical validation. Never describe a result as validated
hardware performance.

## Repository layout

```
constants/constants.json     single source of truth: values, units, bounds, citations
packages/engine              TypeScript physics engine (zero runtime deps, pure ESM)
  src/constants.ts             GENERATED from constants.json — never hand-edit
  src/normalize.ts             clamps inputs to bounds, emits `param-clamped` warnings
  src/modules/*.ts             process models (electrolysis, excavation, power, cryo, …)
  src/site-design/             Custom Site: schema, catalog, connections, placement,
                               validate, evaluate (TS-only screening layer)
  scripts/gen-constants.ts     codegen + `--check` mode used by CI
  scripts/check-size.mjs       144 KiB budget on built JS output
  test/                        parity, conservation, regression, benchmarks, site-design
packages/app                 React 18 + Three.js frontend (Vite)
  src/state/store.ts           zustand store: setParam → simulate() → render + URL sync
  src/viewer/                  vanilla Three.js `Viewer` class (NO react-three-fiber)
    bindings.ts                  SimResult → scene-parameter contract (tested)
    post.ts                      EffectComposer: GTAO, bloom, SMAA, output
    textures.ts                  procedural PBR maps + PMREM environment
    dioramas/                    equatorial, polar, custom (dynamic planner) scenes
    assets/                      GLB-backed hero equipment wrappers
  src/components/              control rail, KPI strip, panels, mobile shell, site-design
  src/site-design/             draft persistence, editor operations, perf budgeting
  src/analysis/                causal trace, process helpers, study export
python/selene_isru            independent Python mirror of the same equations
python/tools/generate_golden.py  writes packages/engine/test/golden_vectors.json
assets/blender/              reproducible Blender/Python hero-asset generators + .blend
scripts/*.mjs                puppeteer-core capture scripts (screenshots, demos, evidence)
docs/                        specs, audits, release evidence, screenshots, media, examples
```

## Toolchain

Node 22, pnpm 10.33 (`packageManager` is pinned), Python 3.11 via
[uv](https://docs.astral.sh/uv/). pnpm workspace = `packages/*`.

```bash
pnpm install --frozen-lockfile
uv sync --project python --locked --group dev
```

## Commands

```bash
pnpm dev                # app dev server on http://localhost:5173
pnpm build              # engine build then app production build
pnpm test               # engine vitest then app vitest
pnpm run ci             # the full gate: golden + constants + pytest + ruff + tests + build
pnpm generate:golden    # regenerate golden vectors from the Python mirror
pnpm check:constants    # assert src/constants.ts matches constants/constants.json

uv run --project python pytest python/tests
uv run --project python ruff check python          # line-length 120, target py311
```

**Gotcha — build the engine before touching the app.** `packages/app` imports
`@selene-isru/engine` through its `dist/` exports. On a fresh clone,
`pnpm --filter @selene-isru/app test` (and `pnpm dev`) fail with *"Failed to
resolve entry for package @selene-isru/engine"* until you run:

```bash
pnpm --filter @selene-isru/engine build
```

CI orders it correctly (engine test → engine build → app test → app build);
root `pnpm test` does not, so build the engine first.

Capture scripts need a Chrome/Chromium binary; set `CHROME_PATH` if it is not
in a standard location. They drive a production preview
(`http://localhost:4173/selene-isru/`), not the dev server:

```bash
pnpm screenshots               # docs/screenshots against a dev server
pnpm smoke:custom -- <url>     # Custom Site browser workflow, writes nothing
pnpm evidence:custom -- <url>  # same workflow + regenerates screenshots/perf/demo
pnpm demo:cinematic -- <url> <out.mp4>
pnpm demo:custom-cinematic -- <url> <60s.mp4> <30s.mp4>
pnpm asset:mre | asset:equatorial | asset:polar   # require Blender on PATH
```

## The rules that matter

### 1. `constants/constants.json` is the single source of truth

Every shared value, unit, slider bound, description, and citation lives there.
Entries are `kind: "physical"` (→ `PHYSICAL_CONSTANTS`) or `kind: "parameter"`
(→ `PARAM_META` + `DEFAULTS`).

- `packages/engine/src/constants.ts` is **generated**. Its header says so.
  Edit the JSON and run `pnpm --filter @selene-isru/engine gen:constants`.
- `pnpm check:constants` fails CI if the generated file drifts.
- Python reads the same JSON through `python/selene_isru/constants.py`.

### 2. TypeScript and Python must stay numerically identical

Every core process equation exists twice: `packages/engine/src/modules/*.ts`
and `python/selene_isru/modules/*.py`. The two mirror each other closely —
`secSubJPerKg` ↔ `sec_sub_j_per_kg`, `simulateThermal` ↔ `simulate_thermal`,
camelCase result keys preserved on both sides.

`python/tools/generate_golden.py` Latin-hypercube samples the full parameter
box (200 points, seed 42, plus named corner scenarios) and writes
`packages/engine/test/golden_vectors.json` (209 vectors) plus
`dynamics_vectors.json`. `packages/engine/test/parity.test.ts` asserts the TS
engine reproduces **every numeric leaf to 1e-9 relative / 1e-12 absolute
tolerance**. CI regenerates from Python and runs `git diff --exit-code` on the
vector files — a one-sided model edit breaks the build.

So, for any model change:

1. Edit `constants/constants.json` if a shared value moved.
2. Update the TS module **and** the Python module together.
3. Run `pnpm generate:golden` and commit the regenerated vectors.
4. Deliberately update regression anchors in
   `packages/engine/test/regression.test.ts` / `python/tests/test_regression.py`
   and say why in the commit message.
5. Run `pnpm run ci`.

Conservation invariants, external analytical anchors
(`test/fixtures/external-benchmarks.json`), and model-depth tests are separate
from parity vectors — parity agreeing does not mean the physics is right.

### 3. The app never re-derives physics

`packages/app` consumes only the engine's public API: `simulate`,
`simulateTimeseries`, `evaluateSiteDesign`, `sampleUncertainty`, `DEFAULTS`,
`PARAM_META`, `PHYSICAL_CONSTANTS`, and the exported pure helpers (e.g.
`pCritKw`, `beamEfficiency`, `payloadPerMissionKg`, `oxideModelYield`). If a UI
component needs a number, add it to a `SimResult` field or export a pure helper
from the engine — do not re-implement an equation in a component.

Scene tuning is the one place with derived numbers, and it is centralized in
`packages/app/src/viewer/bindings.ts` (log/sqrt normalizations, clamps, instance
caps). Diorama code must call those helpers; no magic numbers in scene classes.

### 4. Engine constraints

- Zero runtime dependencies, pure ESM, strict TS (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`).
- `scripts/check-size.mjs` enforces a **144 KiB** comment/whitespace-stripped JS
  budget. The current build is ~144.5 KB of ~147.5 KB — there is very little
  headroom, so watch size when adding engine code.
- All internal units are SI. Field names carry units (`secElec_JPerKg`,
  `gridPowerW`, `regolithKgPerDay`); Sankey energy lines are exposed as
  `kWhPerKg`. Keep annotating units in JSDoc on result fields.
- Out-of-range inputs are clamped in `normalize.ts` with a `param-clamped`
  warning rather than throwing. `simulate()` should not throw on user input.
- `simulate()` must stay fast and synchronous — no async, no caching layers.

### 5. Custom Site (`site-design`) is a separate, disclosed layer

`packages/engine/src/site-design` is a **TypeScript-only** evaluation layer
around the shared process model. Its capacity and cable/haul route screening
equations are *not* Python-parity-validated and must never be presented as
such; they are disclosed in the planner UI and covered by dedicated
deterministic unit tests (`site-design-capacity.test.ts`,
`site-design-evaluation.test.ts`, `site-design.test.ts`).

When changing it:

- Preserve versioned parsing and canonical serialization (`schema.ts`, current
  document `version: 1`), or add an explicit migration.
- Keep catalog kind IDs and port IDs stable — exported designs reference them.
- State each new rating or distance effect's equation, units, evidence,
  maturity, and exclusions in the evaluator and in release docs.
- Add/refresh importable fixtures in `docs/examples/*.v1.json` (covered by
  `packages/app/test/custom-site-examples.test.ts`).
- Run `pnpm smoke:custom` against a production preview.
- Design Check must keep incomplete, dangling, or incompatible topology from
  reporting nominal output — planned vs. achievable output stays distinct.

Spec: [`docs/custom-site-sandbox-spec.md`](docs/custom-site-sandbox-spec.md).
Evidence: [`docs/custom-site-release.md`](docs/custom-site-release.md).

### 6. Frontend conventions

- **State**: a single zustand store (`src/state/store.ts`). `setParam` clamps
  through the engine, recomputes `SimResult`, and syncs the URL.
- **URL sharing**: only non-default params serialize into a compact query string
  (`?site=polar&chiIce=0.03`) and must round-trip to an identical `SimResult`
  (asserted in `packages/app/test/url.test.ts`).
- **Three.js is vanilla**, driven by the `Viewer` class — no react-three-fiber.
  React owns the DOM UI; `Scene.tsx` owns the canvas lifecycle.
- **Graphics tiers**: Auto/Low/Medium/High/Ultra, plus bloom, dev HUD, photo
  mode, PNG export (`src/lib/graphics.ts`). Detailed-model budgets degrade large
  custom layouts to selectable lightweight placeholders rather than dropping
  them.
- **Styling**: CSS custom properties in `src/styles/tokens.css`
  (`--bg-space`, `--cryo`, `--caution`, …). Use tokens, not literal hex.
- **Mobile** is deliberately review-only for Custom Site — select and inspect,
  no precision editing UI that the touch target cannot honor.
- **localStorage keys are versioned** and must be migrated, not silently broken:
  `selene-isru.study-scenarios.v2`, `selene-isru.custom-site-draft.v1`
  (+ `.backup`), `selene.graphics`.
- `window.__SELENE_DEMO__` (set up in `Scene.tsx`) is the capture bridge the
  `scripts/capture-*.mjs` demos drive. Changing it means re-recording the
  cinematics.
- App tsconfig is strict with `noUnusedLocals`/`noUnusedParameters`; the app
  build runs `tsc --noEmit` before `vite build`.

### 7. Explainability is a product requirement

Inputs expose plain engineering names *and* engine variable names, model
maturity, source links, illustrative spreads, range rationale, applicability,
and validity limits. New parameters need those fields populated in
`constants/constants.json` and surfaced through `src/controls/evidence.ts` /
`manifest.ts`. Numeric claims in Brief, Conserve, and Trade Study should be
traceable to the actual engine run, not to hard-coded copy.

### 8. Assets

Hero equipment is generated reproducibly from checked-in Blender/Python
(`assets/blender/*/generate_*.py`) and exported to optimized GLB in
`packages/app/src/assets/models/`. Terrain, regolith PBR, starfield, Earth, and
environment lighting stay procedural/seeded math at runtime. Every authored
asset needs its generator, editable `.blend`, optimized web asset, and an entry
in `assets/ASSET_LICENSES.md`.

## Testing map

| Concern | Where |
|---|---|
| TS↔Python parity | `packages/engine/test/parity.test.ts` + generated vectors |
| Mass/energy conservation | `conservation.test.ts`, `python/tests/test_conservation.py` |
| External analytical anchors | `external-benchmarks.test.ts` (+ JSON fixture) |
| Deliberate regression anchors | `regression.test.ts`, `test_regression.py` |
| v0.3 depth features | `model-depth.test.ts`, `test_model_depth.py` |
| Custom Site engine layer | `site-design*.test.ts` |
| Scene contract | `packages/app/test/bindings.test.ts` |
| Store, URL round-trip, export | `store.test.ts`, `url.test.ts`, `study-export.test.ts` |
| Custom Site UI/editor/perf | `custom-site-*.test.*` |

## CI and deploy

`.github/workflows/ci.yml` runs on every push and PR: pnpm install → uv sync →
pytest → regenerate golden vectors → `git diff --exit-code` on the vector files
→ `check:constants` → engine test → engine build → app test → app build → ruff.
The `deploy` job publishes `packages/app/dist` to GitHub Pages, but only on a
push to `main`, with `PAGES_BASE=/selene-isru/`.

Reproduce the gate locally with `pnpm run ci` before opening a PR.

## Working agreements

- Keep changes focused; explain the engineering or product motivation.
- Include screenshots for visible UI changes.
- Visible Custom Site changes: regenerate
  `docs/performance/custom-site-release.json`, the reference screenshots, and
  the short demo with `pnpm evidence:custom`.
- Capture-bridge or Custom Site storytelling changes: also regenerate the
  cinematics with `pnpm demo:custom-cinematic` (see
  [`docs/video-showcase.md`](docs/video-showcase.md)).
- Don't commit generated build output (`dist/`, `node_modules/`, `.venv/`);
  `.gitignore` already covers it. Golden vectors and GLB assets *are* tracked.
- Prefer editing existing docs in `docs/` over adding new ones; the audit trail
  (`model-audit-v02.md` → `model-depth-v03.md`) is intentionally historical —
  annotate superseded sections rather than rewriting history.

## Further reading

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — model-change guidance.
- [`docs/model-audit-v02.md`](docs/model-audit-v02.md) — original review snapshot.
- [`docs/model-depth-v03.md`](docs/model-depth-v03.md) — continuation items and
  remaining limits (polar profile import, energy ledgers, causal tracing).
- [`docs/custom-site-sandbox-spec.md`](docs/custom-site-sandbox-spec.md)
- [`docs/vertical-slice-mre.md`](docs/vertical-slice-mre.md),
  [`docs/equatorial-asset-overhaul.md`](docs/equatorial-asset-overhaul.md),
  [`docs/polar-asset-overhaul.md`](docs/polar-asset-overhaul.md),
  [`docs/analysis-polish-sprint.md`](docs/analysis-polish-sprint.md) — visual QA
  and performance notes.
