# Ilmenite reactor v0.10

This continues the audit trail from [`model-ilmenite-v08.md`](model-ilmenite-v08.md)
and [`model-excavation-v09.md`](model-excavation-v09.md). It takes up two of
v0.8's "left for later" items:
- **Conversion from kinetics.** How much ilmenite the reactor reduces now
  follows from its temperature and residence time.
- **Reactor mass with feed.** The fluidized bed is sized by the solids it
  holds.

Eagle's design point is unchanged, so the default ilmenite plant and every
v0.8 anchor stay where they were. The cases that move are the ones the model
used to get wrong.

> **Model boundary:** the reduction rate is a calibrated screening form, not a
> grain-scale kinetics model, and the bed mass is linear in its hold-up. Both
> are pinned to one conceptual design. TypeScript/Python parity proves the two
> implementations agree, not that the answer is right.

## Why

In v0.8 the fraction of ilmenite reduced was an input (`fIlmConversion`), and
the reactor mass scaled with oxygen alone (`kIlmReactorMass`). Two trades came
out wrong:

- **Temperature only cost heat.** A cooler reactor saved feed heat and lost
  nothing, so the model favoured it. In reality the reduction slows sharply:
  Zhao & Shadman's synthetic ilmenite took 210 min to metallize fully at
  807 °C and 52 min at 1,014 °C.
- **A lean feed only cost heat.** Feeding more solids per kg of oxygen needs a
  wider, heavier reactor, as Eagle's own no-separation trade found (+45%
  process mass). The model charged none of it, and its evidence drawer said so.

A further gap: "a concentrate no richer than the soil is no separation" was
unreachable at Eagle's 7.5 wt% mare soil. The concentrate grade could not go
below 10 wt%, so the very trade this item is about could not be run.

## What the model computes

**Conversion.** Each of the bed's three stages is treated as well mixed,
reducing at a rate first order in the ilmenite left:

```
X     = 1 − (1 + k·τ/N)^−N                       N = 3 stages, τ = tIlmResidenceH
k     = k_ref · exp(−Ea/R · (1/T − 1/T_ref))     T = TIlmReactor
k_ref = N · ((1 − X_ref)^(−1/N) − 1) / τ_ref     X_ref = 0.9, τ_ref = 4 h, T_ref = 1,273 K
```

- **The rate itself** is pinned to Eagle's design point: 90% at 1,000 °C and
  4 h in three stages, which gives k_ref = 0.866 per hour.
- **The temperature dependence** defaults to Zhao & Shadman's measured
  activation energy. Because it is uncertain, `EaIlmReduction` is an input:
  at the design temperature it has no effect, and away from it, it sets how
  steeply conversion falls or rises.

Conversion is now a result (`ilmenite.conversion`), and residence time is the
input.

**Reactor mass.**

```
bed hold-up  = feed per hour × τ                 [kg of solids]
bed mass     = kIlmBedMass × bed hold-up
reactor mass = kIlmGasLoopMass × O₂ per day + bed mass
```

The hydrogen loop, heaters, cyclones and radiators scale with oxygen. The bed
scales with what it holds, so a leaner feed or a longer stay makes it
heavier. `ilmenite.bedHoldupKg` and `ilmenite.bedMassKg` report the split.

**One trade, three effects.** A longer residence time reduces more ilmenite.
That means less soil to mine, beneficiate and heat per kg of oxygen, but a
bigger bed. Landed mass now has an optimum near 8 h (90.8 t, against 93.7 t at
4 h and 91.1 t at 12 h).

## Inputs and constants

| Input | Default | Range | Basis |
|---|---|---|---|
| `tIlmResidenceH` (new) | 4 h | 0.25–12 h | Eagle 1988 (EEI 88-182, [NTRS 19890004515](https://ntrs.nasa.gov/citations/19890004515)), Sec. 4: the three-stage bed is sized for 4 h. Its single-stage case runs 1 h. |
| `EaIlmReduction` (new) | 93.3 kJ/mol | 50–185 kJ/mol | Zhao & Shadman 1991, *Ind. Eng. Chem. Res.* 30(9) ([NTRS 19910015054](https://ntrs.nasa.gov/citations/19910015054)): 22.3 kcal/mol apparent, 807–1,014 °C. The range spans a gas-limited bed (about 50 kJ/mol, from Eagle's equilibrium per-pass conversions) to Briggs & Sacco 1991's 181 kJ/mol under reaction control below 750 °C. |
| `kIlmGasLoopMass` (new) | 17.43 kg/(kg/day) | 5–60 | v0.8's 18.6, less the bed at its default hold-up (1.17 kg per kg/day). |
| `kIlmBedMass` (new) | 0.6 kg/kg | 0.1–3 | Calibrated to Eagle Sec. 6.3.5 and Fig. 6-21 (below). |
| `ilmConcentrateGrade` | 0.9 kg/kg | **0.005**–1 (was 0.1–1) | The bound now reaches the soil's own grade, which is no separation. |

| Constant | Value | Basis |
|---|---|---|
| `nIlmBedStages` | 3 | Eagle Sec. 4, Fig. 4-1b. |
| `ilmConversionRef`, `tIlmResidenceRefH`, `TIlmReactorRef` | 0.9, 4 h, 1,273 K | Eagle Sec. 4: the design point. |

**Retired:**
- `fIlmConversion`: now an outcome.
- `kIlmReactorMass`: the whole block at one feed, now split in two.

## Calibration and cross-checks

**Eagle's no-separation trade** (calibration benchmark
`eagle-1988-no-separation-trade`):
- **Eagle's case:** a 144 t/yr LOX plant at 90% duty, nuclear-powered.
- **What changed:** dropping the magnetic separator and feeding the sized soil
  instead raised process mass from 12.5 to 18.1 t, read off Fig. 6-21's axis.
  The bar totals match the stated 47.2 and 51.1 t.
- **Eagle's explanation:** "a wider, more massive reactor" for the larger feed.
- **Calibration:** at that plant, the extra feed puts 9.4 t more solids in a
  4 h bed, so 5.6 t of extra mass is 0.60 kg per kg held.

The model reproduces the 5.6 t to within 1%. This confirms the derivation, not
the physics.

**Activation energy** (documentation-only benchmark
`ilmenite-reduction-activation-energy`). Four anchors, all inside the input's
range:

| Anchor | kJ/mol |
|---|---|
| A bed held near gas equilibrium: Eagle's per-pass H₂ conversion, 10.5% at 1,000 °C and 7% at 900 °C | 50.4 |
| Complete-reduction times Eagle cites: 2 h at 873 K, 0.25 h at 1,073 K | 80.9 |
| Zhao & Shadman, synthetic ilmenite at 807–1,014 °C (the default) | 93.3 |
| Briggs & Sacco, reaction control at 823–1,023 K | 180.7 |

**Lab rates are much faster than the design.**
- **Lab rates.** Eagle cites about 70% of the oxygen on the iron removed in an
  hour at 1,000 K, and complete reduction in a quarter hour at 1,073 K.
  Zhao & Shadman's powder was under 45 µm.
- **Model rates.** At those temperatures, Eagle's own design rate, which this
  model is pinned to, reduces a few percent in the same time. The design is 10
  to 100 times slower than the lab.
- **Why.** A fluidized bed holds its gas near the reaction's equilibrium, where
  only about a tenth of the hydrogen reacts per pass. Lunar grains are also
  coarser than lab powder.
- **What follows.** The model takes the rate from the design and only the
  temperature dependence from the lab. A gas-limited bed may follow the
  weaker, equilibrium-driven dependence, which is why the input reaches down
  to 50 kJ/mol.
- **Static beds.** Sargeant et al. 2020 reduced about a third in short static
  runs. Static beds starve the reaction of hydrogen, which this model does not
  represent.

## Published numbers that moved

Equatorial ilmenite, 1 t/day of oxygen, default inputs except as named.
Before → after.

| Case | Ilmenite reduced | Soil per kg O₂ | Reactor (t) | Energy (kWh/kg) | Landed (t) | Payback (day) |
|---|---|---|---|---|---|---|
| Eagle mare soil (default) | 0.900 | 327 | 18.6 | 19.8 | 93.7 | 586 |
| 900 °C reactor | 0.900 → **0.729** | 327 → **404** | 18.6 → **18.9** | 19.6 → **22.1** | 93.5 → **106.1** | 585 → **589** |
| 1,100 °C reactor | 0.900 → **0.969** | 327 → **304** | 18.6 → **18.5** | 20.0 → **19.2** | 94.0 → **90.2** | 586 → **584** |
| 1 h residence (new input) | **0.533** | **553** | **17.9** | **27.4** | **129.3** | **596** |
| 8 h residence (new input) | **0.972** | **303** | **19.6** | **19.0** | **90.8** | **585** |
| Enrichment 3× (22.5 wt%) | 0.900 | 327 | 18.6 → **22.1** | 26.5 | 102.2 → **105.7** | 588 → **589** |
| Concentrate at 10 wt% | 0.900 | 327 | 18.6 → **28.0** | 37.8 | 116.2 → **125.6** | 592 → **595** |
| No separation (7.5 wt% fed) | was clamped to 10 wt% | 327 → **321** | 18.6 → **31.5** | 37.8 → **44.3** | 116.2 → **136.5** | 592 → **599** |
| High-Ti mare 15 wt% | 0.900 | 164 | 18.6 | 15.4 | 68.9 | 243 |

- **Temperature cuts both ways now.** At 900 °C the plant reduces 73%, so it
  mines and heats a quarter more soil. That outweighs the hotter feed it no
  longer needs. At 1,100 °C it reduces 97% and lands 3.5 t less, though the
  rate there extrapolates past Zhao & Shadman's range.
- **Lean feeds pay for their bed.** Feeding the sized soil whole puts 17.6 t of
  solids in the bed, and the reactor reaches 31.5 t. Separation is worth more
  than v0.8 showed, as Eagle found.
- **Without separation, soil falls slightly** (327 → 321 kg/kg), because no
  separator loses ilmenite. But the reactor heats 140 kg of solids per kg of
  oxygen instead of 11.7.
- **MRE and the pole do not move.**

Regression anchors (v0.10) were added deliberately in `regression.test.ts` and
`test_regression.py`. v0.8's anchors are unchanged. Golden vectors were
regenerated.

## Saved cases and links

`fIlmConversion` and `kIlmReactorMass` are dropped on library load, study and
case import, and link parse (`src/lib/legacyParams.ts`). A v0.8 case at its
defaults reads the same plant: 90% and 18.6 kg per kg/day. A case that set
conversion directly takes the default residence time; set `tIlmResidenceH` to
reach a different conversion.

## In the app

- **Rail:**
  - The ilmenite group shows residence time, the activation energy, the
    hydrogen-loop mass, and the bed mass, in place of conversion and the single
    reactor mass.
  - The concentrate grade now reaches the soil's grade.
  - At the default 1,000 °C the activation energy reads NO EFFECT. That is by
    design: the rate is pinned there. The input-activity test checks it acts
    at 900 °C.
- **Inspector:** the ilmenite reactor's controls trade conversion for
  residence time, and it reads the ilmenite reduced and the bed hold-up.
- **Evidence:**
  - Residence time explains the staged form and its limits.
  - Temperature now says it sets the rate as well as the heat.
  - The concentrate grade's note no longer warns that reactor mass ignores the
    feed.
- **Uncertainty:** residence time replaces conversion, at ±30%. The activation
  energy is also offered, at ±30%.

Screenshots:
- [residence time and its evidence](screenshots/ilmenite-reactor/residence-time-evidence.png)
- [landed mass against residence time](screenshots/ilmenite-reactor/sweep-residence-line.png)
- [landed mass across temperature and residence time](screenshots/ilmenite-reactor/sweep-temperature-residence-map.png), log scale
- [the reactor inspector](screenshots/ilmenite-reactor/reactor-inspector.png)

## Verification

- **Kinetics:** `ilmenite.test.ts` and `test_ilmenite.py` check:
  - the staged form, written out
  - the design point
  - monotonic response to temperature and residence time
  - the energy penalty of a cool reactor
- **Bed:** the same tests check the hold-up and bed arithmetic, that the
  default adds back to 18.6, and the residence-time optimum.
- **External benchmarks:** the Eagle no-separation calibration and the
  activation-energy cross-check, in both suites.
- **Parity:** 217 golden vectors, regenerated. The Latin hypercube samples the
  four new inputs and the wider grade range.
- **Size budget:** the engine is 190,894 B, within 192 KiB.

## Left for later

- **Grain size.** The rate is pinned to one design's grains. A shrinking-core
  form with grain radius would carry Zhao & Shadman's and Briggs & Sacco's
  measurements directly.
- **Stage count** as a design input (Eagle's single-stage case: 1 h, no heat
  recovery).
- **Reduction of TiO₂ and of FeO in other minerals.** Both release more
  oxygen, and neither is credited.
- **Economy of scale** in the bed and gas loop between pilot and production
  plants.
- **Still open from v0.8:** iron and tailings credit, a dedicated ilmenite
  scene, and basalt feed. *(v0.11: basalt feed done. See
  [`model-basalt-feed-v011.md`](model-basalt-feed-v011.md).)*
