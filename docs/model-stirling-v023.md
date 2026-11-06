# Stirling as a fission converter v0.23

This continues the audit trail from
[`model-reactor-per-kwt-v018.md`](model-reactor-per-kwt-v018.md) and
[`model-brayton-cycle-v020.md`](model-brayton-cycle-v020.md). Both left the
item open: the fission converter was Brayton only, though NASA's lunar fission
studies weigh Stirling against it and FSP's 40 kWe design is a Stirling.

**What changes:** a converter switch.
- **Brayton** stays the default, and no default result moves.
- **Stirling** brings:
  - its own efficiency, a fixed fraction of Carnot
  - its own conversion mass
  - its own scaling: modular convertors that gain no economy of scale

At megawatt scale Stirling comes out heavier than Brayton, as NASA finds above
about 50 kWe.

> **Model boundary:** the Stirling converter is a fraction of Carnot, one
> specific mass, and one scaling exponent, set to two NASA design points and
> one NASA scaling study. It is not a convertor design: unit size, heater-head
> temperature limits, and heat-pipe coupling are not resolved.
> TypeScript/Python parity proves the two implementations agree, not that the
> answer is right.

## Why

- **NASA's surface fission studies weigh two dynamic converters:** Brayton and
  free-piston Stirling.
  - **Mason 2001:** Stirling is lighter below about 50 kWe and Brayton above.
  - **Mason 2006:** Stirling is the lightest stainless-steel-reactor option at
    50 kWe.
  - **NASA FSP's 40 kWe design** is a Stirling.
- **What the model did:** it modelled Brayton only, so these trades could not
  be run.

## What the model computes

```
Stirling efficiency        = fCarnotStirling · (1 − Tsink / Tsource)                                [1]
Stirling conversion mass   = kConversionStirlingKgPerKwe · P · (Q / QscaleRefKwt)^(bStirlingScale − 1)  [kg]
```

- **`fissionConverter`** chooses `brayton` (the default) or `stirling`.
- **Shared by both converters:** the reactor (charged per kWt and scaled by
  `bFissionScale`), the shield, the radiator, and the temperatures.
- **Converter-specific inputs:** each converter's own inputs act only when it
  is chosen, and the rail hides the other's.
- **Why a fraction of Carnot suits Stirling:** an ideal Stirling cycle is a
  Carnot cycle. v0.20 replaced the same model for Brayton because a Brayton
  cycle loses work much faster as its cold end warms.
- **Warnings:**
  - **New caution, `stirling-hot-end`:** a Stirling hot end above 1,050 K
    raises it. 1,050 K is the hottest Stirling in NASA's lunar designs, with
    superalloy heater heads.
  - **Brayton only:** the `fission-no-net-work` alarm.
- **New exported helper:** `conversionKgPerKwe`, the conversion and power
  management mass per kWe for the chosen converter.

| Key | Default | Range | Basis |
|---|---|---|---|
| `fissionConverter` | brayton | brayton, stirling | Model switch |
| `fCarnotStirling` | 0.59 | 0.3–0.75 | Mason 2006: two Stirling converters at 0.565 and 0.613 of Carnot |
| `kConversionStirlingKgPerKwe` | 23.31 kg/kW at 1 MWt | 2–60 | Mason 2001 Table 3: surface Stirling marginal mass |
| `bStirlingScale` | 1.0 | 0.6–1 | Mason 2001 Table 4: Stirling systems fit power^0.996 |
| `TStirlingMaxK` (physical) | 1,050 K | | Mason 2006: the lithium-reactor Stirling's hot end |

## The sources

**Mason 2006** (NASA/TM-2006-214120, Table 1): two 50 kWe Stirling design
points.

| Stirling design | Hot / cold end | Efficiency | Fraction of Carnot | System, with 20% margin |
|---|---|---|---|---|
| NaK, stainless-steel reactor | 850 / 460 K | 25.9% | 0.565 | 5,309 kg |
| Lithium, refractory reactor | 1,050 / 500 K | 32.1% | 0.613 | 4,674 kg |

The NaK system's 460 K cold end is the study's minimum-mass Stirling cold end.

**Mason 2001** (NASA/TM-2001-210593), the same study v0.19 and v0.22
calibrated Brayton to:

| Table | Systems | 100 kWe | 500 kWe | 1 MWe | 10 MWe |
|---|---|---|---|---|---|
| 3 (surface) | Stirling | 74.7 kg/kWe | 43.9 kg/kWe | | |
| 3 (surface) | Brayton, for comparison | 74.0 kg/kWe | 38.2 kg/kWe | | |
| 4 (spacecraft) | Stirling | 31.0 kg/kWe | | 21.8 kg/kWe | 20.7 kg/kWe |

- **Table 3:** Mason's Stirling is 101% of Brayton at 100 kWe and 115% at
  500 kWe.
- **Table 4:** the Stirling systems fit a fixed 1.0 t plus mass growing as
  power to the 0.996: "Stirling does not scale as well". Brayton fit 0.95.

**NASA FSP** (Mason, Poston & Qualls 2008, Table II), not used in calibration:
the 40 kWe Stirling design carries 344 kg of conversion and 559 kg of power
management, 22.6 kg/kWe.

## Calibration and cross-checks

- **The fraction of Carnot:** 0.59, the geometric mean of Mason 2006's two
  (0.588), rounded. It gives 27.1% and 30.9% at the two design points, within
  5% of both (benchmark `mason-2006-lunar-stirling`).
- **Conversion mass:**
  - **The fit:** at Mason 2006's 1,050/500 K lithium Stirling point, the
    model's Stirling marginal mass from 100 to 500 kWe, shield and radiator
    included, matches Mason 2001's 36.2 kg/kWe. That makes Stirling conversion
    and power management **23.31 kg/kWe**, within 4% of FSP's own 22.6
    (benchmark `mason-2001-stirling-scaling`).
  - **Why that design point:** the Brayton calibration used Mason 2006's
    Brayton design point, which is also the model's default.
- **Scaling:** Table 4's exponent 0.996 rounds to 1. Stirling conversion is
  linear in power, because convertors are added, not enlarged. The reactor
  still scales by `bFissionScale`.
- **Stirling against Brayton, each at its NASA design point:**

  | Power | Model | Mason 2001 |
  |---|---|---|
  | 10 kWe | 1.03 | 0.86 |
  | 100 kWe | 1.11 | 1.01 |
  | 500 kWe | 1.20 | 1.15 |

  The trend matches. At 500 kWe the model is close; below 100 kWe it misses.
  Mason's small Stirling systems benefit from the higher efficiency through
  reactor and shield masses that do not shrink with power. The model's
  per-kW reactor does not see that.
- **50 kWe systems, not used in calibration:**

  | Stirling design | Model | Mason 2006, before margin |
  |---|---|---|
  | Lithium | 3.35 t | 3.90 t (14% light) |
  | NaK | 3.55 t | 4.42 t (20% light) |

**A disclosed limit: the optimum cold end.**
- **Where the model puts it:** with a fixed fraction of Carnot, the model's
  lightest Stirling radiator runs about 40 K warmer than Mason's: 540 K behind
  a 1,050 K hot end (Mason's design point 500 K), and 500 K behind 850 K
  (Mason's optimum 460 K).
- **Why:** a real Stirling's fraction of Carnot falls somewhat as its cold end
  warms.
- **Compared with Brayton:** the bias is far smaller than Brayton's was in
  v0.19, about 40 K against 170 K.

## Numbers

Stirling is opt-in, so no default result moves. Brayton at its defaults against
Stirling at Mason 2006's 1,050/500 K design point; 1 t/day product unless
named.

| Case | Radiator (m²) Brayton / Stirling | Fission (t) | Landed (t) | Landings | Nuclear beats solar above (kW) |
|---|---|---|---|---|---|
| Equatorial MRE | 3,126 / 922 | 29.63 / 36.58 | 50.26 / 57.21 | 1 / 1 | 2.09 / 2.10 |
| MRE, 100 kg/day | 314 / 93 | 4.84 / 5.36 | 6.95 / 7.47 | 1 / 1 | 2.09 / 2.10 |
| MRE, 10 t/day | 31,193 / 9,199 | 245.5 / 324.6 | 451.6 / 530.8 | 6 / 7 | 2.09 / 2.10 |
| Polar ice | 852 / 251 | 10.06 / 11.73 | 21.99 / 23.65 | 1 / 1 | 4.54 / 4.61 |
| Polar propellant | 2,713 / 800 | 26.20 / 32.16 | 73.69 / 79.65 | 1 / 1 | 4.54 / 4.61 |
| Ilmenite on soil | 2,696 / 795 | 26.05 / 31.97 | 93.54 / 99.46 | 2 / 2 | 2.09 / 2.10 |

What the table shows:
- **Stirling's radiator is a third of Brayton's.** Its cold end runs at 500 K
  instead of 400 K, and it is more efficient, so it rejects less heat at a
  higher temperature.
- **Its conversion outweighs that.** At 23.3 kg/kWe without economy of scale,
  against Brayton's 6.9 at 1 MWt, it lands 7 t more at 1 t/day.
- **At 10 t/day the gap widens to 79 t,** and the Stirling plant needs a
  seventh landing.
- **Stirling at the default 1,150/400 K** lands 59.2 t and raises the hot-end
  caution, since 1,150 K is past NASA's Stirling heater heads.

Regression anchors: no existing anchor moves. New v0.23 anchors in both suites
cover:
- the lithium Stirling design point
- the hot-end caution, and the Brayton alarm's absence under Stirling
- the 540 K optimum, as a disclosed limit

Golden vectors were regenerated: the Latin hypercube runs one sample in six as
Stirling, and a named lithium-Stirling scenario brings the parity set to 219
vectors.

## In the app

- **Rail:** the power group gains a FISSION CONVERTER select at both sites.
  - **Stirling inputs:** under Stirling it shows its fraction of Carnot,
    conversion mass, and scaling exponent, and hides the Brayton cycle inputs
    and Brayton conversion. Brayton hides the Stirling ones.
  - **Note under Stirling:** it states the fixed fraction of Carnot and NASA's
    850–1,050 K and 460–500 K design temperatures.
- **Evidence:**
  - Each Stirling input cites its source and limits.
  - The hot-end evidence states the 1,050 K heater-head limit.
- **Links:** `fissionConverter=stirling` round-trips through a link.

Screenshots: [the converter select under Stirling, with its note](screenshots/stirling/stirling-converter.png), and [the fraction of Carnot's evidence over the power panel](screenshots/stirling/stirling-carnot-evidence.png)

## Verification

- **Regression (v0.23):** in both suites.
- **Benchmarks:**
  - `mason-2006-lunar-stirling`: the fraction of Carnot against both design
    points.
  - `mason-2001-stirling-scaling`:
    - the surface marginal mass
    - the Table 4 exponent
    - FSP's specific mass, as a check
    - the 500 kWe Stirling/Brayton ratio
- **App:** `fission-converter.test.tsx` covers:
  - the select at both sites
  - each converter's inputs shown and the other's hidden and inert
  - switching from the rail
  - the evidence and the link
- **Parity:** 219 golden vectors.
- **Size budget:** the engine is within 224 KiB.

## Left for later

- **Small-reactor fixed masses.** A reactor and shield that do not shrink with
  power would let Stirling's efficiency pay at low power, as in Mason 2001. The
  model's per-kW reactor misses it.
- **Stirling efficiency with temperature.** A fraction of Carnot that falls as
  the cold end warms would move the model's optimum toward Mason's.
- **Thermoelectric conversion,** Mason 2006's third option, for small or
  long-life systems.
