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
  scripts/check-size.mjs       144 KiB ratchet on built JS output (see below)
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
pnpm run ci             # local gate: golden + constants + pytest + ruff + tests + build
                        # (NOT identical to CI — see "CI and deploy")
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

All capture scripts need a Chrome/Chromium binary, and they split two ways:

- **Honour `CHROME_PATH`, target a production preview** (pass
  `http://localhost:4173/selene-isru/`): `capture-cinematic-demo.mjs`,
  `capture-custom-site-cinematic.mjs`, `capture-custom-site-evidence.mjs` —
  i.e. `demo:cinematic`, `demo:custom-cinematic`, `evidence:custom`,
  `smoke:custom`.
- **Ignore `CHROME_PATH`, target the dev server** (`http://localhost:5173` by
  default): `capture-screens.mjs` and `capture-analysis-demo.mjs` — i.e.
  `screenshots` and `demo:analysis`. Both hard-code
  `/Applications/Google Chrome.app/…` in a `CHROME` constant, so they fail
  before capturing anything on Linux, Windows, or a macOS install elsewhere.
  Edit that constant, or give them the same `process.env.CHROME_PATH` fallback
  the other three use.

**Video capture also needs `ffmpeg` and `ffprobe`**, which the Toolchain section
above does not install:

- `capture-custom-site-cinematic.mjs` honours `FFMPEG_PATH` / `FFPROBE_PATH`.
- `capture-cinematic-demo.mjs` and `capture-custom-site-evidence.mjs` invoke
  bare `ffmpeg`/`ffprobe`, so both must be on `PATH`.

`evidence:custom` reaches its video step **last** — a missing binary fails after
the screenshots and `docs/performance/custom-site-release.json` are already
written, leaving a half-regenerated evidence set. `smoke:custom` (`--verify-only`)
skips screenshots, perf JSON, and video entirely, so it needs no `ffmpeg`.

```bash
pnpm screenshots               # docs/screenshots against a dev server
pnpm smoke:custom -- <url>     # Custom Site browser workflow, writes nothing
pnpm evidence:custom -- <url>  # same workflow + regenerates screenshots/perf/demo
pnpm demo:cinematic -- <url> <out.mp4>
pnpm demo:custom-cinematic -- <url> <60s.mp4> <30s.mp4>
pnpm asset:mre                 # regenerate hero assets (each requires Blender on PATH)
pnpm asset:equatorial
pnpm asset:polar
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

### 3. The app must not re-derive physics

`packages/app` consumes only the engine's public API: `simulate`,
`simulateTimeseries`, `evaluateSiteDesign`, `sampleUncertainty`, `DEFAULTS`,
`PARAM_META`, `PHYSICAL_CONSTANTS`, `normalizeParams`, and the exported pure
helpers (e.g. `pCritKw`, `solarSlopeAtYear`, `nuclearSlopeAtYear`,
`beamEfficiency`, `payloadPerMissionKg`, `oxideModelYield`). If a UI
component needs a number, add it to a `SimResult` field or export a pure helper
from the engine — do not re-implement an equation in a component.

Scene tuning is the one place with *intentionally* derived numbers, and it is
centralized in `packages/app/src/viewer/bindings.ts` (log/sqrt normalizations,
clamps, instance caps, glow and fill mappings). Diorama and asset classes must
call those helpers rather than encode an engine quantity's range themselves —
otherwise a model change that shifts a magnitude leaves the visuals wrong even
after every binding helper is updated, with no test to catch it.

The mappings that depend on engine output ranges live in `bindings.ts` and are
unit-tested in `packages/app/test/bindings.test.ts`. What legitimately stays
inline is arithmetic with no range assumption — a product of two fractions
(`illumination * receiverVisibility`), a phase wrap, animation-local values,
and caps driven by the graphics tier rather than by model output (`quality.
effectCap`, `quality.rockCap`). **The test: if changing the model could make
the number wrong, it belongs in `bindings.ts`.**

When auditing for stragglers, grep on more than numeric literals. Two survived
an earlier sweep of this file precisely because they hid behind indirection —
`Math.min(FLAG_CAP, result.logistics.nMissions)` used a named constant, and the
panel-rack count derived from a local rather than touching `result.` on the
same line. Search for the *engine field names* as well as the arithmetic.

Aging slopes are the worked example of the rule. `PowerTrade.tsx` once computed
`betaT`/`alphaT` itself while asking the engine only for the crossover, so the
plotted curves could drift away from the crossover plotted beside them. The
engine now exports `solarSlopeAtYear` and `nuclearSlopeAtYear`,
`pCritDynamicKw` is built from them, the component consumes them, and
`packages/engine/test/power-slopes.test.ts` asserts the crossover stays
reconstructible from the slopes. Prefer that shape — export the shared term,
consume it, test the agreement — over duplicating an expression into the UI.

### 4. Engine constraints

- Zero runtime dependencies, pure ESM, strict TS (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`).
- `scripts/check-size.mjs` enforces a **144 KiB** comment/whitespace-stripped JS
  budget. See [Size budget](#the-size-budget-is-a-ratchet-not-a-ceiling) — it is
  a tripwire against accidental bulk, not a load-time target.
- **Units are mixed and explicitly annotated — there is no SI invariant, not
  even internally.** Most process equations are SI (J, W, K, m, kg, s), but
  hours, days, years, and watt-hours appear *inside* the physics, not only at
  the API boundary:
  - `modules/power.ts` sizes storage as `EstorageWh = (Pgrid * nightHours) / …`
    — watts × hours, in Wh.
  - `pCritDynamicKw` uses `missionYears` directly as a degradation exponent.
  - `simulateTimeseries` in `index.ts` integrates over `dtHours`, accumulating
    `deliveredWh += loadW * dtHours` and converting daily rates with `/ 24`.

  Explicit conversions (`SECONDS_PER_DAY = 86_400`, `J_PER_KWH = 3_600_000`)
  appear where an SI quantity meets one of these, but they are local to the
  expression that needs them. **Read the annotation on every quantity you touch
  and never assume a unit from context** — adding a "missing" seconds
  conversion to an hours-based formula corrupts it just as surely as omitting a
  needed one. The authority is the `unit` field in `constants/constants.json`
  for parameters and the JSDoc unit comment for result fields; keep annotating
  both, and put the unit in the field name (`secElec_JPerKg`, `gridPowerW`,
  `cycleHours`) as the existing code does.
- Out-of-range inputs are clamped in `normalize.ts` with a `param-clamped`
  warning rather than throwing. `simulate()` should not throw on user input.
- `simulate()` must stay fast and synchronous — no async, no caching layers.

#### The size budget is a ratchet, not a ceiling

`limitBytes` in `check-size.mjs` is not derived from a load-time target or any
measurement. It has been raised four times — 50 → 96 → 112 → 128 → 144 KiB —
each time to a round number just above what the engine then weighed, with a
comment naming the feature that caused the growth. Nothing breaks at 145 KiB;
`three.js` alone is roughly 9× the whole engine, so the engine has never been
what determines page load time.

The check exists to make growth **visible**. You cannot quietly add bulk,
because the build fails and getting past it requires editing `limitBytes` and
writing a line explaining why — that line is the artifact the check is really
for.

The current build sits at ~144.5 KB of ~147.5 KB, which is the normal state of
a ratchet: it always reads nearly full. Don't treat that as a crisis, and don't
contort engine code to avoid a raise. Judge the *reason* instead:

- **Raise it** for a new process model, more parameter provenance, or another
  disclosed evaluation layer — that is the project working as intended. Update
  the comment to name what grew, in the style of the existing entries.
- **Don't raise it** for a runtime dependency added to a package advertised as
  zero-dependency, a large data table that belongs in `constants/` or a fixture,
  or app-only logic that should live in `packages/app`. This is the case the
  check was built to catch, and it keeps catching it at any ceiling.

Roughly a fifth of the current budget is `constants.js` — generated metadata
shipping every parameter's unit, description, bounds, and citation to the
browser. That is the explainability requirement (§7) paid for in bytes, and it
is deliberate.

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

- **State**: a single zustand store (`src/state/store.ts`). Its invariant is
  that **`state.params` is always what was simulated** — never a value the
  engine would clamp — *and* that the user is told when a clamp happened.
  Those two pull against each other, which is the thing to understand here:
  normalizing early is exactly what stops `simulate()` raising `param-clamped`
  itself, so any path that normalizes first must carry the warnings forward or
  the edit becomes silent.

  `simulateStoreParams` does both for the authored path (`setParam`,
  `applyPatch`, URL load). The custom workspace takes the same warnings through
  `commitCustomDesign`'s `inputWarnings` argument, since
  `evaluateCustomRuntime` also receives an already-normalized design. Scenario
  **import deliberately does not normalize** — the library stores what was
  imported, and the clamp surfaces through `applyPatch` on load; normalizing
  there would drop the only chance to report it.

  So: a new entry point needs a decision, not a default. Either normalize and
  carry the warnings, or store raw and let a later normalizing path report.
  `store.test.ts` asserts both halves for every path. Note the wrapper's name — a bare `normalized` collides with a
  local in the scenario-import reducer and silently lands in the temporal dead
  zone.
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
- **localStorage keys use two different compatibility strategies** — don't
  assume the versioned one:
  - *Versioned, migrate on a schema change*: `selene-isru.study-scenarios.v2`,
    `selene-isru.custom-site-draft.v1`, and
    `selene-isru.custom-site-draft-backup.v1` (a separate key, *not* a
    `.backup` suffix — see `CUSTOM_SITE_DRAFT_BACKUP_KEY`). Bump the suffix and
    migrate; never silently reinterpret data under an existing version.
  - *Unversioned, tolerant read*: `selene.graphics` carries no version and
    stays compatible by parsing whatever it finds through
    `normalizeGraphicsPrefs`, filling missing fields from
    `DEFAULT_GRAPHICS_PREFS`. Adding or widening a preference needs no
    migration; **changing the meaning of an existing field does**, and since
    the key can't express that, it means reading the legacy key explicitly and
    writing a new one — not overwriting in place.
- `window.__SELENE_DEMO__` (set up in `Scene.tsx`) is the capture bridge the
  `scripts/capture-*.mjs` demos drive. Changing it means re-recording the
  cinematics.
- App tsconfig is strict with `noUnusedLocals`/`noUnusedParameters`; the app
  build runs `tsc --noEmit` before `vite build`.

### 7. Explainability is a product requirement

Inputs expose plain engineering names *and* engine variable names, model
maturity, source links, illustrative spreads, range rationale, applicability,
and validity limits. Those come from **two** places, and a new parameter needs
both:

- `constants/constants.json` holds only value, unit, kind, bounds, group,
  description, and source.
- `src/controls/evidence.ts` derives everything else — maturity, source URL and
  section (regex-matched against the `source` string), uncertainty, range
  rationale, applicability (from `group`), and validity — then merges a
  per-parameter entry from `KEY_OVERRIDES` over that base.

So adding a parameter to the JSON alone does not fail loudly: it silently
inherits **generic fallback evidence**. If the parameter needs specific
validity limits, applicability, or a source link the regexes won't match, add a
`KEY_OVERRIDES` entry. Numeric claims in Brief, Conserve, and Trade Study
should be traceable to the actual engine run, not to hard-coded copy.

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
| Aging slopes ↔ crossover | `packages/engine/test/power-slopes.test.ts` |
| Store clamping invariant, URL round-trip, export | `store.test.ts`, `url.test.ts`, `study-export.test.ts` |
| Custom Site UI/editor/perf | `custom-site-*.test.*` |

## CI and deploy

`.github/workflows/ci.yml` runs on every push and PR: pnpm install → uv sync →
pytest → regenerate golden vectors → `git diff --exit-code` on the vector files
→ `check:constants` → engine test → engine build → app test → app build → ruff.
The `deploy` job publishes `packages/app/dist` to GitHub Pages, but only on a
push to `main`, with `PAGES_BASE=/selene-isru/`.

`pnpm run ci` is the closest local equivalent, but it is **not** the same gate.
Two differences bite:

- It runs `generate:golden` without the following `git diff --exit-code`, so a
  model change whose regenerated vectors were never committed passes locally
  and fails on GitHub. After `pnpm run ci`, check `git status` — if
  `golden_vectors.json` or `dynamics_vectors.json` moved, commit them.
- It runs `pnpm test` (engine test → app test) before `pnpm build`, so on a
  fresh clone the app tests fail on the unbuilt engine described above. Build
  the engine first, or run `pnpm build` before `pnpm run ci`.

Both are worth fixing in the root `ci` script; that is a code change, out of
scope for this file.

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
