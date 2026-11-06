# Fission economy of scale v0.22

This continues the audit trail from
[`model-fission-calibration-v019.md`](model-fission-calibration-v019.md) and
[`model-shield-power-v021.md`](model-shield-power-v021.md).

**What v0.19 left open:** the fission system's reactor and conversion masses
were linear in power, so a 10 MW reactor cost ten times a 1 MW one.

**What v0.21 covered:** the shield, now growing with power, gave part of the
economy of scale.

**What changes:**
- **Reactor and conversion now scale with size.** Their mass grows as reactor
  heat to the power 0.95, fitted to NASA's Brayton systems from 0.1 to 10 MWe.
- **The 10 t/day plant gains most.** It lands 16 t lighter.
- **The default plant** lands 0.2 t lighter.
- **Small plants** get slightly heavier.
- **No landing count changes.**

> **Model boundary:** the reactor and conversion scale by one exponent, fitted
> to three spacecraft systems and applied to surface systems. It is not a
> reactor or converter design: unit size, redundancy, and the number of
> converters are not resolved. TypeScript/Python parity proves the two
> implementations agree, not that the answer is right.

## Why

Since v0.18 the reactor was charged per kW of heat and conversion per kW of
output, both at a fixed rate.
- **What a linear rate misses:** a larger reactor or turbine weighs less per kW
  than a small one. Its vessel, reflector, controls, and casings grow more
  slowly than its output.
- **What NASA's studies show:** Mason 2001's spacecraft Brayton systems fall
  from 26.4 kg/kWe at 100 kWe to 13.3 at 1 MWe and 10.8 at 10 MWe.
- **What v0.21 already covered:** some of that is the fixed shield and
  hardware, which v0.21's shield now follows; the rest is growth slower than
  linear.

## What the model computes

```
scale factor        = (Q / QscaleRefKwt)^(bFissionScale − 1)                           [1]
fission mass        = shield + (kReactorKgPerKwt · Q + kConversionKgPerKwe · P) · scale
                      + kRadiatorKgPerM2 · radiator area                               [kg]
crossover           = the P where β · P = fission mass at P, by bisection              [kW]
```

- **Q and P:** Q is the reactor heat (kWt), P the electrical output (kWe).
  `kReactorKgPerKwt` and `kConversionKgPerKwe` are now the specific masses at
  `QscaleRefKwt`, 1 MWt.
- **The radiator** stays per m² of area, and the shield keeps its own power
  law from v0.21.
- **The crossover** where nuclear beats solar no longer has a closed form, with
  two power laws in the fission mass.
  - **Solver:** `fissionCrossoverKw` bisects on a log scale between 1 W and
    1 TW, 100 steps, in both engines.
  - **Why one root:** solar mass is linear in power and fission mass concave,
    so the gap has a single root.
  - **No crossover:** where solar stays lighter up to 1 TW, the result is null
    and the `beta-le-alpha` caution reads "Solar stays lighter than fission at
    every power level".
- **The power chart** draws `nuclearMassAtKwe`, the engine's fission mass
  curve with the aged shield-free part, and marks `fissionCrossoverKw` on it.
  Both come from the same helper.
- **`power.nuclearSpecificKgPerKw`** is now the specific mass at the plant's
  own power (shield excluded), since it varies with size.
- **New exported helpers:** `fissionScaleFactor`, `nuclearMassAtKwe`, and
  `fissionCrossoverKw`. `pCritKw` and `pCritDynamicKw` remain as the
  fixed-slope closed forms.

| Key | Default | Range | Basis |
|---|---|---|---|
| `bFissionScale` | 0.95 | 0.6–1 | Mason 2001, Table 4: three Brayton systems, 0.1–10 MWe |
| `QscaleRefKwt` | 1,000 kWt | 100–10,000 | Model convention, inside Table 4's span |
| `kReactorKgPerKwt` | 1.75 → **1.84** kg/kWt at 1 MWt | | Recalibrated to Mason 2001's surface marginal mass (below) |
| `kConversionKgPerKwe` | 6.58 → **6.94** kg/kW at 1 MWt | | Recalibrated to Mason 2001's surface marginal mass (below) |

## The source and the fit

**Mason 2001** (NASA/TM-2001-210593, Table 4): spacecraft power and propulsion
systems with the reference 1,300 K Brayton, a 6 kg/m² radiator, and
instrument-rated shielding:

| Power | Specific mass | System mass |
|---|---|---|
| 100 kWe | 26.4 kg/kWe | 2.64 t |
| 1 MWe | 13.3 kg/kWe | 13.3 t |
| 10 MWe | 10.8 kg/kWe | 108 t |

**The fit:** three points fit a fixed mass plus a power law exactly. Here
1.29 t of fixed mass plus a mass growing as power to the 0.9486, which the model
rounds to 0.95. Benchmark `mason-2001-spacecraft-brayton-scaling` checks the
exponent.

**Why spacecraft systems set only the exponent:**
- They carry a lighter shield (instrument-rated, at 2 m) and a shared radiator.
- Surface systems (Table 3) carry crew-rated shields, so the surface data still
  sets the scale.
- The model applies the exponent to its reactor and conversion only. Its
  radiator is sized from physics and stays linear.

## Recalibration

v0.21 set the reactor and conversion so that the model's marginal mass between
Mason 2001's 100 and 500 kWe surface systems was 29.25 kg/kWe, with the shield
included. With the scale factor that marginal changes, so the two are solved
again, in FSP's split, now as specific masses at 1 MWt:
- **Reactor:** 1.75 → **1.84** kg/kWt.
- **Conversion:** 6.58 → **6.94** kg/kWe.
  *(v0.24: 2.19 kg/kWt and 8.24 kg/kWe, after the lighter radiator over the
  gas cooler span; see [`model-brayton-optimum-v024.md`](model-brayton-optimum-v024.md).)*

They are about 5% higher because a power law adds less mass per added kW
than its average per kW. Holding Mason's marginal between 100 and 500 kWe
therefore raises the rates quoted at the reference.

**Checks:**
- **The surface marginal:** the model's marginal mass between those systems,
  shield included, is 29.24 kg/kWe (`mason-2001-surface-brayton-scaling`).
- **Against Mason 2001's surface systems:** the model lands 2.55 t lighter at
  both 100 and 500 kWe (2.69 t in v0.21). The difference is FSP's buried
  shield against Mason's unburied one.
- **Not fitted: the model's mass without its shield.** It grows 9.4 times from
  1 to 10 MWe, against Mason's 8.9: its radiator stays linear.
- **Not fitted: Mason 2006's 50 kWe design point.** The model gives 3.09 t
  against 3.49 t before margin. That is 12% light, 14% in v0.21: a small
  reactor costs more per kW now.

## Numbers that moved

1 t/day product, default inputs except as named. Before → after.

| Case | Reactor heat (MWt) | Scale factor | Fission (t) | Landed (t) | Landings | Payback (day) | Nuclear beats solar above (kW) |
|---|---|---|---|---|---|---|---|
| Equatorial MRE (default) | 3.77 | 0.936 | 29.82 → **29.63** | 50.46 → **50.26** | 1 | 241 | 2.08 → **2.09** |
| MRE, 100 kg/day | 0.38 | 1.050 | 4.70 → **4.84** | 6.81 → **6.95** | 1 | 2,161 → **2,164** | 2.08 → **2.09** |
| MRE, 10 t/day | 37.6 | 0.834 | 261.4 → **245.5** | 467.5 → **451.6** | 6 | 764 | 2.08 → **2.09** |
| Polar ice | 1.03 | 0.999 | 9.88 → **10.06** | 21.80 → **21.99** | 1 | 237 | 4.50 → **4.54** |
| Polar propellant | 3.27 | 0.942 | 26.28 → **26.20** | 73.77 → **73.69** | 1 | 309 | 4.50 → **4.54** |
| Polar, Sabatier loop | 2.34 | 0.958 | 19.61 → **19.68** | 54.31 → **54.38** | 1 | never | |
| Ilmenite on soil | 3.25 | 0.943 | 26.13 → **26.05** | 93.62 → **93.54** | 2 | 585 | |
| Ilmenite on basalt | 2.68 | 0.952 | 22.07 → **22.09** | 84.47 → **84.49** | 1 | 246 | |

What the table shows:
- **Where the gain goes:** to plants larger than the calibration span. A
  37.6 MWt reactor and its converters cost 17% less per kW than at 1 MWt, and
  the 10 t/day plant lands 16 t lighter.
- **Where the default sits:** near break-even, because the recalibration raised
  the reference specific masses by about the factor the default plant gains.
- **Small plants pay a little more.** The 100 kg/day plant's 0.38 MWt reactor
  costs 5% more per kW than at 1 MWt.
- **The crossover barely moves.** At about 2 kW the reactor costs more per kW,
  but the shield dominates there.

Regression anchors moved deliberately, each marked "v0.22":
- **Landed mass, return, and leverage:** about a dozen anchors across v0.2 to
  v0.16.
- **The fixed-seed uncertainty anchor:** 50.392 → 50.189 days.
- **v0.17–v0.21 anchors:** they now pin a linear scale (`bFissionScale: 1`),
  and v0.21's pins its own reactor and conversion masses (`V021_FISSION`), so
  what each tests is unchanged. The direct warning-branch test pins a linear
  scale too, since economy of scale eventually makes a 1,000 kg/kWe converter
  cross solar.
- **New v0.22 anchors:**
  - The scale factor at its reference.
  - The default fission and landed mass.
  - The engine's mass against the curve the chart draws, and the crossover on
    that curve.
  - The 10 t/day plant.
  - A linear scale reproducing v0.21.

Golden vectors were regenerated; the Latin hypercube samples both new inputs.

## In the app

- **Rail:** the power group gains the scaling exponent and its reference heat.
  - The exponent's evidence gives the three NASA systems it is fitted to, and
    that spacecraft systems set only the exponent.
  - The reactor and conversion evidence now says they are quoted at 1 MWt.
- **Power panel:** the nuclear curve and the crossover come from the engine's
  `nuclearMassAtKwe` and `fissionCrossoverKw`, so the curve bends with both
  the shield and the reactor's economy of scale. `power-slopes.test.ts` checks
  the engine's mass and its aged crossover against them.
- **Case summary:** the default reads 50.3 t landed.

Screenshot: [the scaling exponent's evidence over the power panel](screenshots/economy-of-scale/fission-scale-evidence.png)

## Verification

- **Regression (v0.22):** the scale law, the default and 10 t/day plants, and
  the crossover, in both suites.
- **Benchmarks:**
  - `mason-2001-spacecraft-brayton-scaling` (new, calibration): the exponent,
    and the unfitted ratio from 1 to 10 MWe within 8%.
  - `mason-2001-surface-brayton-scaling`: the marginal mass and the 2.55 t gap.
  - `mason-2006-lunar-brayton-50kwe`: the 50 kWe system within 15%.
- **Slopes:** `power-slopes.test.ts` rebuilds the engine's fission mass and
  aged crossover from `nuclearMassAtKwe` and `fissionCrossoverKw`, including
  at a stronger exponent.
- **Parity:** 218 golden vectors.
- **Size budget:** the engine is 215,235 B, within 224 KiB.

## Left for later

- **Economy of scale in the radiator.** The radiator is charged per m² at one
  areal mass; large panels and shared loops would lower it with size.
- **Unit size.** A plant needs whole reactors and converters. The model scales
  one continuous unit, so it does not see the step where a second unit is
  needed, or the redundancy a crewed site would carry.
