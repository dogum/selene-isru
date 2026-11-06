# Brayton pressure ratio at its optimum, and the radiator over the gas span v0.24

This continues the audit trail from
[`model-brayton-cycle-v020.md`](model-brayton-cycle-v020.md), which left two
items open:
- **The pressure ratio was held at Fuller 2010's 2:1** at every temperature, so
  the model understated a converter re-optimized away from the design point.
- **The radiator was sized at the compressor inlet,** the coldest point of the
  heat it rejects, so it erred large.

**What changes:**
- **The cycle runs at its best pressure ratio** for each pair of temperatures.
  `rpBrayton` is retired.
- **A Brayton radiator spans the gas cooler,** from the recuperator exit down
  to the compressor inlet, less a gas cooler approach fitted to Mason 2006's
  radiator flux.

At the defaults the efficiency holds at 26.3% and the plant lands 50.24 t, from
50.26 t. The radiator shrinks from 3,126 to 2,492 m², and the reactor and
conversion masses are recalibrated so Mason 2001's marginal mass still holds.

> **Model boundary:** the converter is an ideal-gas recuperated Brayton cycle
> at the pressure ratio that maximizes its efficiency, with fixed component
> efficiencies. The radiator is a counterflow loop with one fitted approach to
> the gas, not a heat-exchanger or heat-pipe design. A built converter has one
> design pressure ratio; the model gives each case the best converter these
> components make. TypeScript/Python parity proves the two implementations
> agree, not that the answer is right.

## Why

- **The pressure ratio:** at a fixed ratio, the model charged a cooler or warmer
  plant for a converter designed for 1,150/400 K. NASA's studies size each
  converter for its own temperatures.
- **The radiator:** in a recuperated Brayton cycle the gas leaves the
  recuperator well above the compressor inlet: 576 K against 400 K at the
  defaults. A pumped radiator loop collects that heat across the whole span, so
  most of its area runs warmer than the compressor inlet and radiates more per
  m². Sizing it all at 400 K made the model's 50 kWe radiator 158 m², against
  Mason 2006's 140 m² before margin.

## What the model computes

**Pressure ratio.** For each case the engine finds the pressure ratio that
maximizes net work over reactor heat, between 1.05 and 8:
- **Bracket:** a 48-point log-spaced grid picks the best point.
- **Refine:** bisection on the sign of the cycle's analytic slope between that
  point's neighbours.
- **Why a slope, not a golden-section search:** two nearly equal efficiencies
  compare differently in different floating-point implementations, but the
  slope's sign does not. TypeScript and Python land on the same pressure ratio
  to about 1e-15.

**Radiator span.** With the cycle's temperatures from v0.20:

```
gas cooler inlet    T6 = T4 − (T5 − T2)                                      [K]
radiator hot end    Th = T6 − dTGasCoolerK                                    [K]
radiator cold end   Tc = Tsink − dTGasCoolerK                                 [K]
flux                q″ = ηfin · ε · σ · (Th − Tc) / (F(Th) − F(Tc))           [W/m²]
F(T)               = ln((T − a)/(T + a)) / (4a³) − atan(T/a) / (2a³),   a = Tenv
```

- **Where F comes from:** the loop's coolant cools linearly with heat removed.
  Each element radiates σ(T⁴ − Tenv⁴), and integrating 1/(T⁴ − a⁴) over the
  span gives F.
- **Effective temperature:** the flux defines one, (q″/(ηfin·ε·σ) + Tenv⁴)^¼,
  reported as `power.radiatorEffectiveK`: 420 K at the defaults, over a loop
  from 526 K down to 350 K.
- **Stirling:** the radiator stays at `Tsink`. A Stirling rejects its heat at
  the cold end, and v0.23's calibration assumed it.
- **Warning:** `radiator-temperature` now checks the radiator's cold end, not
  `Tsink`. The cold end cannot reach the environment, which would need an
  infinite radiator.
- **Exported helpers:**
  - `braytonCycleAt`: the cycle at a given pressure ratio.
  - `braytonCycle`: now returns its `pressureRatio` and the gas cooler inlet
    (`coolerInletK`).
  - `radiatorTemperaturesK` and `radiatorFluxWPerM2`.
- **Performance:** the fission mass curve now computes efficiency and radiator
  flux once per curve, not once per point, so the crossover's 100-step
  bisection does not repeat the pressure-ratio search.

| Key | Default | Range | Basis |
|---|---|---|---|
| `rpBrayton` | retired | | Now an outcome: 1.87 at the defaults |
| `fPressureLoss` | 0.0515 (was 0.05) | 0–0.2 | **Fitted**: Mason 2006's 26.3% at 1,150/400 K, at the best pressure ratio |
| `dTGasCoolerK` | 50 K | 0–100 | **Fitted**: Mason 2006's 158.6 kWt over 140 m² (48.6 K, rounded up) |
| `kReactorKgPerKwt` | 2.19 (was 1.84) | | Recalibrated: Mason 2001's 29.25 kg/kWe marginal mass, FSP's split |
| `kConversionKgPerKwe` | 8.24 (was 6.94) | | Recalibrated, as above |
| `kConversionStirlingKgPerKwe` | 22.23 (was 23.31) | | Recalibrated: Mason 2001's 36.2 kg/kWe Stirling marginal mass, after the shared reactor |

## The sources

**Mason 2006** (NASA/TM-2006-214120, Table 1), already used in v0.19, v0.20, and
v0.23. Its 50 kWe refractory-reactor Brayton design point:
- 213 kWt reactor, 54.4 kWe converter output
- 1,150/400 K, 26.3% converter efficiency
- 154 m² main radiator with 10% area margin

The radiator rejects 158.6 kWt over 140 m² before margin: **1,133 W/m²**.

**Fuller 2010** (NASA/CR-2010-215673), v0.20's component efficiencies,
unchanged. Its 2:1 pressure ratio is a design choice for one converter at
850/375 K. At those temperatures the model's optimum is 1.64: Fuller's design
point trades efficiency for compact turbomachinery, which the model does not
charge.

## Calibration and cross-checks

- **Two fitted values, both at Mason 2006's design point:**
  - The loop pressure loss, 5.15%, gives 26.30% at the best pressure ratio.
  - The gas cooler approach gives Mason's 1,133 W/m² at 48.6 K; the rounded
    50 K gives 1,113 W/m² (−1.8%).
- **Mason 2006's stainless-steel point, not fitted:** 16.62% at 900/380 K,
  against Mason's 15.6% (+6.5%). v0.20 gave 15.47% (−0.8%). The best pressure
  ratio there is 1.67, not 2: a converter re-optimized for the cooler reactor
  does better than v0.20's 2:1 cycle. Mason's own converter at that point is
  less efficient than that.
- **The optimum radiator temperature:**

  | Hot end | v0.20 | **v0.24** | Mason 2006 |
  |---|---|---|---|
  | 1,150 K | ~420 K | **~414 K** | 400 K |
  | 900 K | ~360 K | **~374 K** | 380 K |

  Both move toward Mason's.
- **The 50 kWe system, not used in calibration:**
  - **Radiator:** 126 m² against Mason's 140 m² before margin. The fit is on
    flux, and the model's system rejects less heat. Mason's converter makes
    54.4 kWe to deliver 50 kWe, after transmission and auxiliary loads; the
    model's 50 kWe is converter output.
  - **System:** 3.11 t against Mason's 3.49 t before margin (11% light; 12% in
    v0.22 and v0.23).
- **Mason 2001's marginal masses hold:**
  - **Brayton:** 29.25 kg/kWe from 100 to 500 kWe, to 0.1%. The model now lands
    2.52 t lighter at both powers, from 2.55 t.
  - **Stirling:** 36.2 kg/kWe at the lithium Stirling point. The Stirling
    conversion mass moves to 22.23 kg/kWe, within 2% of FSP's 22.6
    (benchmark `mason-2001-stirling-scaling`).

## Numbers that moved

1 t/day product, default inputs except as named. v0.23 → v0.24.

| Case | Efficiency | Pressure ratio | Radiator span (K) | Radiator (m²) | Fission (t) | Landed (t) | Landings |
|---|---|---|---|---|---|---|---|
| Equatorial MRE (default, 400 K) | 26.27% → **26.30%** | 2 → **1.87** | 400 → **526–350** | 3,126 → **2,492** | 29.63 → **29.61** | 50.26 → **50.24** | 1 |
| MRE, 100 kg/day | 26.27% → **26.30%** | 2 → **1.87** | | 314 → **251** | 4.84 → **4.86** | 6.95 → **6.98** | 1 |
| MRE, 10 t/day | 26.27% → **26.30%** | 2 → **1.87** | | 31,193 → **24,864** | 245.5 → **242.6** | 451.6 → **448.7** | 6 |
| Polar ice | 26.27% → **26.30%** | | | 852 → **679** | 10.06 → **10.10** | 21.99 → **22.02** | 1 |
| Polar propellant | 26.27% → **26.30%** | | | 2,713 → **2,163** | 26.20 → **26.19** | 73.69 → **73.68** | 1 |
| Ilmenite on soil | 26.27% → **26.30%** | | | 2,696 → **2,149** | 26.05 → **26.04** | 93.54 → **93.53** | 2 |
| Radiator at 380 K | 28.65% → **28.58%** | 2 → **1.92** | 380 → **507–330** | 3,550 → **2,837** | 30.66 → **30.26** | 51.29 → **50.89** | 1 |
| Radiator at 450 K | 20.08% → **20.64%** | 2 → **1.75** | 450 → **572–400** | 2,592 → **2,039** | 29.80 → **30.14** | 50.43 → **50.78** | 1 |
| Radiator at 500 K | 13.55% → **14.98%** | 2 → **1.65** | 500 → **617–450** | 2,632 → **1,954** | 34.32 → **33.71** | 54.95 → **54.34** | 1 |
| Radiator at 570 K | 3.77% → **6.92%** | 2 → **1.54** | 570 → **680–520** | 6,062 → **2,759** | 79.05 → **52.40** | 99.68 → **73.03** | 2 → **1** |
| Hot end 900 K, radiator 380 K | 15.47% → **16.62%** | 2 → **1.67** | 380 → **462–330** | 7,791 → **6,830** | 52.64 → **51.19** | 73.27 → **71.82** | 1 |
| Hot end 1,300 K | 31.70% → **31.58%** | 2 → **2.01** | 400 → **552–350** | 2,400 → **1,763** | 25.54 → **25.35** | 46.17 → **45.99** | 1 |
| Stirling, 1,050/500 K | 30.90% | | 500 | 922 | 36.58 → **36.57** | 57.21 → **57.20** | 1 |

What the table shows:
- **The defaults barely move.** The radiator is 20% smaller and 2.4 t lighter,
  but Mason 2001's marginal mass is a whole-system figure, so the recalibrated
  reactor and conversion take the mass back. The default lands 20 kg lighter.
- **Small plants get slightly heavier, large ones lighter.** The recalibration
  moves mass from the radiator, which is linear in power, into the reactor and
  conversion, which gain an economy of scale. A 10 t/day plant lands 2.9 t
  lighter; a 100 kg/day plant 30 kg heavier.
- **Away from the design point the optimum pressure ratio pays.** A warm
  radiator, where 2:1 was worst, gains most: at 570 K efficiency nearly doubles
  and the plant drops a landing. At 380 K and 1,300 K the optimum is close to
  2:1, and only the radiator moves.
- **A 1,300 K hot end loses a little efficiency:** 31.70% → 31.58%. The refitted
  pressure loss is slightly larger, and the optimum there is 2.01, so it gains
  almost nothing from re-optimizing.
- **Stirling against Brayton:** v0.23's 7 t gap at 1 t/day stays. At 10 t/day
  it widens to 81 t (529.5 against 448.7 t).
- **Nuclear still beats solar** in every reference case. The crossover stays at
  2.09 kW at the equator and moves from 4.54 to 4.55 kW at the pole.

Regression anchors moved deliberately, each marked "v0.24":
- **The fixed-seed uncertainty anchor:** 50.189 → 50.160 days.
- **The v0.16, v0.19, v0.20, v0.21, and v0.22 fission anchors:**
  - The default plant, the 10 t/day plant, the crossover, and the sized plants.
  - The pinned v0.20 and v0.21 masses on the new cycle and radiator.
  - Mason's two efficiencies: 26.27% → 26.30% and 15.47% → 16.62%.
  - The optimum: 420 K → 414 K.
  - The 570 K case now costs 1.8 times the optimum, not 3 times.
- **The v0.17 and v0.18 anchors now pin a Stirling at 0.55 of Carnot,** with
  their old masses. That reproduces their model exactly: 27.5% at 1,200/600 K
  with the radiator at the sink temperature. FSP's radiator benchmark is pinned
  the same way. These anchors had pinned `rpBrayton`.
- **New v0.24 anchors in both suites:**
  - the optimum pressure ratio and the radiator span
  - the radiator's heat balance against its flux
  - the 414 K and 374 K optima
  - the Stirling radiator at its cold end
  - the radiator-temperature alarm

Golden vectors were regenerated. The Latin hypercube samples `dTGasCoolerK` in
place of `rpBrayton`; the parity set stays at 219 vectors.

## In the app

- **Rail:**
  - The power group shows "Brayton gas cooler approach" in place of the
    compressor pressure ratio.
  - It hides under Stirling, as the other Brayton inputs do.
- **Evidence:**
  - The gas cooler approach says it is fitted, and to what.
  - The pressure loss says it is refitted at the best pressure ratio.
  - The sink temperature evidence gives the optimum near 414 K, the no-net-work
    limit near 625 K, and the radiator's span.
- **Power trade panel:** the RADIATOR line adds the effective temperature.
- **Saved cases, files, and links:** `rpBrayton` is dropped
  (`src/lib/legacyParams.ts`), and the case takes the optimum. At the default
  temperatures that gives the same 26.3%.

Screenshot: [the gas cooler approach's evidence over the power panel](screenshots/brayton-optimum/gas-cooler-evidence.png)

## Verification

- **Regression (v0.24):** in both suites.
- **Benchmarks:**
  - `mason-2006-lunar-brayton-50kwe` checks the radiator flux against Mason's
    1,133 W/m², within 2%.
  - `mason-2001-surface-brayton-scaling` still checks the slope.
  - `mason-2001-stirling-scaling` still checks the Stirling marginal mass and
    FSP's specific mass.
- **App:**
  - `legacy-params.test.ts` drops `rpBrayton` from saved cases and links.
  - `fission-converter.test.tsx` checks the gas cooler approach shows under
    Brayton and hides, inert, under Stirling.
- **Parity:** 219 golden vectors.
- **Size budget:** the engine is 221,840 B, within 224 KiB.

## Left for later

- **A converter designed once.** The model re-optimizes the pressure ratio for
  every case, as a fresh design would. A plant's converter is built for one
  point and runs off-design when its temperatures change; a design-point input
  would separate the two.
- **The gas cooler from its effectiveness.** The approach is one fitted
  temperature difference. A gas cooler sized by its effectiveness and mass would
  trade gas cooler mass against radiator area.
- **Radiator areal mass with temperature.** The radiator now runs to 526 K at
  the defaults. NASA's heat-pipe radiators above about 400 K need different
  working fluids, which `kRadiatorKgPerM2` does not see.
