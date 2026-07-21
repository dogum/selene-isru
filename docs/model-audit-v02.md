# SELENE-ISRU v0.2 model audit

> **Historical audit snapshot:** The five partial implementations and backlog
> items concerning multi-stream storage, energy ledgers, site-profile import,
> MRE voltage losses, and runtime causal tracing were subsequently implemented
> in the [`v0.3 model-depth continuation`](model-depth-v03.md). The limitations
> recorded here remain useful context for the state that was originally reviewed.

Audit date: 2026-07-20
Baseline: `v0.1-concept-baseline` (`51a44cd`)
Working branch: `codex/model-audit-v02`

## Decision

The external review is substantially correct. The v0.1 code is coherent as a
comparative concept model and its TypeScript/Python agreement is unusually
strong, but several labels overstated what had been demonstrated and three
subsystems contained material modeling defects: generic LOX assumptions were
applied to polar products, storage heat leak was simultaneously counted as
boil-off and fully removed by a cryocooler, and the Sabatier result omitted
required mass streams.

The v0.2 branch is suitable to share **with an explicit conceptual-tool
disclaimer** after CI and visual QA. It is not suitable for hardware sizing,
safety analysis, cost commitment, mission certification, or claims of physical
validation.

## Claim-by-claim verdict

| Review claim | Verdict | Evidence and action |
|---|---|---|
| The Faraday-law oxygen electrolysis equation is correct and gives about 15.63 kWh/kg O₂ at the stated ideal inputs. | Verified | The equation and numerical anchor reproduce. A separate benchmark test now protects it. This does not validate the aggregate MRE reactor model. |
| Polar sublimation gives about 1.78 kWh/kg at 5 wt% ice and 10.7 kWh/kg at 0.5 wt% ice. | Verified | Both anchors reproduce. The result is explicitly treated as a thermodynamic lower-bound chain; vapor transport, capture, purification, transient heating, and heterogeneous deposits are not resolved. NASA's extraction analysis models a sealed evacuated cell and vapor evacuation/capture, confirming those omitted operations matter ([NASA/TM-2012-217441](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20120009955.pdf)). |
| Five percent ice should not be presented as generic Shackleton regolith. | Verified | LCROSS measured 5.6 ± 2.9 mass% at one Cabeus impact location, not a universal south-pole value ([NASA/TM-2012-217441](https://ntrs.nasa.gov/api/citations/20120009955/downloads/20120009955.pdf)). The UI evidence now calls the assay spatially uniform and site-specific. |
| TypeScript/Python parity is excellent but is not physical validation. | Verified | The 200-point parity harness is real. Public language now says “independent implementations parity-tested,” and external anchors are kept in a separate suite. |
| Polar cryogenic storage incorrectly inherits LOX density, temperature, latent heat, and conditioning energy. | Verified defect | Replaced with an explicit stored-stream model: auto-by-site, LOX, water ice, liquid water, LH₂, LCH₄, or custom. Resolved stream properties are returned in the result and shown in controls/reports. |
| The same heat leak was counted as both passive boil-off and active cryocooler removal. | Verified defect | Storage now exposes passive, capacity-limited, and zero-boil-off modes. `qResidual = max(0, qLeak - qRemoved)` drives actual phase loss; unmitigated loss is reported separately as an equivalent. |
| The Sabatier ledger omits CO₂ import, recycled water, and unreacted H₂. | Verified defect | At 1,000 kg/day water and 95% conversion the engine now reports 111.11 kg/day gross H₂, 888.89 O₂, 580.56 CO₂ import, 211.11 CH₄, 475.00 recycled water, and 5.56 unreacted H₂. Node residuals are tested below 1e-6 kg/day. |
| Polar power incorrectly uses a generic 354 h day/night cycle and reports hypothetical beamed power even for nuclear. | Verified defect | Polar power now uses an explicit illuminated fraction and longest-shadow interval. The default is a conservative Shackleton-rim study case (0.71 and 117 h), while NASA reported 62 h storage for a different favorable reduced-DEM site. The architecture is now explicit and beam delivery is inactive for nuclear cases ([NASA polar illumination study](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20080045536.pdf)). |
| “Feasible” means only that implemented warnings and caps passed. | Verified wording problem | User-facing status now says “no implemented constraint violations” or “within active constraints.” It does not imply mission feasibility. |
| Some controls are diagnostic rather than causal. | Verified | Evidence drawers now classify each public numeric control as causal or constraint-diagnostic and state the dependency behavior. Full causal graph coverage remains future work. |
| The oxide model is a calibrated threshold, not a thermodynamic voltage decomposition. | Verified | The evidence language now calls it an aggregate, calibrated system-level oxide-recovery approximation. NASA MRE work couples geometry, current density, materials, Joule heating, conduction, and radiation; those effects are outside this reduced model ([NASA MRE reactor concepts](https://ntrs.nasa.gov/api/citations/20120003037/downloads/20120003037.pdf)). |
| The MLI layer-density conversion is suspect by a factor of `10^2.63`. | Substantive concern verified; coefficient correction unresolved | NASA optimization examples and axes use layers/cm ([NASA MLI layer-density study](https://ntrs.nasa.gov/api/citations/20130012958/downloads/20130012958.pdf)). v0.1 divides the public layers/cm input by ten before the exponent. Because the checked-in coefficient was calibrated with that convention, changing only the unit conversion would create false precision. v0.2 preserves the calibrated convention, labels absolute heat leak benchmark-pending, and adds this item to the open validation backlog. |

## Corrections implemented in this sprint

- Preserved the old state with local tag `v0.1-concept-baseline`.
- Replaced “physics cross-validated,” “payback,” generic “feasible,” and
  probability-sounding “uncertainty” language.
- Added product-aware storage properties and three explicit heat-control modes.
- Made residual heat, actual phase loss, unmitigated loss equivalent, and
  cryocooler load mutually consistent.
- Added an explicit Sabatier material ledger and a process-node conservation
  graph for both sites.
- Added polar illumination and longest-shadow inputs; sized polar solar through
  the beam transfer path and disabled the beam when nuclear is selected.
- Added relational alarms for invalid fission/radiator temperatures, beam
  delivery shortfall, cryocooler capacity shortfall, oxide composition sums,
  and material-balance residuals.
- Added “Why this number” KPI explanations, causal/diagnostic input roles, and a
  conservation section in the printable engineering report.

## Deliberate partial implementations

- Storage now resolves one explicitly selected **primary** stream. Sabatier
  oxygen, hydrogen, methane, water recycle, and imported carbon dioxide are
  separate conserved process flows, but they are not yet independently
  tank-sized or accumulated as a multi-inventory storage system.
- Conservation checks cover reported material mass. The engine does not yet
  expose a complete energy/rejected-heat/accumulation ledger for every process
  node.
- Input roles are explicit and the KPI drawer shows direct dependencies, but a
  runtime causal graph that highlights every downstream equation is not yet
  implemented.
- The polar site model now uses an explicit illumination fraction and longest
  shadow, not a universal equatorial cycle. A time-resolved terrain and
  visibility profile importer remains future work.

## Verification on this branch

- Constants code generation is deterministic and has a dirty-worktree-safe
  consistency check.
- TypeScript engine: 231 tests across 5 files, including 209 parity scenarios,
  external analytical anchors, storage-mode invariants, and process-node mass
  conservation.
- React app: 33 tests across 6 files, including URL round-trips for the new
  string-valued storage settings.
- Python mirror: 15 tests plus Ruff, all passing.
- Production build: passing. The main app chunk is 248.22 kB raw / 74.90 kB
  gzip, about +9.1 kB raw / +2.8 kB gzip versus the v0.1 baseline; the Three.js
  runtime and external GLB payloads are unchanged. The engine's estimated
  minified output is 61,681 bytes under its new 64 KiB budget.
- Desktop and 390 x 844 mobile browser QA covered storage mode/stream switching,
  KPI explanations, the report conservation table, and responsive layout. No
  runtime exceptions were observed. Existing Three.js warnings about cloned
  render-target textures and undefined optional material maps remain visual
  pipeline cleanup work and were not introduced by this model sprint.

The corrected default cases now resolve as follows. These remain model outputs,
not externally validated mission predictions.

| Default case | SEC | Grid power | Selected power | Infrastructure | Plant-mass equivalent | Primary storage |
|---|---:|---:|---|---:|---:|---|
| Equatorial MRE | 24.775 kWh/kg | 1.032 MW | Nuclear | 58.97 t | 58.97 days | LOX, zero-boil-off |
| Polar water | 2.814 kWh/kg | 117.2 kW | Nuclear | 19.52 t | 19.52 days | Water ice, zero-boil-off |
| Polar + Sabatier | 8.456 kWh/kg | 352.3 kW | Nuclear | 38.57 t | 38.57 days | Water ice primary, zero-boil-off |

All three default material ledgers close to a reported residual of zero. The
zero-boil-off cases report zero actual phase loss and preserve the unmitigated
equivalent separately (82.87 kg/day for equatorial LOX and 5.79 kg/day for
polar water ice).

## Open validation backlog

1. Reconstruct the full MLI coefficient/unit pair from a traceable source and
   benchmark heat flux at multiple temperatures and layer densities.
2. Extend the primary-stream storage calculation into independently sized,
   accumulated, and loss-accounted water/O₂/H₂/CH₄/CO₂ inventories.
3. Add process-node energy, rejected-heat, loss, and accumulation ledgers with
   conservation tolerances beside the mass ledger.
4. Replace the aggregate oxide voltage threshold with reversible voltage,
   activation/ohmic/concentration losses, geometry, and temperature-dependent
   transport only when traceable data are available.
5. Add location/height-specific illumination profile import rather than treating
   an illuminated fraction and longest shadow as a complete site trace.
6. Add vapor capture, purification, equipment efficiency, transient bed heating,
   and heterogeneous assay models to polar extraction.
7. Add availability, redundancy, reliability, spares, campaign scheduling,
   thermal transients, and component minimum-size effects before mission claims.
8. Validate stream conditioning SEC and storage-mass correlations against
   product-specific hardware references; current values remain design assumptions.
9. Generate a runtime causal graph so selecting a control can highlight every
   equation, process node, warning, and KPI that actually depends on it.

## Evidence policy

The parity suite answers: “Do the two implementations produce the same result?”
The benchmark suite answers: “Does a narrow analytical anchor reproduce?” The
material invariants answer: “Does this process ledger conserve reported mass?”
None of those questions alone answers: “Will a lunar plant perform this way?”
