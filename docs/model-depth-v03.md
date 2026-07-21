# SELENE-ISRU v0.3 model-depth continuation

Date: 2026-07-20
Baseline audit: [`model-audit-v02.md`](model-audit-v02.md)
Working branch: `codex/model-audit-v02`

## Outcome

This continuation implements the five substantive gaps called out by the v0.2
audit. It makes the simulator more inspectable and internally accountable, but
does not change its conceptual-design boundary. The added detail is useful for
trade studies and for understanding what the model is doing; it is not hardware
validation or a substitute for a location-specific lunar campaign analysis.

| Audit item | Implementation | Deliberate boundary |
|---|---|---|
| Independently sized multi-stream inventories | Auto storage creates one inventory per active stream, with its own rate, reserve, density, volume, conditioning load, storage-system mass, heat leak, cooling allocation, and phase loss. | Tank count, geometry, and mass remain continuous correlations. The shared reserve duration and linear storage-mass factor do not represent packaging, common bulkheads, minimum gauge, or redundancy. |
| Process-node energy conservation | The engine publishes electrical input, coupled heat, useful duty, rejected heat, accumulation, and residual at each declared process boundary, plus the grid-allocation residual. | This is a first-law bookkeeping ledger over the energy terms the model declares. It is not an exergy analysis and cannot reveal omitted process physics. |
| Time-resolved polar site profile | JSON and CSV import drive solar sizing, receiver availability, outage duration, surface temperature summaries, timeseries lighting, battery state, and the 3D beam/receiver state. | The importer trusts user-provided deterministic data. It does not calculate terrain horizons, ephemerides, pointing error, dust, uncertainty, or structural tower dynamics. |
| Detailed MRE voltage/loss physics | MRE now exposes composition-weighted reversible voltage, activation, area-specific ohmic, mass-transfer concentration, voltage margin, current utilization, electrode area, chemical power, and modeled loss power. | This is a lumped polarization model. Activation and area-specific resistance are design inputs, Ellingham fits remain reduced correlations, and the model is not calibrated against an integrated reactor test article. |
| Actual runtime causal graph | Every numeric evidence drawer can execute the current engine twice under a bounded local perturbation and show which of 27 registered equations, processes, constraints, and KPIs actually changed. | This is a local differential trace, not a hand-authored dependency claim. It can miss dormant threshold behavior and does not yet instrument every internal temporary variable. |

## Independent storage inventories

`storageStream=AUTO BY SITE` now resolves the process flows instead of assigning
every site a single primary-product tank. The default active sets are:

- Equatorial MRE: liquid oxygen.
- Polar water: water ice.
- Polar Sabatier: water buffer, liquid oxygen, residual liquid hydrogen, liquid
  methane, and imported solid carbon dioxide feed.

The explicit stream selector remains available as a one-stream what-if. In the
default 1,000 kg/day polar Sabatier case, auto storage sizes five inventories
with a combined 80,583 kg reserve, 84.61 m³ reserve volume, and 16,117 kg
storage-system mass under the current 30-day and linear-mass assumptions.

The `CONSERVE` inspector and engineering report show every inventory alongside
the material and energy ledgers. The 3D tank population responds to total
reserve volume, so multi-stream model state is visible in the site rather than
being confined to a table.

## Declared energy boundaries

Every energy node obeys:

```text
electrical input + coupled input
  = useful output + rejected heat + accumulation + residual
```

The separate grid residual compares total grid power with the electrical input
allocated across the nodes. Residuals caused only by catastrophic cancellation
are zeroed at `64 × machine epsilon × node scale`; this keeps the tolerance tied
to floating-point precision instead of hiding a fixed physical imbalance.

The default cases expose five or six nodes and close all declared node and grid
residuals to reported zero. Several terms are intentionally classified as
accumulation—for example regolith sensible/latent melt duty and product
conditioning—because the downstream transient discharge is not modeled.

## Polar profile contract

The control rail accepts `.json` or `.csv`, includes a downloadable template,
and provides an illustrative sample. The checked-in example is
[`examples/polar-site-profile.json`](examples/polar-site-profile.json).

JSON schema:

```json
{
  "version": 1,
  "name": "Location and receiver geometry",
  "points": [
    { "hour": 0, "illumination": 1, "receiverVisibility": 1, "surfaceTemperatureK": 210 },
    { "hour": 12, "illumination": 0, "receiverVisibility": 0, "surfaceTemperatureK": 50 },
    { "hour": 24, "illumination": 1, "receiverVisibility": 1, "surfaceTemperatureK": 210 }
  ]
}
```

CSV uses the same four column names. `receiverVisibility` and
`surfaceTemperatureK` are optional; they default to `1` and `200 K` in the UI
importer. Profiles require 2–512 strictly increasing points, begin at hour zero,
and use the last hour as the repeating cycle length. Fractions must be in
`[0, 1]`, and temperatures in `20–450 K`. Values are linearly interpolated.
An invalid engine payload raises a visible alarm and falls back to the scalar
polar assumptions rather than silently producing a partial result.

Average illumination and receiver visibility use trapezoidal integration. The
delivered fraction integrates `illumination × receiver visibility` over each
piecewise-linear segment (rather than multiplying the two averages), and it is
that paired integral that drives solar energy availability.
Longest circular outages are evaluated over 1,024 bins with delivered light at
or below 5% treated as unavailable. Consequently, the importer is suitable for
screening an externally generated trace, not for generating that trace.

## MRE voltage and loss decomposition

The MRE inspector and engineering report now expose:

```text
Vrequired = Vreversible + Vactivation + j·ASR + Vconcentration
Vmargin = Vcell - Vrequired
Vunallocated = max(0, Vmargin)
Vconcentration = R·T / (4F) · ln[1 / (1 - j/jlimit)]
jlimit = 4F·D·Cbulk / diffusion thickness
electrode area = current / operating current density
```

At the default case the decomposition is 2.020 V reversible, 0.450 V
activation, 0.600 V ohmic, 0.039 V concentration, and 1.091 V unallocated at a
4.2 V applied cell voltage. The corresponding conceptual electrode area is
129.25 m². Oxide recovery uses the voltage remaining after modeled losses; a
negative margin and operation above 85% of limiting current raise alarms.

## Runtime causal trace

`TRACE ACTUAL DOWNSTREAM EFFECTS` is available from numeric input evidence.
It perturbs the selected input by a bounded local step, runs `simulate()` at the
current and perturbed scenarios, and compares registered public result nodes.
The modal separates changed equations/processes/constraints from changed
headline KPIs and displays both values. This is deliberately scenario-specific:
an input can be causal in the model yet show no local output change when a gate
is off or a threshold has not been crossed.

## Verification

- TypeScript engine: 241 tests across 6 files, including 209 Python-generated
  parity cases and 8 model-depth tests.
- React app: 38 tests across 7 files, including runtime causal tracing and JSON/
  CSV profile validation.
- Python mirror: 22 tests; Ruff clean.
- Production build: passing. Estimated minified engine output is 81,418 bytes
  under the 96 KiB guardrail.
- Initial app chunk: 270.55 kB raw / 81.25 kB gzip. The conservation inspector
  and causal graph are lazy chunks of 3.88 kB and 6.64 kB raw, so their UI code
  is not part of the initial chunk. Three.js and equipment GLBs are unchanged.

## Remaining high-value validation work

1. Reconstruct and benchmark the MLI coefficient/unit pair against accepted
   product-specific heat-flux cases.
2. Replace continuous tank mass/geometry with stream-specific pressure vessel,
   insulation, plumbing, minimum-size, redundancy, and packaging models.
3. Add polar vapor capture, purification, heterogeneous assay, and transient bed
   heating rather than treating extraction as a lower-bound chain.
4. Calibrate MRE polarization and transport inputs against traceable cell data,
   including temperature and composition dependence.
5. Add uncertainty/provenance metadata to imported site traces and compare
   location/height alternatives rather than treating one profile as truth.
6. Expand runtime instrumentation from the 27 public observations to every
   relevant intermediate equation and warning threshold.
7. Add reliability, spares, scheduling, degradation, and component minimum-size
   effects before making mission-readiness claims.

## Evidence policy

Parity asks whether two implementations agree. Conservation asks whether
declared boundaries close. Runtime tracing asks what changes locally in the
executed model. None of these demonstrates that an omitted effect is small or
that the modeled plant will perform as predicted on the Moon.
