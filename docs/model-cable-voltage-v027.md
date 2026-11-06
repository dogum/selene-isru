# The cable's voltage designed for its power v0.27

This continues the audit trail from
[`model-shield-separation-v025.md`](model-shield-separation-v025.md) and
[`model-shield-burial-v026.md`](model-shield-burial-v026.md). v0.25 ran the
cable to the outpost at a fixed 3 kV, the voltage NASA's current design picks
for 40 kWe. A megawatt plant at 3 kV needs about 2 t of aluminium per km, so the
model overcharged large plants for their cable and placed their reactors too
close to the outpost.

**What changes:** the cable is designed for the power it carries.
- **The design:** conductor, FEP insulation, and jacket, from NASA's
  transmission studies.
- **The voltage:** whichever minimizes their mass, up to a cap of 8 kV.
- **At the defaults:**
  - The cable falls from 2,343 to 795 kg.
  - The recalibration takes most of that back: the plant lands 50.42 t, from
    50.40 t.
  - The surface reactor's best separation moves from about 1.15 km to about
    1.75 km.
  - A buried reactor no longer beats it except at 10 t/day.

> **Model boundary:** the cable is a bipolar DC line of two aluminium conductors
> with FEP insulation at one design stress, inside one jacket. Partial discharge,
> micrometeoroid protection, cable temperature, and the converters at each end
> are not designed. The 8 kV cap is the highest voltage NASA's FSP studies
> select, not a demonstrated limit. TypeScript/Python parity proves the two
> implementations agree, not that the answer is right.

## Why

- **What v0.25 did:** charged the cable's conductor at a fixed 3 kV, sized to
  lose 1.67% per km.
- **What that costs at scale:**
  - At 40 kWe the conductor is small, so the fixed voltage cost little.
  - At 1 MW, 3 kV needs 375 mm² conductors: 2.0 t per km of aluminium, and
    20.7 t for a 10 t/day plant's kilometre.
- **What NASA does instead:**
  - **Barth & Pike 2022** raise the voltage until the insulation it needs
    outweighs the conductor it saves.
  - **Mason 2001** finds 5,000 Vac moves the optimum separation from 100–400 m
    out to 2.8–5 km.

## What the model computes

For a sent power P, a loss per km f, and a line voltage V (each conductor at
V/2 to ground):

```
conductor area   A  = max(A16AWG, 2 ρAl P / (V² f))                           [m²]
insulation       t  = (V / 2) / E,   E = 4.4 kV/mm                            [m]
per km           m  = 2 A ρAl + 2π (2 r t + t²) ρFEP + π (2 R tj + tj²) ρFEP   [kg/m], × 1,000
                 r  = √(A/π),  R = 2 (r + t),  tj = 0.6 mm
voltage          V  = the V ≤ VCableMaxV that minimizes m                      [V]
cable            = d · (kCableKgPerKm + m)                                     [kg]
```

- **Finding the voltage:**
  - A higher voltage shrinks the conductor as 1/V² and thickens the insulation
    as V.
  - The slope of m against V has one sign change, so the engine bisects on its
    sign, as v0.24 does for the pressure ratio, so TypeScript and Python land
    on the same voltage within the parity tolerance.
  - Above the voltage where the conductor reaches 16 AWG, more voltage only
    adds insulation, so the search stops there.
- **What the result does at scale:** the conductor no longer grows linearly
  with power, so the cable leaves the fission specific mass and the mass curve
  charges it whole at each output. The power chart and the crossover still come
  from one curve.
- **New result field:** `power.cableVoltageV`.
- **Exported helpers:** `cableDesign` (voltage, conductor area, insulation, and
  mass per km by part) replaces `cableConductorKgPerKwKm`.

| Key | Default | Range | Basis |
|---|---|---|---|
| `VCableMaxV` | 8,000 V | 1–30 kV | Barth & Pike 2022: a 40 kW cable is lightest at ±4,000 VDC; the highest NASA's FSP studies select |
| `VCableV` (physical) | retired | | was a fixed 3,000 V |
| `kCableKgPerKm` | **312** kg/km (was 303) | 0–1,000 | Refitted: Mason 2025's 385 kg/km less the 74 kg/km the model designs for 40 kWe |
| `kReactorKgPerKwt` | **2.16** (was 1.94) | | Recalibrated: Mason 2001's 29.25 kg/kWe |
| `kConversionKgPerKwe` | **8.14** (was 7.31) | | Recalibrated, as above |
| `kConversionStirlingKgPerKwe` | **21.96** (was 21.06) | | Recalibrated: Mason 2001's 36.2 kg/kWe Stirling |
| `EInsulationVPerM` (physical) | 4.4 kV/mm | | Barth & Pike: FEP at five times its minimum breakdown thickness |
| `tCableJacketM` (physical) | 0.6 mm | | Barth & Pike: FEP case around the cable assembly |
| `AConductorMinM2` (physical) | 1.31 mm² | | Oleson et al. 2022: 16 AWG minimum for strength |
| `densityFEPKgPerM3` (physical) | 2,150 kg/m³ | | FEP specific gravity 2.12–2.17 |

## The sources

**Barth & Pike 2022** (NETS 2022, NTRS 20220002315), Sec. III.D:
- **The cable:** a fully insulated aluminium cable laid on the surface.
- **Insulation:** FEP at 4.4 kV/mm, five times its minimum breakdown
  thickness, with a 0.6 mm FEP case and no micrometeoroid shielding.
- **Sizing:** losses held at 5% over 3 km; conductors no smaller than 16 AWG.
- **Optimum voltage for 40 kW:**
  - **DC:** about ±4,000 V, 8,000 V line to line.
  - **AC:** 3,000 Vrms line to neutral, slightly heavier, since the peak
    voltage sets the insulation.
- **Open challenge:** a vacuum-rated high-voltage cable that avoids partial
  discharge.

**Oleson et al. 2022** (NASA/TM-20220012395), Sec. 4.1.7 and Fig. 4.3:
- **The cable:** 1 km, carrying 43.5 kWe at 95% efficiency, conductors capped
  at 16 AWG.
- **Optimum:** about 45 kg at ±2,800 VDC.

**Mason 2025** (NETS 2025) and **Mason 2001** (NASA/TM-2001-210593):
- **Mason 2025:** NASA's current design uses 3 kVac and found no benefit above
  it at 40 kWe, since the wire reached its minimum size; it notes higher
  voltages for longer distances.
- **Mason 2001:** its high-voltage (5,000 Vac) PMAD cut surface system mass by a
  third and moved the optimum separation out to 2.8–5 km.

## Calibration and cross-checks

- **Barth & Pike's 40 kW cable, not fitted:**
  - **The model's optimum:** ±3,969 V against their ±4,000 V (benchmark
    `barth-pike-2022-cable-voltage`).
  - **Its mass:** 73 kg per km.
- **Oleson's 43.5 kWe cable, not fitted:**
  - **The model's optimum:** ±3,060 V and 50 kg against ±2,800 V and about
    45 kg.
  - **The conductor** sits at the 16 AWG minimum, as Oleson's does.
- **The fixed mass per km, refitted:**
  - **The model's designed 40 kWe cable:** 74 kg/km.
  - **Mason 2025's pallet** grows 385 kg/km, so the rest (fibre, spool,
    redundant feeds, protection) is 312 kg/km.
- **The 40 kWe optimum separation stays 1.87 km,** against Mason's 1.8 km. At
  40 kWe the cable's total is still 385 kg/km.
- **Mason 2001's marginal masses hold:**
  - **Brayton:** 29.23 kg/kWe. The model now lands 2.46 t lighter at 100 and
    500 kWe (2.55 t in v0.25).
  - **Stirling:** 36.20 kg/kWe.
- **FSP's Stirling conversion returns within 5%:** 21.96 kg/kWe against 22.6.
  v0.25's 7% gap came from its heavy 3 kV conductor.
- **The cap binds every ISRU plant:**
  - Even 100 kg/day needs about 100 kW, whose optimum is above 8 kV.
  - A megawatt cable would be lightest near 18 kV (591 kg for the default
    plant, against 795 kg at 8 kV and 2,640 kg at 3 kV).

## Numbers that moved

1 t/day product, default inputs (1 km, surface) except as named. v0.26 → v0.27.

| Case | Cable voltage | Cable (kg) | Fission (t) | Landed (t) | Landings |
|---|---|---|---|---|---|
| Equatorial MRE (default) | 3 → **8 kV** | 2,343 → **795** | 29.77 → **29.79** | 50.40 → **50.42** | 1 |
| MRE, 100 kg/day | 3 → **8 kV** | 508 → **422** | 4.83 → **4.92** | 6.95 → **7.04** | 1 |
| MRE, 10 t/day | 3 → **8 kV** | 20,657 → **3,732** | 249.6 → **246.6** | 455.7 → **452.7** | 6 |
| Polar ice | 3 → **8 kV** | 859 → **506** | 10.03 → **10.13** | 21.95 → **22.05** | 1 |
| Polar propellant | 3 → **8 kV** | 2,073 → **745** | 26.29 → **26.33** | 73.78 → **73.82** | 1 |
| Ilmenite on soil | 3 → **8 kV** | 2,062 → **743** | 26.14 → **26.18** | 93.63 → **93.68** | 2 |
| Stirling, 1,050/500 K | 3 → **8 kV** | 2,343 → **795** | 36.73 → **36.76** | 57.36 → **57.39** | 1 |
| Buried at 100 m | 3 → **8 kV** | 231 → **79** | 28.14 → **29.53** | 48.77 → **50.16** | 1 |
| Buried at 100 m, 10 t/day | 3 → **8 kV** | 2,035 → **369** | 229.5 → **241.6** | 435.6 → **447.7** | 6 |

The best separation, and what it saves:

| Case | v0.26 best separation | **v0.27 best** | Landed at the best | Buried at 100 m |
|---|---|---|---|---|
| 40 kWe system (shield + cable) | 1.86 km | **1.87 km** | 1.47 t | 1.71 t |
| 100 kg/day MRE | 1.75 km | **~2 km** | 6.64 t | 7.00 t |
| Polar ice | 1.55 km | **~2 km** | 21.48 t | 22.03 t |
| Equatorial MRE, 1 t/day | 1.15 km | **~1.75 km** | 49.76 t | 50.16 t |
| MRE, 10 t/day | 0.55 km | **~1 km** | 452.7 t | **447.7 t** |

What the tables show:
- **At 1 km the defaults barely move.** The cable is 1.5 t lighter, and Mason
  2001's marginal mass, recalibrated, takes most of it back into the reactor
  and conversion.
- **Separation now pays:** a megawatt plant's cable is light enough that its
  reactor moves out toward Mason's 1.8 km, and the default plant saves 0.66 t
  there.
- **Burial pays only for the largest plants:**
  - **Up to 1 t/day:** a surface reactor at its best separation is lighter than
    a buried one at 100 m. That is the siting NASA's current design chose.
  - **At 10 t/day:** burial still saves 5 t, against 20 t at v0.26's 3 kV.
- **Nuclear still beats solar** in every reference case. The crossover moves
  from 2.09 to 2.14 kW at the equator and from 4.55 to 4.67 kW at the pole,
  since a small plant's cable now carries the fixed 312 kg/km and a
  minimum-gauge conductor.

Regression anchors moved deliberately, each marked "v0.27":
- **The fixed-seed uncertainty anchor:** 50.329 → 50.346 days.
- **Landed-mass and fission anchors from v0.4 through v0.26.**
- **The v0.25 optimum separations:** about 1.75 km for the default plant, 1 km
  at 10 t/day, and 2 km at the pole.
- **The v0.26 buried anchors.**
- **Retired with `cableConductorKgPerKwKm`:** v0.25's 2.026 kg per kW and km.
- **Identities:** the crossover now charges the whole cable at the crossover's
  power, and the v0.18 slope no longer carries the cable.
- **New v0.27 anchors in both suites:**
  - the default cable's voltage, mass, and parts
  - a small plant's voltage below the cap
  - the uncapped and 3 kV cables

Golden vectors were regenerated; the Latin hypercube samples `VCableMaxV`.

## In the app

- **Rail:** the power group gains "Highest reactor-to-outpost cable voltage".
  Its evidence gives:
  - the Barth & Pike cross-check
  - the cap's basis
  - the 18 kV a megawatt plant would choose
- **Evidence:** the separation, the cable's fixed mass and loss, and the
  siting now give v0.27's optima and burial trade.
- **Power trade panel:** the CABLE line adds the cable's voltage.

Screenshot: [the voltage cap's evidence over the power panel](screenshots/cable-voltage/cable-voltage-evidence.png)

## Verification

- **Regression (v0.27):** in both suites.
- **Benchmarks:**
  - `barth-pike-2022-cable-voltage`: the voltage optimum and mass against Barth
    & Pike and Oleson.
  - `mason-2025-fsp-separation` still checks the pallet slope and the 1.8 km
    optimum.
  - `mason-2001-*` still check the marginal masses.
  - FSP's Stirling conversion is back within 5%.
- **Parity:** 220 golden vectors.
- **Size budget:** the engine is 230,392 B. The ratchet moves from 224 to
  240 KiB, with a comment naming the v0.22–v0.27 fission siting and
  transmission models.

## Left for later

- **AC transmission.** NASA's current design uses 3 kVac with transformers at
  each end. An AC line needs insulation for its peak voltage and adds a
  converter mass the DC model does not carry.
- **The converters at each end** of a higher-voltage line, and their losses,
  are inside the conversion and power management mass, not sized with voltage.
- **Topography,** and **the buried reactor's excavation,** from v0.25 and v0.26.
