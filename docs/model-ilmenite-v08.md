# Ilmenite reduction v0.8

This continues the audit trail from [`model-audit-v02.md`](model-audit-v02.md),
[`model-depth-v03.md`](model-depth-v03.md),
[`model-fidelity-v04.md`](model-fidelity-v04.md),
[`model-campaign-v05.md`](model-campaign-v05.md),
[`model-propellant-v06.md`](model-propellant-v06.md), and
[`model-refuel-v07.md`](model-refuel-v07.md). It adds a second way to make
oxygen at the equator. MRE stays the default, and no earlier result moves.

> **Model boundary:** the ilmenite plant is a calibrated screening model of
> one conceptual design. It is not a reactor, kinetics, beneficiation, or
> separation model. TypeScript/Python parity proves the two implementations
> agree, not that the answer is right.

## Why

Molten regolith electrolysis (MRE) was the only equatorial process. Hydrogen
reduction of ilmenite is the most studied alternative and has the longest
heritage. It runs near 1,000 °C instead of 1,600 °C, and its chemistry has
been demonstrated on lunar samples. Its weakness is grade: ilmenite gives up
only 10.5% of its mass as oxygen, and mare soil holds a few percent ilmenite.
So the plant handles hundreds of kilograms of soil per kilogram of oxygen.
A trade tool should show what that costs.

## What the model computes

`equatorialProcess` chooses the process: `mre` (default) or `ilmenite`. The
polar site ignores it.

**Soil chain.** Soil is mined and sized to the reactor's feed window. Its
ilmenite is concentrated magnetically, and part of what the reactor is fed is
reduced, FeTiO₃ + H₂ → Fe + TiO₂ + H₂O. The soil mined per kg of oxygen is:

```
soil = 1 / (fIlmenite × fIlmSized × etaIlmRecovery × fIlmConversion × xO)
xO   = M_O / (M_FeO + M_TiO2) = 0.1055
```

The concentrate carries the fed ilmenite at `ilmConcentrateGrade`. A
separator cannot return more than it is fed, so a grade no better than the
sized soil's sends the whole sized feed to the reactor.

**Energy per kg of oxygen.**
- Mining: `eIlmMining × soil`.
- Beneficiation (sizing, magnetic separation, handling): `eIlmBeneficiation × soil`.
- Feed heat: `concentrate × cpIlmeniteFeed × (TIlmReactor − Tambient) × (1 − etaIlmHeatRecovery)`.
- Reduction heat: `dHIlmeniteReduction × ilmenite reduced`.
- Reactor loss: `fIlmHeatLoss × (feed heat + reduction heat)`, which covers wall loss, heater inefficiency and gas recycle.
- Water electrolysis: 1.125 kg of water per kg of oxygen, split by the same
  electrolyzer as polar propellant mode (`Vel`, `etaFaradayEl`). Its hydrogen
  returns to the reactor.
- Liquefaction and storage: the LOX cryo block, as for MRE.

**Mass.**
- Excavation fleet: `kIlmMiningMass × soil mined per day`.
- Beneficiation plant: `kIlmBeneficiationMass × soil mined per day`, listed
  as its own manifest row.
- Reactor block: `kIlmReactorMass × oxygen per day`.
- Electrolyzer: `kElectrolyzerMass × water per day`.

**What it leaves.** The plant makes no castable melt, so it feeds no slag to
construction. The spent solids carry metallic iron, 0.37 kg per kg of
ilmenite reduced. The model reports that iron but does not credit it.

`simulate()` returns the chain as `result.ilmenite`, which is null on the MRE
route. It carries:
- the soil, concentrate, tailings, water, hydrogen-recycle, spent-solids, and
  iron flows
- the six energy terms
- the four masses

The energy and material ledgers gain beneficiation, reduction, and
water-electrolysis nodes. All of them close.

### Why mining has its own inputs

MRE and the polar plant keep `eMining` (120 kJ/kg) and an excavation fleet
scaled with *product*. The v0.4 audit already flagged that basis as a
calibration item. It matters little for MRE, which mines 4.4 kg of soil per
kg of oxygen. An ilmenite plant mines 327 kg, so on that basis mining alone
would cost 10.9 kWh/kg. Both ilmenite plant studies put loose-soil excavation
near 10–12 kJ/kg. So the ilmenite route scales its fleet with soil mined and
uses its own two inputs from those studies. Re-basing MRE and the polar plant
is left for the excavation calibration pass.

## Inputs

| Input | Default | Range | Basis |
|---|---|---|---|
| `fIlmenite` | 0.075 kg/kg | 0.005–0.25 | Eagle Engineering 1988, *Conceptual Design of a Lunar Oxygen Pilot Plant* (EEI 88-182, [NTRS 19890004515](https://ntrs.nasa.gov/citations/19890004515)), Table 6-1: mare soil at 7.5 wt%. High-Ti mare soil reaches about 17 wt% and highland soil about 1 wt% (Guerrero-Gonzalez & Zabel 2023, Fig. 10). |
| `fIlmSized` | 0.438 | 0.2–0.9 | Eagle, Table 6-1: 44.9% of soil 10084 is below and 11.3% above the 0.045–0.5 mm feed window. |
| `etaIlmRecovery` | 0.98 | 0.5–1 | Eagle, Table 6-1 and App. A.9: a multi-stage induced magnetic roll. |
| `ilmConcentrateGrade` | 0.9 kg/kg | 0.1–1 | Eagle, App. A.9: a 90 wt% concentrate. Guerrero-Gonzalez & Zabel cap magnetic enrichment at 3×, from simulant data. |
| `fIlmConversion` | 0.9 | 0.2–1 | Eagle, Table 6-1: a three-stage fluidized bed with a 4 h residence. Sargeant et al. 2020 measured about a third in short static runs at 1,000 °C. |
| `TIlmReactor` | 1,273 K | 1,073–1,373 | Eagle, Sec. 6.2: 1,000 °C and 10 atm. |
| `etaIlmHeatRecovery` | 0.5 | 0–0.9 | Eagle, Sec. 6: the counter-current reactor recovers half the feed heat. |
| `fIlmHeatLoss` | 0.25 | 0–1 | Calibrated so the model reproduces Eagle's 1,160 kW process power (Table 6-5). |
| `eIlmMining` | 10.1 kJ/kg | 3–150 kJ/kg | Guerrero-Gonzalez & Zabel 2023, *Acta Astronautica* 203 ([doi:10.1016/j.actaastro.2022.11.050](https://doi.org/10.1016/j.actaastro.2022.11.050)), Sec. 3.4.1 and Table 2: RASSOR, 19.3 kW for 61 vehicles of 2.7 t/day. Eagle gives 11.9 kJ/kg. |
| `kIlmMiningMass` | 0.0244 kg/(kg/day) | 0.005–0.2 | Same source: 66 kg per 2.7 t/day. Eagle gives 0.014. |
| `eIlmBeneficiation` | 87 kJ/kg | 20–200 kJ/kg | Eagle, Table 6-5: 1,002 kW for 995 t/day. Guerrero-Gonzalez & Zabel give about 58 kJ/kg. |
| `kIlmBeneficiationMass` | 0.094 kg/(kg/day) | 0.02–0.5 | Eagle, Table 6-5: 93.6 t for 995 t/day. Guerrero-Gonzalez & Zabel give about 0.22. |
| `kIlmReactorMass` | 18.6 kg/(kg/day) | 5–60 | Eagle, Table 6-5: the 65.1 t process area at 1,000 t/yr, less the electrolyzer, liquefier and tanks in the Table 6-3 pilot proportion (87%). |

Physical constants:
- `cpIlmeniteFeed`: 1,080 J/(kg·K), Eagle's 0.3 kWh/(t·°C).
- `dHIlmeniteReduction`: 294 kJ per kg of ilmenite reduced, at 900 °C (Eagle, App. A).

The ilmenite route also uses `Tambient`, `Vel`, `etaFaradayEl`, and
`kElectrolyzerMass`. The rail shows them in the ilmenite group, because
their own groups are not shown on this route.

## Calibration check

At Eagle's 1,000 t/yr soil-fed plant (3,044 kg/day running at 90% duty, feed at
0 °C, with Eagle's mining figures), compared with Eagle Table 6-5 before its
30% margin:

| Term | Eagle | This model |
|---|---|---|
| Soil mined | 995 t/day | 996 t/day |
| Mining power / fleet | 137 kW / 14.3 t | 137 kW / 14.3 t |
| Beneficiation power / mass | 1,002 kW / 93.6 t | 1,003 kW / 93.6 t |
| Process power: reactor, Eagle's electrolysis and liquefier | 1,160 kW | 1,157 kW |
| Process mass | 65.1 t | 56.6 t reactor block, plus electrolyzer, liquefier and tanks |

Most of this agrees by construction: these inputs were taken from the same
table. The check confirms the soil chain, the feed and reduction heat, and
the loss fraction combine as Eagle's did. It is not independent validation.

In the full model at that rate, process power is 1,382 kW, not Eagle's
1,160. The difference comes from the tool's own models:
- The electrolyzer is a 1.8 V cell, 6.35 kWh per kg of oxygen, against
  Eagle's solid-oxide cell at 72%, 5.5 kWh/kg.
- LOX conditioning uses NASA's 1.32 kWh/kg (v0.6), against Eagle's
  0.46 kWh/kg.

## Reference results

Default inputs except as named, 1 t/day of oxygen, nuclear power selected in
every case.

| Case | Soil (t/day) | Energy (kWh/kg) | Grid (kW) | Landed (t) | Payback (day) | Return |
|---|---|---|---|---|---|---|
| MRE (default) | — | 23.9 | 996 | 60.4 | 242 | 6.63× |
| Ilmenite, mare soil 7.5 wt% | 327 | 19.8 | 825 | 93.7 | 586 | 3.52× |
| Ilmenite, high-Ti mare 15 wt% | 164 | 15.4 | 641 | 68.9 | 243 | 6.39× |
| Ilmenite, highland 1 wt% | 2,454 | 77.2 | 3,216 | 417.3 | 1,915 | 1.21× |
| Ilmenite, enrichment 3× (22.5 wt% concentrate) | 327 | 26.5 | 1,106 | 102.2 | 588 | 3.45× |
| Ilmenite, a third reduced | 893 | 38.9 | 1,622 | 184.6 | 968 | 2.20× |
| Ilmenite, no feed-heat recovery | 327 | 22.1 | 919 | 96.6 | 586 | 3.50× |
| Ilmenite, Guerrero-Gonzalez & Zabel beneficiation | 327 | 17.2 | 715 | 131.7 | 597 | 3.24× |
| Ilmenite, MRE's mining energy (120 kJ/kg) | 327 | 29.8 | 1,242 | 106.2 | 589 | 3.42× |
| Ilmenite, 10 t/day | 3,273 | 19.8 | 8,230 | 923.3 | 1,485 | 5.47× |

What the table shows:
- **Ilmenite uses less power but lands more.** At mare grade it takes 17%
  less energy per kg than MRE. It lands 55% more, mostly the 30.8 t
  beneficiation plant, so payback moves from day 242 to day 586.
- **Grade decides.** At 15 wt% the soil handled halves, and payback matches
  MRE's. At highland grade (1 wt%) the plant mines 2,450 t a day and barely
  returns its launch mass.
- **Beneficiation dominates.** At mare grade, sizing and separation take
  7.9 of 19.8 kWh/kg. Fine screening at low unit capacity drives that in both
  studies. The two studies differ 2.3× in its mass, so it is the input most
  worth better data.
- **Conversion matters more than heat.** Reducing a third of the feed, as in
  short static runs, nearly triples the soil handled. Losing all heat
  recovery adds only 2.2 kWh/kg. A lean concentrate adds reactor heat but
  hardly moves payback, because nuclear power is light.
- **The iron is free.** The spent solids carry 3.5 t of metallic iron for every
  t of oxygen. Nothing in the model uses it yet.

## In the app

- **Rail:** an *Oxygen process* group at the equator holds the switch. While
  ilmenite is chosen, it also shows the 13 ilmenite inputs and the four shared
  ones. On that route the MRE group, the slag construction group, and the
  product-scaled excavation inputs are hidden, because nothing they set can
  act. Tests check this.
- **Energy:** the Sankey gains *beneficiation* and *H₂ reduction* stages.
  - The Brief drivers, the report's energy table and the comparison bars now
    charge energy to the stage that spends it.
  - Before, all three grouped energy by where it flowed *to*. That
    mislabelled MRE's excavation energy as "melt heating" and its melt heat
    as "electrolysis".
- **Scene:** the reactor model stands in for the ilmenite plant, and its
  labels and inspector say so.
  - Its glow follows the reactor heater power, scaled to match MRE per kg of
    oxygen at the defaults.
  - The casting yard reads *idle*, and the process overlay draws soil and
    tailings instead of slag.
- **Reports and exports:**
  - The report gains an ilmenite section.
  - The study CSV gains twelve `ilmenite.*` columns and a beneficiation-plant
    manifest column.
  - The case summary names the plant and the soil it mines.
  - URLs round-trip the process.
- **Analysis:**
  - Trade-study axes and uncertainty choices follow the running process
    (ilmenite grade, concentrate grade, heat recovery, conversion,
    beneficiation energy).
  - The Brief keeps searching MRE levers and runs its equatorial candidates as
    MRE, as its titles say.
- **Presets:** "Ilmenite Reduction (Mare Soil)" and "Ilmenite Reduction
  (High-Ti Mare)".
- **Custom Site** plans the MRE plant only, since its catalog has no ilmenite
  equipment. Its rail has no process switch, and a design that asks for
  ilmenite is evaluated as MRE, with an info finding that says so.

## Verification

- `packages/engine/test/ilmenite.test.ts` and `python/tests/test_ilmenite.py`
  check that:
  - the soil chain reproduces Eagle's Table 6-1
  - every node conserves mass and energy, including a lean plant mining 98,000 t a day
  - each energy line is its stated term
  - the Eagle calibration holds
  - grade scales the soil handled but not the reactor
  - the separator cannot return more than its feed
  - each process ignores the other's inputs
- **Parity:**
  - The Latin hypercube now also samples `equatorialProcess`.
  - There are 217 golden vectors, 52 on the ilmenite route, including two new
    named scenarios (Eagle's mare soil, and a high-Ti soil with no enrichment
    under a crewed sortie).
- **Material tolerance:** the material ledger's residual tolerance now scales
  with the flow, as the energy ledger's does. A lean plant mines thousands of
  tonnes a day, where float rounding exceeds a fixed 1e-9 kg/day.
- **Regression anchors** (new and deliberate):
  - At mare grade: 327 kg of soil per kg, 19.81 kWh/kg, 825 kW, 93.75 t, and
    payback on day 586.
  - At 15 wt%: payback on day 243.
- **App:** `packages/app/test/ilmenite-app.test.tsx` covers:
  - rail visibility, with every hidden input inert
  - the switch, URL, summary, and stage labels
  - process edges, reactor glow, levers, evidence, and the CSV
  - presets, and the Custom Site rail
- **Size budget:** the engine ratchet goes from 176 to 192 KiB for the new
  model and its cited parameters.

Screenshots: [rail](screenshots/ilmenite/ilmenite-rail.png),
[energy](screenshots/ilmenite/ilmenite-energy.png),
[report](screenshots/ilmenite/ilmenite-report.png),
[inspector](screenshots/ilmenite/ilmenite-inspector.png), and
[mobile](screenshots/ilmenite/ilmenite-mobile.png).

## Left for later

- **Excavation basis for MRE and the polar plant.** Re-base `eMining` and
  `kExcFleet` on soil moved, using the same two studies (v0.4 item).
- **Reactor mass with feed.** The reactor block scales with oxygen output,
  so lean concentrates understate it. Eagle's no-separation trade added 46% to
  process mass for 12 times the feed.
- **Conversion from kinetics.** Tie `fIlmConversion` to temperature, grain
  size and residence time, and reduce FeO in other minerals too.
- **Iron and tailings.** Credit the metallic iron, and bag or berm the
  tailings for shielding.
- **A dedicated scene.** A beneficiation plant, fluidized-bed reactor, and
  electrolyzer in place of the borrowed MRE model.
- **Basalt feed.** Eagle's crushed-basalt case (25 vol% ilmenite) needs
  crushing and grinding stages.
