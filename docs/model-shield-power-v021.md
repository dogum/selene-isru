# Fission shield mass with power v0.21

This continues the audit trail from
[`model-fission-calibration-v019.md`](model-fission-calibration-v019.md) and
[`model-brayton-cycle-v020.md`](model-brayton-cycle-v020.md). v0.19 left the
item open: one shield mass, NASA FSP's 1,676 kg for a 175 kWt reactor, served
every power level, though a megawatt reactor needs a heavier shield at the same
dose and distance.

**What changes:**
- **The shield grows with power.** At the default plant's 3.8 MWt it is 4.6 t
  instead of 1.7 t.
- **The reactor and conversion terms carry less.** Mason 2001's 29.25 kg/kWe
  marginal mass, which v0.19 calibrated to, already includes the shield's
  growth between 100 and 500 kWe.
- **Net effect:** the default plant lands 0.8 t lighter. A megawatt plant gets
  lighter, a small one slightly heavier, and no landing count changes.

> **Model boundary:** the shield is a power law fitted to two NASA design
> points, extrapolated 20 times past them to the default plant. It is not a
> shield design: the dose, separation distance, and burial are those of the
> reference shield, and do not change with power. TypeScript/Python parity
> proves the two implementations agree, not that the answer is right.

## Why

Since v0.2 the fission system carried one shield mass, `MshieldKg`, whatever
the power.
- **What v0.19 set:** NASA FSP's 1,676 kg shield, sized for a 175 kWt reactor
  emplaced with regolith augmentation, under 5 rem/yr at 100 m. It disclosed
  that a megawatt reactor needs more.
- **Why more:** for the same dose at the same distance, a reactor making 20
  times the heat needs about three more e-foldings of attenuation, and a larger
  core needs a wider shield.

## What the model computes

```
shield mass          = MshieldKg · max(1, Q / QshieldRefKwt)^nShield                   [kg]
fission mass         = shield + kReactorKgPerKwt · Q + kConversionKgPerKwe · P
                       + kRadiatorKgPerM2 · radiator area                              [kg]
crossover (P* ≤ Pref) = MshieldKg / (β − α)                                           [kW]
crossover (P* > Pref) = [MshieldKg / ((β − α) · Pref^nShield)]^(1 / (1 − nShield))     [kW]
```

- **Q and Pref:** Q is the reactor heat in kWt. Pref is the electrical output
  at the shield's reference heat, `QshieldRefKwt` times the conversion
  efficiency (`shieldRefKwe`).
- **Below the reference** the shield stays at `MshieldKg`. A small reactor
  still needs a crew-rated shield: Mason 2001 finds that a 10 kWe reactor
  system weighs almost four times a radioisotope one, "principally due to the
  added shield mass".
- **The crossover** where nuclear beats solar is closed-form in both regimes,
  continuous at Pref, and the same with or without aging.
- **The power panel** draws the nuclear curve with the engine's
  `shieldMassKg` and `shieldRefKwe`, and lists the shield's mass.
- **New result field:** `power.shieldMassKg`.

| Key | Default | Range | Basis |
|---|---|---|---|
| `QshieldRefKwt` | 175 kWt | 10–5,000 | NASA FSP: the 1,676 kg shield is sized for its 175 kWt reactor |
| `nShield` | 0.33 | 0–0.67 | Mason 2025: ln(1,500 / 1,370) / ln(230 / 175) |
| `kReactorKgPerKwt` | 2.25 → **1.75** kg/kWt | | Recalibrated to Mason 2001 with the shield's growth (below) |
| `kConversionKgPerKwe` | 8.47 → **6.58** kg/kW | | Recalibrated to Mason 2001 with the shield's growth (below) |

## The sources

**Mason 2025** (Mason, Kaldon, Corbisiero & Rao, NETS 2025, Table IV): NASA and
DOE's 40 kWe lunar fission surface power concepts, both shielded for 5 rem/yr
at a 1 km habitat boundary:
- **Heat-pipe reactor and Stirling:** 175 kWt, 1,370 kg shield.
- **Gas-cooled reactor and Brayton:** 230 kWt, 1,500 kg shield. The paper
  attributes the extra 10% to the gas reactor's "greater size and higher
  thermal power".

The two give an exponent of 0.33. It carries both a thicker shield and a larger
core, so it errs heavy for thickness alone.

**Bounds on the exponent:**
- **0 (lower bound):** a fixed shield, the v0.20 model.
- **About 0.06:** thicker material alone. Attenuation is exponential, and a
  crew-rated shield already attenuates by around 10⁷, so twenty times the heat
  adds about a fifth to its thickness.
- **0.67 (upper bound):** a shield face that grows with the core's
  cross-section at fixed power density.

**Mason 2001** (NASA/TM-2001-210593, Table 3), already used in v0.19: surface
Brayton systems at 100 and 500 kWe, 7.4 t and 19.1 t, with shaped crew-rated
shields. Its marginal 29.25 kg/kWe is the system's, shield included.

## Recalibration

**What v0.19 assumed:** a fixed shield, so the whole 29.25 kg/kWe went to the
reactor, conversion, and radiator.

**The shield's share:** with the shield now growing, it adds 3.79 kg/kWe
between Mason's two systems. The reactor and conversion terms give that up, in
FSP's split as before:

```
reactor + conversion = 29.25 − 12.22 (radiator) − 3.79 (shield) = 13.23 kg/kWe
kReactorKgPerKwt     = 0.503 · 13.23 · 0.2627 = 1.75 kg/kWt
kConversionKgPerKwe  = 0.497 · 13.23        = 6.58 kg/kWe
```

- **The check:** the model's marginal mass between 100 and 500 kWe, shield
  included, is 29.26 kg/kWe. Benchmark `mason-2001-surface-brayton-scaling`
  checks it to 0.1%.
- **Against Mason 2001:** the model lands 2.69 t lighter than Mason's systems
  at both 100 and 500 kWe (2.8 t in v0.19). The difference is FSP's buried
  shield against Mason's unburied one.
- **Cross-check not used in calibration:** at Mason 2006's 50 kWe design point
  the model gives 3.0 t against 3.49 t before margin. That is 14% light, 10% in
  v0.19.

## Numbers that moved

1 t/day product, default inputs except as named. Before → after.

| Case | Reactor heat (MWt) | Shield (t) | Fission (t) | Landed (t) | Landings | Payback (day) | Nuclear beats solar above (kW) |
|---|---|---|---|---|---|---|---|
| Equatorial MRE (default) | 3.77 | 1.68 → **4.62** | 30.64 → **29.82** | 51.27 → **50.46** | 1 | 241 | 2.09 → **2.08** |
| MRE, 100 kg/day | 0.38 | 1.68 → **2.16** | 4.59 → **4.70** | 6.70 → **6.81** | 1 | 2,160 → **2,161** | 2.09 → **2.08** |
| MRE, 10 t/day | 37.6 | 1.68 → **9.86** | 290.7 → **261.4** | 496.8 → **467.5** | 6 | 765 → **764** | 2.09 → **2.08** |
| Polar ice | 1.03 | 1.68 → **3.01** | 9.57 → **9.88** | 21.49 → **21.80** | 1 | 237 | 4.54 → **4.50** |
| Polar propellant | 3.27 | 1.68 → **4.40** | 26.81 → **26.28** | 74.30 → **73.77** | 1 | 309 | 4.54 → **4.50** |
| Polar, Sabatier loop | 2.34 | 1.68 → **3.94** | 19.67 → **19.61** | 54.37 → **54.31** | 1 | never | |
| Ilmenite on soil | 3.25 | 1.68 → **4.40** | 26.65 → **26.13** | 94.14 → **93.62** | 2 | 586 → **585** | |
| Ilmenite on basalt | 2.68 | 1.68 → **4.13** | 22.29 → **22.07** | 84.70 → **84.47** | 1 | 246 | |

What the table shows:
- **The shield now scales, and the rest of the system gives up what it grew
  by.** Above about 2 MWt the scaled shield costs less than the reactor and
  conversion mass it replaced. Below that it costs more.
- **A larger plant pays proportionally less.** At 10 t/day the shield is 9.9 t:
  ten times the 1 t/day plant's heat for about twice its shield. The plant lands
  29 t lighter than before.
- **A smaller plant pays a little more.** At 100 kg/day the shield grows by
  0.5 t and the reactor and conversion are lighter by 0.4 t.
- **The crossover barely moves.** It sits at about 2 kW, far below the
  shield's 46 kWe reference, where the shield stays at `MshieldKg`. Only the
  slope changed.

Regression anchors moved deliberately, each marked "v0.21":
- **Landed mass, return, and leverage:** about 20 anchors across v0.2 to v0.16
  that include the fission system.
- **The fixed-seed uncertainty anchor:** 51.236 → 50.392 days.
- **Pinned v0.19 and v0.20 anchors:** they now pin the fission inputs they were
  written for (`V020_FISSION`: v0.19's reactor and conversion and a fixed
  shield), so what they test is unchanged. v0.17's and v0.18's pin a fixed
  shield too.
- **New v0.21 anchors:**
  - Mason 2025's shield ratio, the reference floor, and the default shield.
  - The crossover against the scaled shield.
  - A fixed shield that reproduces v0.20.

Golden vectors were regenerated; the Latin hypercube samples both new inputs.

## In the app

- **Rail:** the power group gains the shield's reference heat and its exponent.
  - The exponent's evidence gives the two shields it is fitted to, its bounds,
    and that it extrapolates more than twenty times past them.
  - The shield mass's evidence now says it is the mass at the reference heat.
- **Power panel:** the nuclear curve bends where the shield starts to grow, the
  crossover comes from the same shield, and a SHIELD line shows its mass
  (`power-slopes.test.ts` checks the curve meets the crossover).
- **Case summary:** the default reads 50.5 t landed.

Screenshot: [the shield exponent's evidence over the power panel](screenshots/shield-power/shield-exponent-evidence.png)

## Verification

- **Regression (v0.21):** the shield law, the default shield and landed mass,
  and the crossover, in both suites.
- **Benchmarks:**
  - `mason-2001-surface-brayton-scaling` checks the marginal mass with the
    shield included, and the 2.69 t gap at both points.
  - `mason-2006-lunar-brayton-50kwe` checks the 50 kWe system within 15%.
  - FSP's radiator benchmark rebuilds the fission mass with the engine's
    shield.
- **Slopes:** `power-slopes.test.ts` rebuilds the engine's nuclear mass and
  aged crossover from the exported shield helpers, and checks that the
  crossover meets a scaled shield.
- **Parity:** 218 golden vectors.
- **Size budget:** the engine is 213,277 B. The ratchet moves from 208 to
  224 KiB for the v0.17–v0.21 fission system: the radiator charged by area,
  the reactor/conversion split, the calibration, the Brayton cycle, and the
  scaled shield.

## Left for later

- **Shield with distance and burial.** The dose, the separation distance, and
  the regolith augmentation are fixed with the reference shield. Mason 2025
  shows the shield halving from 1 to 2 km. A separation input would trade
  shield mass against cable mass. *(v0.25: separation done, with the cable;
  burial stays open. See
  [`model-shield-separation-v025.md`](model-shield-separation-v025.md).)*
- **A shield exponent from a power series.** Two shields from one study set the
  exponent; a NASA shield sized across a power range would pin it.
