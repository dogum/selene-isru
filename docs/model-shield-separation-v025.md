# Fission shield with separation distance, and the cable to the outpost v0.25

This continues the audit trail from
[`model-shield-power-v021.md`](model-shield-power-v021.md). It left one item
open: the shield's separation distance was fixed, so the model could not trade
shield mass against the cable that separation needs.

**What changes:**
- **Separation is an input:** `dSeparationKm`, 1 km by default, NASA's current
  FSP baseline.
- **The shield shrinks with distance:**
  - It goes as separation^−0.97, fitted to Mason 2025's shields at 0.5, 1, and
    2 km.
  - It is rebased on Mason 2025's 1,370 kg shield at 1 km.
- **A cable to the outpost** is charged by its length:
  - a fixed mass per km
  - plus an aluminium conductor sized for a fixed loss per km, at 3 kV
  - the loss is charged to the fission plant, which sends enough to cover it

At the defaults:
- The plant lands 50.40 t, from 50.24 t.
- The shield is 0.82 t lighter.
- The cable adds 2.34 t and loses 16.8 kW.
- The recalibration takes most of that back.

> **Model boundary:** the shield's distance law is a fit to one NASA
> reactor's three shields. It is not a dose calculation: the shield's shadow, its
> materials, and the outpost's size are those of that design. The cable is a
> two-conductor aluminium line at a fixed voltage with one fitted fixed mass per
> km; insulation is not sized with voltage, and the route is straight and laid on
> the surface. TypeScript/Python parity proves the two implementations agree,
> not that the answer is right.

## Why

- **Every NASA surface fission study trades separation:**
  - **Mason 2001:** optimizes it for each system, from 100 m to 5 km.
  - **Mason 2025:** finds its 40 kWe minimum near 1.8 km.
  - **Barth & Pike 2022:** size the cable for it.
- **The trade:**
  - A closer outpost needs a thicker shield and a wider shadow.
  - A farther one needs more cable, which loses power.
- **What the model had:** a fixed shield and no cable, so separation could not
  be traded, and the model did not see that a larger plant wants its reactor
  closer.

## What the model computes

```
shield            = MshieldKg · max(1, Q / QshieldRefKwt)^nShield · (1 km / d)^nShieldDistance      [kg]
line efficiency   ηline = 1 − fCableLossPerKm · d                                                   [1]
sent power        Psent = Pgrid / ηline                                                             [W]
reactor heat      Q = Psent / η                                                                     [W]
conductor         4 ρAl ρm,Al · 10⁹ / (V² · fCableLossPerKm)    = 2.03 at the defaults           [kg/(kW km)]
cable             = d · (kCableKgPerKm + conductor · Psent)                                         [kg]
```

- **Conductor sizing:** two conductors at line voltage V lose a fraction
  2ρLP/(V²A) of the power P they carry. Holding that at `fCableLossPerKm` per km
  sets the conductor's cross-section, and so its mass.
- **What runs on the sent power:**
  - the reactor, conversion, and radiator
  - the shield's growth with power
  - the cable's conductor

  The line loss is charged as more fission plant.
- **The fission mass curve** carries both terms, so the power chart, the
  crossover, and `simulate()` stay one mass:
  - the shield and the cable's fixed mass as constants
  - the rest per kW delivered
- **New result fields:**
  - `power.cableMassKg`, part of `nuclearMassKg`
  - `power.cableLossW`
  - `power.fissionThermalW` now includes the heat for the loss.
- **New exported helpers:**
  - `fissionShieldKg` and `shieldDistanceFactor`
  - `lineEfficiency`
  - `cableConductorKgPerKwKm` and `cableMassKg`
- **Solar is unchanged:** its array and storage sit with the plant.

| Key | Default | Range | Basis |
|---|---|---|---|
| `dSeparationKm` | 1 km | 0.1–5 | Mason 2025: habitat boundary 1 km from the reactor |
| `MshieldKg` | **1,370 kg** (was 1,676) | 500–8,000 | Mason 2025: 175 kWt heat-pipe reactor, <5 rem/yr at 1 km |
| `nShieldDistance` | 0.97 | 0–2 | **Fitted:** Mason 2025's 2,700 and 700 kg at 0.5 and 2 km |
| `kCableKgPerKm` | 303 kg/km | 0–1,000 | **Fitted:** Mason 2025's pallet growth with cable length |
| `fCableLossPerKm` | 1.67%/km | 0.2–5% | Barth & Pike 2022: losses limited to 5% at 3 km |
| `kReactorKgPerKwt` | **1.94** (was 2.19) | | Recalibrated: Mason 2001's 29.25 kg/kWe, FSP's split |
| `kConversionKgPerKwe` | **7.31** (was 8.24) | | Recalibrated, as above |
| `kConversionStirlingKgPerKwe` | **21.06** (was 22.23) | | Recalibrated: Mason 2001's 36.2 kg/kWe Stirling |
| `VCableV` (physical) | 3,000 V | | Mason 2025: 3 kVac; Barth & Pike: AC cable lightest at 3,000 Vrms for 40 kW |
| `rhoAluminumOhmM`, `densityAluminumKgPerM3` (physical) | 2.82e-8 Ω·m, 2,700 kg/m³ | | CRC Handbook |
| `dShieldRefKm` (physical) | 1 km | | Mason 2025's reference separation |

## The sources

**Mason 2025** (Mason, Kaldon, Corbisiero & Rao, NETS 2025; NTRS 20250000841),
NASA and INL's current 40 kWe FSP design. v0.21 took `nShield` from it. Its
heat-pipe Stirling option, separation sweep (Sec. VII and Fig. 10):

| Separation | Shield | Included angle | User interface pallet, with cable |
|---|---|---|---|
| 0.5 km | ~2,700 kg | 52° | ~670 kg |
| **1 km (baseline)** | **1,370 kg** | 36° | 872 kg |
| 2 km | ~700 kg | 22° | 1,250 kg |

- **Optimum:** the minimum system mass is near 1.8 km, flat from 1 to 2.5 km.
- **The baseline cable:** four redundant 3 kVac feeds of 14 AWG wire, 325 kg
  with its spool for 1 km.

**Barth & Pike 2022** (NETS 2022, NTRS 20220002315), NASA Glenn's review of
lunar power transmission for FSP. Their cable:
- aluminium, fully insulated, laid on the surface
- conduction losses limited to 5% at 3 km as a design choice
- conductor mass falling with the square of voltage while insulation grows
- the AC cable lightest at 3,000 Vrms line-to-neutral for 40 kW

**Mason 2001** (NASA/TM-2001-210593), already the marginal-mass calibration:
- **Separation is optimized for each surface system** against transmission-line
  mass: 400, 200, and 100 m for 10, 100, and 500 kWe at 200 Vac.
- **At 5,000 Vac** the optimum moves to 5,000, 3,600, and 2,800 m.

## Calibration and cross-checks

- **Shield exponent:** ln(2700/700)/ln(4) = 0.974, rounded to 0.97. The model's
  175 kWt shield is 2,684 kg at 0.5 km and 699 kg at 2 km, against Mason's 2,700
  and 700 (benchmark `mason-2025-fsp-separation`).
- **Cable fixed mass:**
  - **Mason's pallet** grows 385 kg/km by least squares over its three points.
  - **The model's conductor** for 40 kWe is 82 kg/km, leaving 303 kg/km fixed.
  - **Not fitted:** the model's 40 kWe cable grows by 192 kg from 0.5 to 1 km
    and 388 kg from 1 to 2 km. Mason's pallet grows 202 and 378 kg.
- **Not fitted, the 40 kWe optimum:**
  - The model's shield-plus-cable minimum is at **1.86 km**, against Mason's
    1.8 km.
  - From 0.5 to 1 km the model saves 1,121 kg (Mason: 1,128).
  - From 1 to 2 km it saves 282 kg (Mason: about 300).
- **Mason 2001's marginal masses hold:**
  - **Brayton:** 29.23 kg/kWe from 100 to 500 kWe, against 29.25. The model now
    lands 2.55 t lighter at both powers (2.52 t in v0.24).
  - **Stirling:** 36.20 kg/kWe at the lithium point. Stirling against Brayton at
    500 kWe stays 1.20.
- **FSP's Stirling conversion, not fitted:** the Stirling conversion mass is now
  21.06 kg/kWe, 7% under FSP's 22.6. The cable's conductor is charged on its
  own, and FSP's power management may carry its own cable. The cross-check's
  tolerance moves from 5% to 8%.
- **Mason 2006's 50 kWe system, not fitted:** 3.13 t against 3.49 t before
  margin (10% light; 11% in v0.24).
- **The lightest separation falls with plant size**, as in Mason 2001: the
  cable's conductor grows with power and the shield only as its cube root.

  | Case | Lightest separation | Landed at 1 km | Landed at the optimum |
  |---|---|---|---|
  | 40 kWe system (shield + cable) | 1.86 km | | |
  | 100 kg/day MRE | ~1.75 km | 6.95 t | 6.62 t |
  | Polar ice | ~1.55 km | 21.95 t | 21.64 t |
  | Equatorial MRE, 1 t/day | ~1.15 km | 50.40 t | 50.34 t |
  | MRE, 10 t/day | ~0.55 km | 455.7 t | 451.0 t |

## Numbers that moved

1 t/day product, default inputs (1 km) except as named. v0.24 → v0.25.

| Case | Shield (kg) | Cable (kg) | Cable loss (kW) | Fission (t) | Landed (t) | Landings |
|---|---|---|---|---|---|---|
| Equatorial MRE (default) | 4,613 → **3,792** | **2,343** | **16.8** | 29.61 → **29.77** | 50.24 → **50.40** | 1 |
| MRE, 100 kg/day | 2,162 → **1,777** | **508** | **1.7** | 4.86 → **4.83** | 6.98 → **6.95** | 1 |
| MRE, 10 t/day | 9,856 → **8,101** | **20,657** | **167.7** | 242.6 → **249.6** | 448.7 → **455.7** | 6 |
| Polar ice | 3,005 → **2,470** | **859** | **4.6** | 10.10 → **10.03** | 22.02 → **21.95** | 1 |
| Polar propellant | 4,403 → **3,619** | **2,073** | **14.6** | 26.19 → **26.29** | 73.68 → **73.78** | 1 |
| Ilmenite on soil | 4,393 → **3,611** | **2,062** | **14.5** | 26.04 → **26.14** | 93.53 → **93.63** | 2 |
| Polar Sabatier | 3,943 → **3,241** | **1,571** | **10.4** | 19.70 → **19.70** | 54.40 → **54.40** | 1 |
| Stirling, 1,050/500 K | 4,374 → **3,596** | **2,343** | **16.8** | 36.57 → **36.73** | 57.20 → **57.36** | 1 |
| Equatorial MRE, 0.25 km | | | | | **59.05** | 1 |

What the table shows:
- **The shield is 18% lighter everywhere.** Mason 2025's 1,370 kg directional
  shield at 1 km replaces FSP 2008's 1,676 kg buried shield.
- **The cable charges the plant for its outpost.**
  - Small plants come out slightly lighter: the lighter shield and the
    recalibrated reactor outweigh their short-of-a-tonne cable.
  - Megawatt plants come out heavier: a 10 t/day plant's 1 km cable carries 10
    MW at 3 kV, weighs 20.7 t, and lands 7 t more.
  - At 0.6 km the 10 t/day plant gets most of that back (451.1 t).
- **Separation matters more than it did:** at 0.25 km the default plant lands
  59 t, 8.6 t more, almost all of it shield.
- **Nuclear still beats solar** in every reference case. The crossover stays at
  2.09 kW at the equator and 4.55 kW at the pole.

Regression anchors moved deliberately, each marked "v0.25":
- **The fixed-seed uncertainty anchor:** 50.160 → 50.329 days.
- **The v0.4, v0.6, v0.7, v0.12, v0.13, and v0.16 landed-mass anchors.**
- **The v0.22, v0.23, and v0.24 fission anchors.**
- **The pinned v0.17–v0.21 cases:**
  - Their shields are kept: the v0.20 and v0.21 pins now pin FSP 2008's
    1,676 kg.
  - The cable and its loss now ride on them.
- **Identities that now include the cable:**
  - the crossover against the scaled shield
  - the v0.18 slope
  - the radiator's heat balance
  - FSP's mass identity
- **The efficiency anchors** divide the reactor heat by the sent power, so they
  still pin the converter's efficiency.
- **New v0.25 anchors in both suites:**
  - the default shield, cable, and loss
  - the shield at half the separation
  - the optimum separation at three plant sizes

Golden vectors were regenerated. The Latin hypercube samples the four new
inputs; the parity set stays at 219 vectors.

## In the app

- **Rail:** the power group gains:
  - "Reactor separation from the outpost"
  - the shield's distance exponent
  - the cable's fixed mass per km
  - the cable's loss per km

  Each has its own evidence; the separation's evidence gives the optimum at
  three plant sizes.
- **The distance exponent reads NO EFFECT at the defaults.** At the reference
  1 km the factor is 1 whatever the exponent, so it acts only once the
  separation moves. Its evidence says so.
- **Evidence:**
  - The shield's evidence names Mason 2025's design and the retired FSP 2008
    shield.
  - Barth & Pike 2022 links to NTRS.
- **Power trade panel:** a CABLE line gives the separation, the cable mass, and
  its loss.
- **Inspectors:** the polar nuclear station offers the separation as a control
  and shows the shield and cable.
- **Saved cases, files, and links:** no key is renamed or retired.
  - A case saved with the old 1,676 kg shield keeps it, now read as its shield
    at 1 km.
  - That is the separation the old model implied for the outpost, so the
    case's shield does not move.

Screenshot: [the separation's evidence over the power panel](screenshots/shield-separation/separation-evidence.png)

## Verification

- **Regression (v0.25):** in both suites.
- **Benchmarks:**
  - `mason-2025-fsp-separation`: the shield exponent and the 0.5 and 2 km
    shields, the cable against the pallet, and the 1.8 km optimum (not fitted).
  - `mason-2001-surface-brayton-scaling` and `mason-2001-stirling-scaling`
    still check the marginal masses.
- **Parity:** 219 golden vectors.
- **Size budget:** the engine is 226,381 B, within 224 KiB.

## Left for later

- **Burial and regolith augmentation.** *(v0.26: done; see
  [`model-shield-burial-v026.md`](model-shield-burial-v026.md).)*
  - FSP 2008's 1,676 kg shield sat buried in regolith for 100 m.
  - Mason 2025's 1,370 kg above-ground shield is for 1 km.
  - On this model's distance law, an above-ground shield for 100 m would weigh
    about 13 t, so burial would save most of a close-in shield's mass.
- **Transmission voltage with power.** The cable runs at a fixed 3 kV, which
  Barth & Pike find lightest for 40 kW. A megawatt plant's optimum is higher, at
  the cost of insulation mass, which would move its optimum separation outward.
- **Topography.** A crater rim or ridge between reactor and outpost attenuates
  dose; the model's outpost is in line of sight.
