# The reactor's excavation and the transmission converters v0.30

This continues the audit trail from
[`model-siting-horizon-v029.md`](model-siting-horizon-v029.md). Two items left
open since v0.26 and v0.28:
- **The converters at each end of the cable.** The model charged the cable's
  conduction loss but nothing between the generator and the cable, or between
  the cable and the outpost's loads. That made AC and DC look alike except for
  the cable itself, so v0.28 kept DC, the lighter cable, as the default.
- **The buried reactor's hole.** v0.26 sited a reactor in an excavated hole and
  charged nothing to dig it.

**What changes:**
- **Converters at both ends, by converter and transmission form:**
  - **A Brayton on an AC line:** a step-up transformer at the reactor, a
    step-down transformer and the distribution unit at the outpost.
  - **A Stirling, or any converter on a DC line:** an active rectifier and one
    switching stage at the reactor; on a DC line, a DC-DC converter at the outpost.
  - **Four new efficiencies:** transformer, rectifier, DC-DC converter and
    distribution unit, each read from a NASA source.
- **AC becomes the default.** With the converters charged, DC loses 189 kW in
  conversion at the default plant against AC's 58 kW and lands 2.7 t heavier.
  AC is also NASA's current design (Mason 2025, 3 kVac).
- **The fission masses are refit** so Mason 2001's marginal masses still hold
  with the converters' losses charged:

  | Mass | Before | v0.30 |
  |---|---|---|
  | Reactor | 2.16 kg/kWt | 1.91 kg/kWt |
  | Brayton conversion | 8.14 kg/kWe | 7.21 kg/kWe |
  | Stirling conversion | 21.96 kg/kWe | 17.74 kg/kWe |
  | Cable's fixed mass | 243 kg/km | 239 kg/km |

- **The hole:** a buried reactor's hole is dug by the plant's own excavation
  fleet before the first product.
- **Skin effect:** an AC conductor thicker than its skin depth raises an info
  note; it is taken as stranded, at no extra mass.
- **At the defaults:**
  - The plant lands 50.38 t, against 50.35 t in v0.29.
  - Its lightest separation falls from about 1.8 to 1.55 km, since the AC
    cable is heavier.

> **Model boundary:** the converters are stage efficiencies from NASA concept
> studies, not hardware. Their mass stays in the conversion and power
> management mass per kWe, unchanged with form. Their radiators, the outpost's
> control power and auxiliary loads are not charged. The hole is a cylinder
> scaled from one NASA design; digging it costs fleet time, not energy.
> TypeScript/Python parity proves the two implementations agree, not that the
> answer is right.

## Why

- **The converters decide AC against DC:**
  - **Barth & Pike 2022, Sec. IV:**
    - A DC line needs rectification and stacked H-bridges at each end, built
      from radiation-tolerant devices limited to about 160 V.
    - An AC line is stepped up and down by transformers alone.
    - They find DC the lighter cable, AC the simpler conversion.
  - **Mason 2025:** a Brayton couples directly to a 3 kVac step-up
    transformer. The resulting PMAD efficiency is about 90% for the Brayton,
    against 83% for the Stirling's extra converter stage.
- **v0.28 had only the cable,** so it could show AC's heavier cable but not
  its lighter conversion.
- **The hole:**
  - **Mason 2006:** the reactor goes into "a vertical excavation approximately
    2 meters in diameter and 4 meters tall", and the regolith-moving equipment
    is the plant's own mining equipment.
  - **v0.26:** charged the shield and cable a buried reactor saves, but not the
    digging it costs.

## What the model computes

```
sending    = etaTransformer                      Brayton, AC line
           = etaRectifier · etaDcDcConverter     Stirling, or a DC line
receiving  = etaTransformer   · etaPowerDistribution     AC line
           = etaDcDcConverter · etaPowerDistribution     DC line
line       = sending · (1 − fCableLossPerKm · d) · receiving
```

- **`lineEfficiency`** is now the whole chain from generator to the outpost's
  bus.
  - The reactor, conversion, radiator and shield are sized on generated
    power, as before, now grossed up by it.
  - **The cable carries** the delivered power grossed up for the cable and the
    outpost's converter (`cableInputKw`), and is designed for that.
  - **`power.cableLossW`** is the cable's conduction loss alone.
  - **`power.converterLossW`** is the two ends' loss.
- **Skin depth:** δ = sqrt(ρ / (π f μ₀)) for aluminium at `fAcHz`.
  - 2.7 mm at Mason 2025's 1 kHz.
  - **`power.cableRadiusToSkinDepth`** reports an AC conductor's radius over it
    (0 for DC).
  - **Above 1** the plant raises the info note `cable-skin-effect`.
- **The hole:**

  ```
  reactorHoleKg = rhoReg · π (dReactorHoleM / 2)² · max(1, Q / QshieldRefKwt)^nShield · zReactorHoleM
  ```

  - The hole is widened as the plug shield that covers it grows.
  - **Fleet time:** the plant's excavators dig it at their rated rate, which
    gives `excavation.reactorHoleDays`.
  - **Then the strip:** the fleet strips the first overburden after the hole.
  - **First product:** waits for `max(commissioning, hole + strip)`.
  - **No reactor, no hole:** a solar plant and a surface reactor dig nothing.
- **New exported helpers** in both implementations:
  - `converterEfficiencies`
  - `cableEfficiency`
  - `cableInputKw`
  - `reactorHoleKg`

| Key | Default | Range | Basis |
|---|---|---|---|
| `etaTransformer` | 0.98 | 0.9–1 | Mason 2006's boost transformer |
| `etaRectifier` | 0.926 | 0.8–1 | Oleson 2022's Stirling controllers |
| `etaDcDcConverter` | 0.961 | 0.8–1 | Oleson 2022's DC-DC converters, each end |
| `etaPowerDistribution` | 0.984 | 0.9–1 | Oleson 2022's power distribution unit |
| `fAcHz` | 1,000 Hz | 50–5,000 | Mason 2025's 1 kHz line |
| `dReactorHoleM` | 2 m | 1–6 | Mason 2006's excavation |
| `zReactorHoleM` | 4 m | 1–10 | Mason 2006; FSP 2008's is 2 m |
| `mu0` | 1.2566 µH/m | physical | CODATA 2018 |
| `cableForm` | **ac** (was dc) | ac, dc | The lighter form with its converters, and NASA's current design |
| `kCableKgPerKm` | **239** (was 243) | 0–1,000 | Mason 2025's 385 kg/km less the 146 kg/km cable the model designs for 40 kWe through the outpost's converter |
| `kReactorKgPerKwt` | **1.91** (was 2.16) | | Refit: Mason 2001's 29.25 kg/kWe, split as FSP 2008 |
| `kConversionKgPerKwe` | **7.21** (was 8.14) | | Same refit |
| `kConversionStirlingKgPerKwe` | **17.74** (was 21.96) | | Refit: Mason 2001's 36.2 kg/kWe for Stirling |

## The sources

**Mason 2006** (NASA/TM-2006-214120):
- **Power Management and Distribution Concept:**
  - a simple boost transformer, "estimated at 98 percent efficiency", raises
    the Brayton's output for the 5,000 Vac cable
  - the Stirling's rectifier, inverter and transformer are 92%
  - the Power Distribution Module is 97%, with 500 W of control power
- **Table 1:**
  - 54.6 kWe of Brayton and 61.7 kWe of NaK Stirling conversion output
  - 0.3 and 3.4 kWe of auxiliary loads
  - for 50 kWe over a 500 m cable sized at 98%
- **Reactor Shielding Options:** the 2 m by 4 m vertical excavation.

**Oleson et al. 2022** (NASA/TM-20220012395), Figs. 4.1 and 4.2, a DC Stirling
system:
- Stirling cables 99.2%
- Stirling controllers 92.6%
- DC-DC converters 96.1% at each end
- a 95% cable
- the power distribution unit 98.4%
- about 78% from the Stirling terminals to the user

**FSP 2008** (NASA/TM-2008-215166):
- 48 kWe gross for 40 kWe of user loads
- the PCAD converting to DC for transmission
- the reactor about 100 m from the outpost, at the bottom of a 2 m excavation

**Mason 2025** (NETS 2025):
- 3 kVac, 1 kHz transmission
- the Brayton directly coupled to the step-up transformer
- PMAD about 90% for the Brayton, 83% for the Stirling

**Barth & Pike 2022** (NETS 2022), Sec. IV:
- the AC and DC conversion topologies compared
- skin effect "not expected to be a challenge", and avoidable with Litz wire

## Calibration and cross-checks

- **Each stage efficiency is read from a source.** The chains built from them
  are checked, not fitted (benchmark `nasa-fsp-pmad-chain`):

  | Check | Model | Source |
  |---|---|---|
  | The AC outpost end | 96.4% | Mason 2006's module, 97% |
  | Mason 2006, Brayton conversion output for 50 kWe | 54.3 kWe | 54.6 kWe |
  | Mason 2006, NaK Stirling conversion output | 62.9 kWe | 61.7 kWe |
  | FSP 2008, gross power for 40 kWe at 100 m (DC Stirling) | 47.6 kWe | 48 kWe |
  | Oleson 2022, Stirling terminals to user | 79.3% | about 78% |
  | Mason 2025, Stirling PMAD over Brayton PMAD | 0.908 | 0.922 |

- **Mason 2001's marginal masses, refit:**
  - The reactor and Brayton conversion are scaled together, keeping FSP's
    split, to 29.23 kg/kWe from 100 to 500 kWe (Mason's 29.25).
  - Stirling conversion is refit to Mason's 36.2 kg/kWe.
  - The model now lands 2.49 t under Mason at 100 and 500 kWe (2.53 t in
    v0.28).
- **FSP's Stirling conversion and power management, not fitted:**
  - The model charges conversion per generated kWe, so the comparison is now
    FSP's mass per gross kWe: 903 kg / 48 kWe = 18.8 kg/kWe.
  - The refit's 17.74 kg/kWe is 6% under it.
- **The cable's fixed mass, refit:**
  - Mason's 40 kWe cable now carries 42.2 kW (its 40 kWe grossed up for the
    cable and the outpost's converter), so the designed 3 kVac cable is
    146 kg/km.
  - The pallet's 385 kg/km slope leaves 239 kg/km.
  - The shield-plus-cable optimum is 1.85 km, against Mason's 1.8 km.
- **The hole** (benchmark `mason-2006-reactor-excavation`, documentation-only):
  - At the reference heat it is Mason 2006's 12.6 m³: 22.6 t at 1,800 kg/m³.
  - The default plant's fleet digs its larger hole inside commissioning.
- **Skin effect, a check:**
  - Barth & Pike quote a 6% resistance rise for 12 AWG wire at 2 kHz.
  - The isolated round-wire solution gives under 1% for that wire, whose
    radius is half an aluminium skin depth there; the model does not
    reproduce their figure.
  - The default 1 MWe plant's 4.8 mm AC conductor is 1.8 skin depths thick,
    so the note fires. A 40 kWe or polar plant's conductor stays inside its
    skin depth.
- **Radiator optimum:** the refit's lighter reactor moves the Brayton
  radiator's lightest cold end from near 414 K to near 420 K, against Mason
  2006's 400 K. At 900 K it stays near 376 K, against Mason's 380 K.

## Numbers that moved

1 t/day product, default inputs (1 km, surface) except as named. v0.29 is
v0.28's DC default.

| Case | v0.29 (DC) | **v0.30 AC (default)** | v0.30 DC |
|---|---|---|---|
| Equatorial MRE: landed | 50.35 t | **50.38 t** | 53.10 t |
| Equatorial MRE: cable | 726 kg, 8 kV | **1,132 kg, 4.9 kVrms** | 743 kg, 8 kV |
| Equatorial MRE: converter loss | not charged | **57.9 kW** | 188.7 kW |
| Equatorial MRE: best separation | ~1.8 km, 49.64 t | **~1.55 km, 49.91 t** | ~1.8 km, 52.34 t |
| Equatorial MRE: buried at 100 m | 50.15 t | **49.84 t** | 52.89 t |
| MRE, 10 t/day: landed | 452.65 t | **452.8 t** | 477.6 t |
| MRE, 10 t/day: buried at 100 m | | **444.9 t** | 472.2 t |
| Polar ice: landed | 21.98 t | **22.02 t** | 22.82 t |
| Polar ice: best separation | ~2.05 km, 21.34 t | **~1.85 km, 21.49 t** | ~2.1 km, 22.13 t |
| Stirling, 1,050/500 K | 57.36 t | **57.37 t** | |
| Solar/nuclear crossover, equator / pole | 2.05 / 4.48 kW | **2.06 / 4.50 kW** | |

The buried reactor's hole:

| Case | Hole | Fleet time | First product |
|---|---|---|---|
| Equatorial MRE, 1 t/day | 63.5 t | 11.7 days | day 30 (commissioning) |
| MRE, 100 kg/day | 29.7 t | 10.9 days | day 30 |
| MRE, 10 t/day | 135.6 t | 2.9 days | unchanged (six landings) |
| Polar ice | 41.3 t | 0.9 days | day 30 |

What the tables show:
- **The refit keeps the default plant within 0.03 t.** The converters' 58 kW
  costs reactor, conversion and radiator, and the refit returns it, so Mason
  2001's marginal mass still holds.
- **DC now costs 2.7 t at the default plant and 25 t at 10 t/day:** three
  times the conversion loss for a cable 0.4 t lighter. The model now agrees
  with NASA's current choice.
- **Burial:** on the AC line a buried reactor at 100 m and a surface reactor at
  its best separation land within 0.1 t at 1 t/day.
  - A 10 t/day plant saves about 8 t buried.
  - A 40 kWe system stays lighter on the surface: 2.52 t at 1.9 km against
    2.80 t buried, as NASA chose.
- **The hole rarely delays anything:** the plant's fleet is sized for its
  daily mining, so the hole takes days.
  - It sets the first product only when commissioning is short. With
    Kleinhenz & Paz's 2-day commissioning, the default buried plant starts on
    day 11.7.
- **The Stirling's extra converter stage** costs it 11% of its output against
  2% for a Brayton on AC. At 1,050/500 K its radiator grows by 16%, to 1,093 m², while the refit holds its landed mass.

Regression anchors moved deliberately, each marked "v0.30":
- **Anchors moved:**
  - the default and polar landed masses
  - the fission anchors from v0.21 through v0.28
  - the fixed-seed uncertainty anchor, 50.278 → 50.306 days
- **Tests rewritten** where they took DC as the default (v0.25, v0.27, v0.28):
  - they now name the form they test
  - the cable's loss is checked against the power the cable carries
- **The pinned v0.17–v0.21 fission sets** now also pin lossless converters and
  the DC line they were written for, so what they test holds.
- **New v0.30 anchors in both suites:**
  - each end's efficiency by converter and form
  - the default plant's converter loss
  - the DC plant
  - the skin-depth note
  - the hole at its reference heat and at the default plant
  - the first product with short commissioning
  - the polar hole before the strip
  - no hole for a solar plant

Golden vectors were regenerated:
- the Latin hypercube now runs one sample in five as DC rather than AC
- the named scenario `fission-cable-ac` becomes `fission-cable-dc`
- the parity set stays 221 vectors

## In the app

- **Rail:**
  - The power group gains the four converter efficiencies and the AC line's
    frequency, which is hidden under DC.
  - Under buried it shows the hole's diameter and depth, hidden on the surface.
  - THREE-PHASE AC now leads the TRANSMISSION select.
- **Evidence:** each new input cites its source section. The cable form,
  siting, separation, voltage cap, fixed cable mass and Tsink evidence give
  the v0.30 numbers.
- **Siting note:** under buried, the note now says the fleet digs the hole
  before the first product.
- **Power panel:**
  - a CONVERTERS line gives the loss at the two ends
  - under buried, a REACTOR HOLE line gives its mass and the fleet's days
- **Campaign panel:** when the groundwork outlasts commissioning, the start
  phase and caption name it: digging the reactor's hole, stripping the first
  overburden, or both.
- **Links:** a link without `cableForm` now opens on AC. Saved library cases
  store every input and keep their form.

Screenshots:
- [the hole's evidence under buried, with the power panel's CONVERTERS and REACTOR HOLE lines](screenshots/excavation-converters/reactor-hole.png)
- [the transformer's evidence at the AC default](screenshots/excavation-converters/converters.png)

## Verification

- **Regression (v0.30):** in both suites.
- **Benchmarks:**
  - `nasa-fsp-pmad-chain` (calibration) checks the chains against Mason 2006,
    FSP 2008, Oleson 2022 and Mason 2025.
  - `mason-2006-reactor-excavation` (documentation-only) checks the hole.
  - `mason-2001-*` still check the marginal masses.
  - `mason-2025-fsp-separation` checks the refit cable and its optimum.
- **App:** `fission-converter.test.tsx` covers:
  - the AC default and a switch to DC from the rail
  - the link
  - each new input's visibility, activity and evidence
- **App:** `campaign-panel.test.tsx` covers the hole and the polar hole-and-strip
  wording.
- **Parity:** 221 golden vectors.
- **Size budget:** the engine is 238,755 B, within 240 KiB.

## Left for later

- **The converters' mass and heat.** Their mass stays in the conversion and
  power management mass per kWe, which Mason 2006 found does not change
  significantly between AC and DC. Their own radiators are not charged, nor
  the outpost's control power and auxiliary loads.
- **Skin effect as mass.** Stranding is taken as free; Litz wire's packing,
  or parallel feeds' extra insulation, would add some.
- **Digging energy, a berm, and the hole's spoil as feedstock.**
- **Terrain attenuation,** from v0.29.
