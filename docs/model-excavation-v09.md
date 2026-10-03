# Excavation basis v0.9

This continues the audit trail from [`model-audit-v02.md`](model-audit-v02.md),
[`model-depth-v03.md`](model-depth-v03.md),
[`model-fidelity-v04.md`](model-fidelity-v04.md),
[`model-campaign-v05.md`](model-campaign-v05.md),
[`model-propellant-v06.md`](model-propellant-v06.md),
[`model-refuel-v07.md`](model-refuel-v07.md), and
[`model-ilmenite-v08.md`](model-ilmenite-v08.md). It bases every plant's mining
on the soil it moves, and adds the overburden the polar pit mine strips. Every
MRE and polar result moves; the ilmenite route does not.

> **Model boundary:** the excavation fleet is a continuous screening
> correlation from published RASSOR-class designs. It is not a vehicle,
> traction, wear, or traverse model. TypeScript/Python parity proves the two
> implementations agree, not that the answer is right.

## Why

Before v0.9, MRE and the polar plant:
- charged mining 120 kJ per kg of soil, an uncited "fleet-level estimate";
- sized the excavation fleet per kg of *product*, at 8.5 kg per kg/day,
  whatever soil that product needed.

So a 1 wt% ice deposit moved five times the soil of a 5 wt% one with the
same fleet. And MRE landed an 8.5 t fleet to move 4.4 t of soil a day, about
80 times what RASSOR-class excavators need for that rate.

The v0.4 audit flagged the basis as a calibration item. v0.8 put the ilmenite
route on a soil basis from two plant studies and left MRE and the pole for
this pass.

## What the model computes

```
soil moved per kg  = regolith per kg × (1 + overburdenRatio)   at the pole
                   = regolith per kg                           at the equator
mining energy      = eMining × soil moved per kg               [J per kg of product]
fleet mass         = kMiningMass × soil moved per day          [kg]
```

- **Regolith per kg** is unchanged:
  - MRE: 1 / `xO2Effective`.
  - Pole: 1 / (`chiIce` × `etaIceCapture`).
  - Ilmenite: its soil chain.
- **Overburden** is the dry, desiccated layer over polar ice. The pit mine
  strips it to reach the icy regolith and dumps it at a spoil site. It is not
  fed to the plant, so the plant's feed, the material ledger, and the extractor
  are unchanged. Equatorial plants mine the surface soil itself, which has no
  overburden.
- **One set of inputs** serves every plant. The ilmenite route's own mining
  inputs meant the same quantities and are merged into them, with their values
  unchanged.
- `result.excavation` gains:
  - `soilMovedKgPerDay`: the plant's feed plus any overburden.
  - `overburdenKgPerDay`.

## Inputs

| Input | Default | Range | Basis |
|---|---|---|---|
| `eMining` | 10.1 kJ/kg | 3–150 kJ/kg | Guerrero-Gonzalez & Zabel 2023, *Acta Astronautica* 203 ([doi:10.1016/j.actaastro.2022.11.050](https://doi.org/10.1016/j.actaastro.2022.11.050)), Sec. 3.4.1 and Table 2: a RASSOR fleet uses 19.3 kW for 61 vehicles of 2.7 t/day on 100 m hauls. Eagle Engineering 1988 (EEI 88-182, [NTRS 19890004515](https://ntrs.nasa.gov/citations/19890004515)), Table 6-5, gives 11.9 kJ/kg. Kleinhenz & Paz 2020 mine icy regolith with the same RASSOR. |
| `kMiningMass` | 0.0244 kg/(kg-regolith/day) | 0.005–0.2 | Same sources: a 66 kg RASSOR moves 2.7 t/day. Eagle gives 0.014. NASA's polar mine comes to about 0.1, with whole vehicles and margin (below). |
| `overburdenRatio` | 0.667 kg/kg | 0–5 | Kleinhenz & Paz 2020, *Case Studies for Lunar ISRU Systems Utilizing Polar Water*, AIAA 2020-4042 ([NTRS PDF](https://ntrs.nasa.gov/api/citations/20205007966/downloads/PolarWaterISRUstudy_Kleinhenz_final.pdf)), Sec. IV-A and Table 3: 20 cm of overburden over a 30 cm mined depth. Polar only. |

**Retired:**
- `kExcFleet`: the per-product fleet factor.
- `eIlmMining` and `kIlmMiningMass`: now `eMining` and `kMiningMass`.

The old 120 kJ/kg stays inside the `eMining` range, so earlier mining
assumptions can still be studied.

## Comparison with NASA's polar mine

Kleinhenz & Paz's baseline:
- **Throughput:** 398 t of icy regolith over 223 production days, which is
  15 t of water at 5 wt% and 75% extraction.
- **Overburden:** 20 cm stripped to mine 30 cm.
- **Excavators:** two RASSORs.
- **Fig. 8, read off its log axes:** about 161 kg of excavators drawing about
  212 W, both including the study's margins.

The model at that case:

| | Model | Study |
|---|---|---|
| Soil moved | 2,989 kg/day | 398 t of ore and about 266 t of overburden |
| Fleet mass | 73 kg | ~161 kg |
| Mining power | 349 W | ~212 W |

- **Mass.** The study rounds up to two whole 66 kg vehicles for about 1.1
  vehicles' work, and adds its 20% growth margin: 2 × 66 × 1.2 = 158 kg,
  which reproduces the Fig. 8 bar. So the per-vehicle rate agrees, and the
  difference is rounding and margin. At the polar default of 1,000 kg/day, the
  fleet is about 16 vehicles' worth and rounding hardly matters.
- **Power.** The study's excavators idle while the extractor hopper is full,
  which works out to 5–6 kJ per kg of soil. The model's 10.1 kJ/kg is
  Guerrero-Gonzalez & Zabel's fleet working continuously.

This is recorded as the documentation-only benchmark
`kleinhenz-paz-2020-polar-excavation`. Its test reconstructs the 158 kg from
whole margined vehicles, and checks that the model's fleet and power sit
within a factor of 2.5 and 2 of the study's.

## Published numbers that moved

Default inputs except as named. Each cell is before → after.

| Case | Energy per kg (kWh/kg) | Grid (kW) | Landed (t) | Fleet (kg) | Leverage | Payback (day) | Return |
|---|---|---|---|---|---|---|---|
| Equatorial MRE | 23.89 → **23.76** | 996 → **990** | 60.37 → **51.81** | 8,500 → **108** | 181.4 → **211.4** | 242.0 → **240.8** | 6.63 → **6.88** |
| Polar water | 7.24 → **6.48** | 302 → **270** | 29.85 → **21.48** | 8,500 → **1,085** | 366.8 → **509.7** | 237.7 → **236.6** | 7.63 → **7.96** |
| Polar, 1 wt% ice | 24.54 → **20.72** | 1,023 → **863** | 70.68 → **62.82** | 8,500 → **5,423** | 154.9 → **174.3** | 243.5 → **242.4** | 6.35 → **6.56** |
| Polar + Sabatier | 14.92 → **14.16** | 622 → **590** | 65.09 → **56.72** | 8,500 → **1,085** | 186.0 → **213.4** | — | 0.79 → **0.80** |
| Polar propellant | 20.78 → **20.01** | 866 → **834** | 82.35 → **73.97** | 8,500 → **1,085** | 103.4 → **115.1** | 311.3 → **309.2** | 4.71 → **4.87** |
| Equatorial ilmenite | 19.81 | 825 | 93.75 | 7,985 | 116.8 | 585.5 | 3.52 |
| Crewed refuelling | 23.91 → **23.77** | 996 → **991** | 61.69 → **53.13** | 8,500 → **108** | 177.5 → **206.1** | not in campaign | 0.73 → **0.76** |

- **Payback barely moves** while landed mass falls by 8–9 t. A dedicated
  lander is charged whole, and every one of these plants still fits in one.
  The lighter fleet shows up in leverage, return, and the spares it no longer
  needs.
- **Lean polar ice** is where energy moves most. At 1 wt%, mining fell from
  4.44 to 0.62 kWh per kg of water, even with overburden added. What remains
  is heating 133 kg of soil per kg of water.
- **Ilmenite** is unchanged by construction: its inputs keep their values
  under the shared keys.

Regression anchors were updated deliberately in `regression.test.ts` and
`test_regression.py`, each with the value it moved from. Golden vectors were
regenerated.

## Saved cases and links

Records saved before v0.9 can carry the old keys. The app upgrades them when a
library loads, a study or case file is imported, or a link is opened
(`src/lib/legacyParams.ts`):

- **Renamed.** `eIlmMining` and `kIlmMiningMass` move to `eMining` and
  `kMiningMass` on an ilmenite case, so it reads exactly what it read before.
  On any other case they never acted and are dropped.
- **Retired.** `kExcFleet` has no soil-basis equivalent. It is dropped, and the
  case takes the soil-basis fleet.
- **Kept.** A saved `eMining` keeps its value, because energy per kg of soil
  meant the same thing before; only its default moved. Library cases store
  every input, so a case saved before v0.9 keeps 120 kJ/kg. The rail marks it
  as changed from default, and RESET applies the new value. Links carry only
  changed inputs, so an old link to a default case gets the new value.
- **Case files** report result drift on import, as after any model change.

`packages/app/test/legacy-params.test.ts` covers each path. Every test fails
with the upgrade switched off.

## Also fixed

**Campaign timeline end point.** The campaign timeline's docstring says its end
point reproduces the campaign's totals. Spent LEO mass agreed only to
rounding, because the timeline grouped the resupply term differently from
the closed form. The new numbers exposed a one-ulp mismatch in the campaign CSV
test. Both implementations now group it the same way, so the end point is
exact.

## In the app

- **Rail:**
  - The excavation group shows `eMining` and `kMiningMass` for every plant;
    they were hidden on the ilmenite route.
  - `overburdenRatio` shows at the pole only, and the hidden-input guard checks
    it is inert at the equator.
  - The group header reads the soil moved per day, not the blade-cutting
    diagnostic's 151 W.
  - A long unit such as kg/(kg-regolith/day) now wraps under its value instead
    of squeezing the input's name into a broken word. This also fixes the polar
    extractor-mass row.
- **Inspector:**
  - The haulers and the polar excavator use the shared inputs.
  - The polar excavator reads overburden stripped.
  - The MRE hauler reads soil moved.
- **Evidence:** range rationale and validity for the three inputs, including
  the NASA comparison and the unproven performance near ice saturation. The
  blade-cutting diagnostics now say their work is about 0.3% of mining energy,
  not 0.03%.
- **Uncertainty:**
  - Mining energy is offered on every route, at ±30%.
  - Overburden is offered at the pole, at ±50%.
  - The pole's default spread swaps mining energy, now a small term, for
    cold-regolith heat capacity.

Screenshots: [polar rail and overburden evidence](screenshots/excavation/polar-rail-overburden.png),
[polar excavator inspector](screenshots/excavation/polar-excavator-inspector.png), and
[equatorial mass manifest](screenshots/excavation/equatorial-mass.png).

## Verification

- **Regression anchors (v0.9):**
  - Equatorial: 108 kg fleet, 23.76 kWh/kg, 51.81 t, payback on day 240.8.
  - Pole: 1,085 kg fleet, overburden at 0.667 of the ore, 6.478 kWh/kg,
    21.48 t.
  - Pole at 1 wt%: 20.72 kWh/kg.
- **Ilmenite tests** now check that the route reads the shared inputs and
  ignores the polar overburden.
- **External benchmark:** `kleinhenz-paz-2020-polar-excavation`, in both test
  suites.
- **Parity:** 217 golden vectors, regenerated. The Latin hypercube samples
  `kMiningMass` and `overburdenRatio`.
- **Size budget:** the engine is 187,735 B, within 192 KiB.

## Left for later

- **Whole vehicles.** A small plant still needs one excavator, so a minimum
  fleet would matter below about 100 kg/day of product.
- **Haul distance.** Both studies assume about 100 m. Energy and fleet rate
  both scale with it, and it is not an input.
- **Digging icy regolith near saturation.** No data; RASSOR performance there
  is unproven.
- **Overburden timing.** The first strip delays production (Kleinhenz & Paz,
  Fig. 9C). The campaign's commissioning time could carry it.
- **Carried from v0.8:** reactor mass with feed, conversion from kinetics, iron
  and tailings credit, a dedicated ilmenite scene, and basalt feed.
