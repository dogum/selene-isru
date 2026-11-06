# Megawatt-class fission calibration v0.19

This continues the audit trail from
[`model-radiator-mass-v017.md`](model-radiator-mass-v017.md) and
[`model-reactor-per-kwt-v018.md`](model-reactor-per-kwt-v018.md). Both left the
same item open: the fission system's temperatures, efficiency, shield, and
mass scale were uncited.

**What changes:** the default 1 t/day plant's fission system lands 0.6 t
lighter, and every nuclear case moves by about 1%. No landing count changes.
The default design point is now NASA's, and the default radiator runs at
400 K instead of 600 K, so it is six times the area.

> **Model boundary:** the fission system is a shield, a reactor per kW of heat,
> conversion per kW of output, and a radiator per m², set to two NASA Glenn
> studies and one NASA design. Its efficiency is a fixed fraction of Carnot,
> which a real Brayton converter is not. It is not a reactor design.
> TypeScript/Python parity proves the two implementations agree, not that the
> answer is right.

## Why

Since v0.2 the fission system ran from a 1,200 K hot end to a 600 K radiator
at 55% of Carnot, with a 1.5 t shield, all marked "spec".
- **v0.17** sourced the radiator's areal mass.
- **v0.18** split the core into reactor and conversion, in NASA FSP's
  proportion.
- **What was still uncited:** the temperatures, the efficiency, the shield, and
  the overall scale. NASA's 40 kWe FSP design was too small to set them for a
  megawatt plant.

## The sources

**Mason 2006** (NASA/TM-2006-214120, Table 1): a 50 kWe lunar surface system.
The lightest option is a refractory reactor with a direct Brayton converter
and an excavation shield:
- **Temperatures:** 1,150 K hot end and 400 K cold end.
- **Efficiency:** 26.3%, from a 213 kWt reactor.
- **Radiator:** 154 m², including a 10% area margin.
- **Mass:** 4,193 kg, including a 20% mass margin.
- **Optimum:** the study optimizes the cold end for minimum mass and finds
  380–400 K for Brayton.

**Mason 2001** (NASA/TM-2001-210593, Table 3): surface Brayton systems for
outposts, from 10 to 500 kWe. The reference design uses:
- 1,300 K, a 6 kg/m² radiator, and 200 Vac distribution
- a shaped, crew-rated shield

They weigh 74.0 kg/kWe at 100 kWe and 38.2 kg/kWe at 500 kWe: 7.4 t and
19.1 t. Between them the system adds **29.25 kg per kWe**, the closest
published marginal mass to the megawatt plants this model sizes.

**NASA FSP** (Mason, Poston & Qualls 2008, Table II), already used in v0.17
and v0.18:
- **Shield:** 1,676 kg, for a reactor emplaced with regolith augmentation,
  under 5 rem/yr at 100 m.
- **Split:** the reactor is 913 of the 1,816 kg of reactor, conversion, and
  power management.

## What changed

| Key | Before | After | Basis |
|---|---|---|---|
| `Tsource` | 1,200 K | **1,150 K** | Mason 2006: Brayton hot end |
| `Tsink` | 600 K | **400 K** | Mason 2006: Brayton cold end at minimum mass |
| `etaMech` | 0.55 | **0.403** | Mason 2006: 26.3% at 1,150/400 K |
| `MshieldKg` | 1,500 kg | **1,676 kg** | NASA FSP's emplaced shield |
| `kReactorKgPerKwt` | 3.87 kg/kWt | **2.25 kg/kWt** | Mason 2001's slope, FSP's split |
| `kConversionKgPerKwe` | 13.93 kg/kW | **8.47 kg/kW** | Mason 2001's slope, FSP's split |

**How the scale was set.** At the new design point the 400 K radiator weighs
12.2 kg/kWe. The reactor and conversion terms carry the rest of Mason 2001's
29.25 kg/kWe, split as FSP's. The whole slope is 29.24 kg/kWe, against 29.98
before, so the megawatt-scale mass barely changes. What changes is where it
goes:
- **Radiator:** 2 → 12 t.
- **Reactor and conversion:** 28 → 17 t.

## Calibration and cross-checks

- **The slope** (calibration benchmark `mason-2001-surface-brayton-scaling`):
  the default slope reproduces Mason 2001's 29.25 kg/kWe to 0.1%.
- **The intercept:** Mason's line extrapolates to 4.5 t at zero power, for a
  shield sized at 100–400 m with no burial. The model keeps FSP's buried
  1.7 t shield, so it lands 2.8 t lighter than Mason 2001 at 100 and 500 kWe.
  Mason 2006 finds an on-board crew shield about four times the excavation
  shield, so this is the gap between the two approaches.
- **The design point** (documentation-only benchmark
  `mason-2006-lunar-brayton-50kwe`): the defaults reproduce its 26.3%. As a
  check not used in calibration, the model at 50 kWe gives:

  | | Model | Mason 2006, before margin |
  |---|---|---|
  | Radiator | 158 m² | 140 m² |
  | System | 3.14 t | 3.49 t (10% heavier) |

- **FSP's own point:** at 40 kWe the model gives 2.85 t against FSP's 4.1 t. A
  40 kWe Stirling unit is heavier per kW than the Brayton scaling.

**A disclosed limit: the optimum radiator temperature.**
- **The source:** Mason 2006 finds the Brayton minimum mass at a 400 K cold
  end.
- **The model:** its efficiency is a fixed fraction of Carnot, so a warmer
  cold end costs it too little efficiency. Its own lightest radiator runs near
  570 K: 24.6 t of fission system against 30.6 t at 400 K.
- **Why:** a real Brayton cycle loses efficiency much faster as its cold end
  warms, because the compressor's work grows.
- **What to make of it:** the defaults sit at NASA's design point, not at the
  model's optimum. A sweep of the radiator temperature overstates what a warmer
  radiator saves. The backlog carries the converter model that would fix it. *(v0.20: fixed by
  the Brayton cycle; see [`model-brayton-cycle-v020.md`](model-brayton-cycle-v020.md).)*

## Numbers that moved

1 t/day product, default inputs except as named. Before → after.

| Case | Radiator (m²) | Fission (t) | Landed (t) | Landings | Payback (day) | Nuclear beats solar above (kW) |
|---|---|---|---|---|---|---|
| Equatorial MRE (default) | 507 → **3,124** | 31.18 → **30.63** | 51.81 → **51.26** | 1 | 241 | 1.87 → **2.09** |
| MRE, 100 kg/day | 51 → **312** | 4.48 → **4.59** | 6.60 → **6.70** | 1 | 2,158 → **2,160** | 1.87 → **2.09** |
| MRE, 10 t/day | 5,057 → **30,900** | 297.7 → **290.5** | 503.8 → **496.6** | 6 | 765 | 1.87 → **2.09** |
| Polar ice | 138 → **850** | 9.59 → **9.57** | 21.52 → **21.49** | 1 | 237 | 4.07 → **4.54** |
| Polar propellant | 440 → **2,707** | 27.26 → **26.80** | 74.75 → **74.29** | 1 | 309 | 4.07 → **4.54** |
| Polar, Sabatier loop | 315 → **1,945** | 19.94 → **19.67** | 54.64 → **54.37** | 1 | never | |
| Ilmenite on soil | 437 → **2,690** | 27.09 → **26.64** | 94.59 → **94.13** | 2 | 586 | |
| Ilmenite on basalt | 361 → **2,220** | 22.63 → **22.28** | 85.03 → **84.69** | 1 | 246 | |
| NASA polar propellant case | 31 → **190** | 3.34 → **3.47** | 6.59 → **6.72** | 1 | 6,530 → **6,548** | |

What the table shows:
- **Large plants get slightly lighter, small ones slightly heavier.** The slope
  fell by 0.7 kg/kWe and the shield rose by 176 kg. The crossover is about
  40 kWe.
- **The radiator is now a sixth of the fission system.** At 400 K the default
  plant needs 3,100 m² of radiator, 12 t. NASA's lunar designs size their
  radiators at these temperatures too.
- **Nuclear still beats solar** in every reference case. The crossover rises
  to 2.1 kW at the equator and 4.5 kW at the pole.

Regression anchors moved deliberately, each marked "v0.19":
- **Landed mass, return, and leverage:** about 18 anchors across v0.2 to v0.16
  that include the fission system.
- **The fixed-seed uncertainty anchor:** 51.783 → 51.223 days.
- **v0.17 and v0.18:** those anchors now pin the fission inputs they were
  written for (`V018_FISSION`), so what they test is unchanged.
- **New v0.19 anchors:** the design point, the radiator, the slope, and the
  model's 570 K optimum as a disclosed limit.

Golden vectors were regenerated.

## In the app

- **Evidence:** each calibrated input cites its source and says what it covers.
  - The radiator temperature's evidence says the model's own optimum overstates
    what a warmer radiator saves.
  - The shield's evidence says a megawatt reactor needs a thicker shield than
    FSP's.
- **Scene:** the radiator wings' reference area moves from 150 to 1,000 m², so
  the default's larger radiator draws at about its old size instead of
  pinning at the cap (`bindings.ts`, tested).
- **Case summary:** the default reads 51.3 t landed.

Screenshot: [the radiator temperature's evidence over the power panel](screenshots/fission-calibration/radiator-temperature-evidence.png)

## Verification

- **Benchmarks:** `mason-2001-surface-brayton-scaling` and
  `mason-2006-lunar-brayton-50kwe`, in both suites. FSP's split check from
  v0.18 still holds at the new design point.
- **Regression:** v0.19 anchors, and the moved earlier ones, in both suites.
- **Parity:** 218 golden vectors.
- **Size budget:** the engine is 208,455 B, within 208 KiB.

## Left for later

- **Brayton efficiency from the cycle.** Efficiency from the temperature
  ratio and component efficiencies, not a fixed fraction of Carnot, would move
  the model's optimum to Mason's 400 K. It would also make Brayton and
  Stirling distinct. *(v0.20: done for Brayton; the optimum moves to
  about 420 K, and Stirling stays on the backlog. See
  [`model-brayton-cycle-v020.md`](model-brayton-cycle-v020.md).)*
- **Shield mass with power.** One shield mass serves every power level; a
  megawatt reactor needs a thicker shield at the same dose and distance.
- **Economy of scale.** The slope is linear. Mason 2001 shows specific mass
  falling from 74 to 38 kg/kWe between 100 and 500 kWe, mostly through the
  shield and fixed hardware; a power law would follow it.
