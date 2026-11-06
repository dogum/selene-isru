# Fission efficiency from the Brayton cycle v0.20

This continues the audit trail from
[`model-fission-calibration-v019.md`](model-fission-calibration-v019.md), which
left one limit disclosed: the fission efficiency was a fixed fraction of Carnot.
A warmer radiator cost too little efficiency, so the model's own lightest
radiator ran near 570 K against NASA's 400 K.

**What changes:** the fission efficiency now comes from a recuperated closed
Brayton cycle. At the defaults nothing moves by more than 0.05%. Away from them
it does:
- **A warm radiator now costs its work.** The model's lightest radiator moves
  from 570 K to 420 K.
- **A cooler hot end costs more.** At Mason 2006's 900/380 K point the model
  gives 15.5%, against Mason's 15.6%; the old model gave 23.3%.

> **Model boundary:** the converter is an ideal-gas recuperated Brayton cycle
> with fixed component efficiencies and one fitted pressure loss. It is not a
> turbomachinery design: the pressure ratio is held, not optimized, and
> windage, bearings, and heat-exchanger sizing are lumped into fixed
> efficiencies. TypeScript/Python parity proves the two implementations agree,
> not that the answer is right.

## Why

Since v0.2 the conversion efficiency was `(1 − Tsink / Tsource) · etaMech`.
- **What v0.19 found:** Mason 2006 optimizes a Brayton system's cold end and
  finds its minimum mass at 380–400 K. The model, whose efficiency fell only
  with Carnot, found 570 K.
- **Why:** in a real Brayton cycle the compressor's work rises with its inlet
  temperature while the turbine's does not. Net work falls much faster than
  Carnot as the cold end warms, and reaches zero well before the cold end
  meets the hot end.

## What the model computes

On an ideal monatomic gas (helium–xenon, γ = 5/3), with k = (γ − 1)/γ:

```
compressor exit   T2 = Tsink · (1 + (rp^k − 1) / ηc)                                [K]
turbine exit      T4 = Tsource · (1 − ηt · (1 − (rp · (1 − ΔP))^−k))                  [K]
heater inlet      T5 = T2 + ε · max(0, T4 − T2)                                     [K]
net work          w  = (Tsource − T4) − (T2 − Tsink)                     [K, per unit flow · cp]
reactor heat      q  = Tsource − T5                                      [K, per unit flow · cp]
efficiency        η  = w / q · ηalt                                                 [1]
```

- **Where it is used:** η replaces the old efficiency everywhere. It sets the
  reactor heat, the waste heat the radiator sizes on, and so the fission slope
  and the solar/nuclear crossover.
- **No net work:** where w or q is not positive, η falls to the old 1e-9 floor
  and a new `fission-no-net-work` warning says why: an alarm when the plant
  runs on fission, a caution when solar carries the load. With the default components
  this happens when the hot end is under about 1.9 times the cold end, for
  example a radiator above about 600 K behind the default 1,150 K reactor.
- **Exported helpers:** `fissionEfficiency` is unchanged in signature, and the
  engine also exports `braytonCycle` with the cycle's temperatures.
- **The radiator** is still sized at `Tsink`, the compressor inlet. The gas
  rejects its heat from the recuperator exit down to that, so the model's
  radiator is the coldest it could be, and errs large.

| Key | Default | Range | Basis |
|---|---|---|---|
| `rpBrayton` | 2.0 | 1.3–4 | Fuller 2010: design pressure ratio 2:1 |
| `etaCompressor` | 0.84 | 0.6–0.92 | Fuller 2010: compressor efficiency |
| `etaTurbine` | 0.87 | 0.6–0.95 | Fuller 2010: turbine efficiency |
| `epsRecuperator` | 0.90 | 0–0.98 | Fuller 2010: recuperator effectiveness |
| `fPressureLoss` | 0.05 | 0–0.2 | **Fitted** to Mason 2006's 26.3% at 1,150/400 K |
| `etaAlternator` | 0.931 | 0.8–0.99 | Fuller 2010: 98% generator × 95% power conversion |
| `etaMech` | retired | | |
| `gammaHeXe` (physical) | 5/3 | | Monatomic ideal gas; Mason 2006's HeXe working fluid |

## The sources

**Fuller 2010** (NASA/CR-2010-215673): Barber-Nichols' Phase I design of a
closed Brayton converter for NASA's fission surface power project, 12 kWe from
an 850 K NaK loop to a 375 K water loop. Its design decisions:
- pressure ratio 2:1
- compressor efficiency 84%, turbine 87%
- recuperator effectiveness 90%
- generator 98%, and its cycle spreadsheet's power conversion 95%

**Mason 2006** (NASA/TM-2006-214120, Table 1), already used in v0.19: two
Brayton design points for a 50 kWe lunar system.
- **Refractory reactor:** 1,150/400 K, 26.3% converter efficiency.
- **Stainless-steel reactor:** 900/380 K, 15.6%.
- **Optimum:** the minimum-mass cold end is 380 K for the 900 K reactor, and
  the 1,150 K design sits at 400 K. Its radiator area alone has a minimum at a
  warmer cold end (its Fig. 7b).

## Calibration and cross-checks

- **One fitted value.** Fuller's components alone give 30.2% at 1,150/400 K
  with a lossless loop. A 5% loop pressure loss brings it to 26.27%, against
  Mason's 26.3%. Nothing else was tuned.
- **The second Mason point, not fitted:** 15.47% at 900/380 K, against 15.6%
  (−0.8%). The fixed fraction of Carnot gave 23.3% here (+49%).
- **The optimum radiator temperature:**

  | Hot end | Model, v0.19 | Model, v0.20 | Mason 2006 |
  |---|---|---|---|
  | 1,150 K | ~570 K | **~420 K** | 400 K |
  | 900 K | | **~360 K** | 380 K |

- **The radiator's own minimum:** at the defaults the radiator is smallest
  near 470 K (2,540 m²) and grows again above it as efficiency falls, the
  shape of Mason's Fig. 7b.
- **The v0.19 calibration holds.** The reactor and conversion masses were set
  at the 26.3% design point, which the cycle reproduces, so the default slope
  stays 29.24 kg/kWe and benchmark `mason-2001-surface-brayton-scaling` still
  passes to 0.1%.

## Numbers that moved

1 t/day product, default inputs except as named. Before → after.

| Case | Efficiency | Radiator (m²) | Fission (t) | Landed (t) | Landings |
|---|---|---|---|---|---|
| Equatorial MRE (default, 400 K) | 26.28% → **26.27%** | 3,124 → **3,126** | 30.63 → **30.64** | 51.26 → **51.27** | 1 |
| Radiator at 380 K | 27.0% → **28.7%** | 3,859 → **3,550** | 33.25 → **31.57** | 53.88 → **52.21** | 1 |
| Radiator at 420 K | 25.6% → **23.8%** | 2,583 → **2,838** | 28.77 → **30.39** | 49.40 → **51.02** | 1 |
| Radiator at 450 K | 24.5% → **20.1%** | 2,004 → **2,592** | 26.90 → **31.19** | 47.53 → **51.82** | 1 |
| Radiator at 500 K | 22.8% → **13.6%** | 1,398 → **2,632** | 25.25 → **36.69** | 45.88 → **57.32** | 1 |
| Radiator at 570 K | 20.3% → **3.8%** | 932 → **6,062** | 24.63 → **92.55** | 45.26 → **113.18** | 1 → **2** |
| Hot end 900 K, radiator 380 K | 23.3% → **15.5%** | 4,698 → **7,791** | 37.81 → **54.61** | 58.44 → **75.24** | 1 |
| Hot end 1,300 K | 27.9% → **31.7%** | 2,878 → **2,400** | 29.18 → **26.37** | 49.82 → **47.01** | 1 |
| Polar ice | 26.28% → **26.27%** | 852 | 9.57 | 21.49 | 1 |

What the table shows:
- **The defaults hold.** The cycle reproduces the 26.3% design point, so every
  reference case moves by under 0.05%.
- **A warmer radiator no longer wins.** At 500 K the old model saved 5 t; the
  cycle charges 6 t more. At 570 K the cycle makes almost no net work and the
  plant needs two landings.
- **The hot end matters more.** A 900 K stainless-steel reactor costs 24 t more
  than the 1,150 K default, against 7 t before. A 1,300 K reactor saves 4.3 t.
- **Nuclear still beats solar** in every reference case; the crossover stays
  at 2.1 kW at the equator and 4.5 kW at the pole.

Regression anchors moved deliberately, each marked "v0.20":
- **The fixed-seed uncertainty anchor:** 51.223 → 51.236 days.
- **Retired with `etaMech`:** v0.17's 400 K case values, v0.18's 520 K optimum,
  and v0.19's 570 K disclosed limit. They pinned the fixed fraction of Carnot.
- **Kept:** v0.17's and v0.18's design-point anchors still pin their 27.5%
  efficiency at 1,200/600 K, now through a near-ideal cycle and the alternator
  efficiency that reaches it. FSP's radiator benchmark pins FSP's 27.4% the
  same way.
- **New v0.20 anchors:** both Mason design points, the 420 K optimum, and the
  no-net-work alarm.

Golden vectors were regenerated; the Latin hypercube samples the six new
inputs.

## In the app

- **Rail:** the power group shows the six cycle inputs in place of
  "Thermal mechanical efficiency". Each cites Fuller 2010, except the pressure
  loss, whose evidence says it is the one fitted value.
- **Radiator temperature evidence:** it now says the model's optimum is near
  420 K, the cycle makes no net work above about 600 K at the default hot end,
  and the radiator is sized at the compressor inlet, so it errs large.
- **Polar nuclear station:** the inspector offers the recuperator as a control.
- **Saved cases, files, and links:** `etaMech` has no equivalent among the
  cycle's inputs, so it is dropped and the case takes the cycle defaults
  (`src/lib/legacyParams.ts`). At the default temperatures that reproduces the
  old default's 26.3%.

Screenshot: [the cycle inputs and the pressure loss's evidence over the power panel](screenshots/brayton-cycle/brayton-cycle-inputs.png)

## Verification

- **Regression (v0.20):** both Mason points, the 420 K optimum, and the alarm,
  in both suites.
- **Benchmarks:** `mason-2006-lunar-brayton-50kwe` still checks the default's
  26.3%; `mason-2001-surface-brayton-scaling` still checks the slope; FSP's
  radiator check pins its efficiency through the cycle.
- **App:** `legacy-params.test.ts` drops `etaMech` from saved cases and links.
- **Parity:** 218 golden vectors.
- **Size budget:** the engine is 211,415 B, within 208 KiB.

## Left for later

- **Stirling as a converter choice.** The cycle is Brayton only. A Stirling
  option, Mason 2006's other lunar converter, would carry its own efficiency,
  temperatures, and mass.
- **The pressure ratio at its optimum.** Each temperature ratio has a best
  pressure ratio; the model holds Fuller's 2:1, so it understates a
  re-optimized converter away from the design point.
- **The radiator at its mean temperature.** The gas rejects heat from the
  recuperator exit down to the compressor inlet; sizing the radiator over that
  span, not at its coldest point, would shrink it.
