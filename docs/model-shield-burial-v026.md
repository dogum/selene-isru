# A buried fission reactor v0.26

This continues the audit trail from
[`model-shield-separation-v025.md`](model-shield-separation-v025.md). It left
burial open:
- the fission shield was Mason 2025's above-ground directional shield, sized to
  shadow the outpost, so a reactor close to the outpost needed a very heavy
  shield
- NASA's 2008 FSP design instead buried its reactor and sited it 100 m away

**What changes:** a reactor siting switch.
- **Surface** stays the default, and no default result moves.
- **Buried** puts the reactor in an excavated hole:
  - the regolith shields the outpost
  - an Earth-delivered plug shield protects the converters above the hole
  - the shield no longer depends on separation, so the reactor can sit 100 m
    from the outpost and save most of its cable

> **Model boundary:** the buried shield is one NASA design's plug shield, grown
> with reactor power by the same exponent as the surface shield. It is not a
> dose calculation: the hole's depth, the berm, and the converters' dose limits
> are that design's. Digging the hole and installing the reactor are not
> charged. TypeScript/Python parity proves the two implementations agree, not
> that the answer is right.

## Why

- **NASA's surface fission studies weigh two sitings:**
  - **Emplaced:** the reactor goes into the ground, and regolith does the
    outpost's shielding (Mason 2006's crew-deployed systems, FSP 2008's
    reference design).
  - **Landed:** the reactor stays on the surface behind its own shield, away
    from the outpost (Mason 2006's self-deployed systems, FSP 2008's landed
    option, Mason 2025's current design).
- **The trade:**
  - **Burial** needs regolith-moving equipment and crew help.
  - **A landed reactor** needs a heavier shield or a longer cable.
- **What the model had:** only the landed siting, so it could not show what
  burial buys an ISRU plant that already moves regolith.

## What the model computes

```
surface   shield = MshieldKg       · max(1, Q / QshieldRefKwt)^nShield · (1 km / d)^nShieldDistance   [kg]
buried    shield = MshieldBuriedKg · max(1, Q / QshieldRefKwt)^nShield                                [kg]
```

- **`fissionSiting`** chooses `surface` (the default) or `buried`.
- **Shared by both:**
  - the reactor, conversion, and radiator
  - the cable to the outpost and its loss (v0.25)
  - the separation `dSeparationKm`, which still sets the cable's length
- **Siting-specific inputs:** each siting's own shield inputs act only when it
  is chosen, and the rail hides the other's:
  - surface: `MshieldKg` and `nShieldDistance`
  - buried: `MshieldBuriedKg`
- **The buried optimum:** the shield no longer depends on separation, so a
  buried reactor is lightest at the 100 m minimum, FSP 2008's siting.
- **`fissionShieldKg`** takes the siting into account; no new result fields.

| Key | Default | Range | Basis |
|---|---|---|---|
| `fissionSiting` | surface | surface, buried | Model switch |
| `MshieldBuriedKg` | 1,676 kg | 300–8,000 | FSP 2008, Table II: the 175 kWt emplaced reactor's plug shield |

## The sources

**FSP 2008** (Mason, Poston & Qualls, NASA/TM-2008-215166), already the source of
the radiator's areal mass (v0.17):
- **Emplaced configuration:** the reactor goes into a pre-excavated hole, and
  regolith provides the line-of-sight shielding to the habitat.
- **The Earth-delivered shield** protects the converters and radiator above it.
- **Siting:** about 100 m from the outpost, at under 5 rem/yr in every direction.
- **Table II:**
  - a 1,676 kg boron carbide and stainless shield with a 1.2 m axial plug
  - sized to keep the Stirling converters under 2 Mrad and 1×10¹⁴ n/cm²
  - "In the buried/emplaced configuration, the need for shielding is largely
    driven by the dose limits of the power conversion components."
- **The landed option:** an on-board shield, 1 km, 2,000 V. It is 80% heavier
  at 40 kWe.

**Mason 2006** (NASA/TM-2006-214120), Reactor Shielding Options:
- **The excavation shield:**
  - a vertical hole about 2 m wide and 4 m deep
  - a tungsten and lithium hydride shadow shield over the reactor, and a
    Boral liner
  - under 5 rem/yr at about 6 m from the reactor
- **The on-board shield** is four times the excavation shield's mass, and the
  self-deployed systems about twice the mass.

## Calibration and cross-checks

- **The buried shield:** FSP 2008's 1,676 kg at its 175 kWt reactor. That is the
  same reference heat as the surface shield, so `QshieldRefKwt` serves both
  (benchmark `mason-2008-fsp-emplaced-shield`).
- **Separation does not size it:** the benchmark checks the buried shield at
  0.1, 1, and 5 km.
- **Not reproduced: the older studies' factor of two.**
  - **What those studies compared against:** their on-board shields were 4-pi
    or wide-sector designs, which made the landed system about twice the
    emplaced one.
  - **What the model compares against:** its surface shield is Mason 2025's
    36° directional shield, 1,370 kg at 1 km: 0.82 of the buried shield, not
    four times it.
  - **Where burial pays:** close siting and a short cable, not a lighter shield.
- **Burial against the surface, each at its best separation:**

  | Case | Surface at 1 km | Surface at its best | Buried at 100 m |
  |---|---|---|---|
  | 40 kWe system (shield + cable) | 1.76 t | 1.47 t (1.86 km) | 1.71 t |
  | 100 kg/day MRE | 6.95 t | 6.62 t | **6.84 t** |
  | Polar ice | 21.95 t | 21.64 t | **21.61 t** |
  | Equatorial MRE, 1 t/day | 50.40 t | 50.34 t | **48.77 t** |
  | MRE, 10 t/day | 455.7 t | 451.0 t | **435.6 t** |

- **Agreement with NASA:** the model's 40 kWe system is lighter on the surface
  at its best separation, which is the siting NASA's current 40 kWe design
  chose. Megawatt plants, whose cable carries more power, gain most from
  burial.

## Numbers

Burial is opt-in, so no default result moves. Buried at 100 m against the
surface default at 1 km; 1 t/day product unless named.

| Case | Shield (kg) surface / buried | Cable (kg) | Cable loss (kW) | Fission (t) | Landed (t) | Landings |
|---|---|---|---|---|---|---|
| Equatorial MRE | 3,792 / 4,616 | 2,343 / 231 | 16.8 / 1.7 | 29.77 / 28.14 | 50.40 / 48.77 | 1 / 1 |
| MRE, 100 kg/day | 1,777 / 2,163 | 508 / 51 | 1.7 / 0.2 | 4.83 / 4.72 | 6.95 / 6.84 | 1 / 1 |
| MRE, 10 t/day | 8,101 / 9,861 | 20,657 / 2,035 | 167.7 / 16.5 | 249.6 / 229.5 | 455.7 / 435.6 | 6 / 6 |
| Polar ice | 2,470 / 3,006 | 859 / 85 | 4.6 / 0.5 | 10.03 / 9.69 | 21.95 / 21.61 | 1 / 1 |
| Polar propellant | 3,619 / 4,405 | 2,073 / 205 | 14.6 / 1.4 | 26.29 / 24.90 | 73.78 / 72.40 | 1 / 1 |

What the table shows:
- **The buried shield is 22% heavier** than the surface shield at 1 km. FSP
  2008's plug shield is sized for the converters right above the reactor.
- **The cable more than pays for it:** at 100 m it is a tenth as long and loses
  a tenth as much power.
  - **Default plant:** lands 1.6 t lighter.
  - **10 t/day plant:** lands 20 t lighter, still in six landings.
- **A buried reactor at 1 km** is heavier than a surface one (51.25 t at
  1 t/day): burial only pays if the reactor moves in.

Regression anchors: no existing anchor moves. New v0.26 anchors in both suites
cover:
- the buried default plant at 100 m
- a buried shield that does not change with separation
- the 10 t/day plant
- an unsupported siting resetting to the surface

Golden vectors were regenerated:
- the Latin hypercube runs one sample in seven buried
- a named buried-at-100 m scenario brings the parity set to 220 vectors

## In the app

- **Rail:** the power group gains a REACTOR SITING select at both sites, beside
  the converter.
  - **Under buried** it shows the buried shield's mass and hides the surface
    shield and its distance exponent.
  - **Under surface** it hides the buried shield.
  - **Note under buried:** it states that the regolith shields the outpost, the
    100 m siting, and what is not charged.
- **Evidence:**
  - The siting and the buried shield each cite FSP 2008 and Mason 2006.
  - The separation's evidence notes the buried optimum at 100 m.
- **Links:** `fissionSiting=buried` round-trips through a link.

Screenshots: [the siting select under buried, with its note](screenshots/shield-burial/buried-select.png), and [the buried shield's evidence over the power panel](screenshots/shield-burial/buried-siting.png)

## Verification

- **Regression (v0.26):** in both suites.
- **Benchmarks:** `mason-2008-fsp-emplaced-shield` checks:
  - the shield
  - its independence from separation
  - the disclosed ratio to the surface shield
- **App:** `fission-converter.test.tsx` covers:
  - the select
  - each siting's shield shown and the other's hidden and inert
  - switching from the rail
  - the link
- **Parity:** 220 golden vectors.
- **Size budget:** the engine is 227,809 B, within 224 KiB.

## Left for later

- **The excavation itself.**
  - **The hole:** Mason 2006's 2 m by 4 m hole is about 20 t of regolith, a few
    days of the default plant's 4.4 t/day of mining.
  - **What is not charged:** its time, energy, and the crew-assisted
    installation; a berm would add more.
- **A shield sized by depth.** A deeper hole needs less plug shield; the model
  holds FSP 2008's design.
- **Transmission voltage with power,** and **topography,** from v0.25.
