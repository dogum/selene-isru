# Polar propellant chain and liquefaction v0.6

This continues the audit trail from [`model-audit-v02.md`](model-audit-v02.md),
[`model-depth-v03.md`](model-depth-v03.md),
[`model-fidelity-v04.md`](model-fidelity-v04.md), and
[`model-campaign-v05.md`](model-campaign-v05.md). It adds a polar propellant
product and replaces two uncited liquefaction energies with values derived
from NASA's polar propellant case study.

> **Model boundary:** SELENE-ISRU remains a conceptual systems and comparative
> trade tool, not a flight, hardware, safety, cost, or mission-readiness model.
> The new benchmark confirms that five defaults were derived correctly from one
> NASA design. It does not validate the propellant chain.

## Why

Two gaps, found while building the propellant chain:
- **Polar products.** Polar plants could store water or run the Sabatier loop,
  but not do what NASA's polar case study does: split water into liquid oxygen
  and hydrogen for a lander.
- **Liquefaction.** The cryo model charged LOX at 2.2 kWh/kg and LH₂ at
  12 kWh/kg, both uncited v0.3 estimates, and landed no liquefaction hardware.
  It applied the same 6 kg per kg/day storage coefficient to every stream. For
  hydrogen that is about 45× lighter than NASA's liquefier and tank.

## What the polar propellant chain does

`polarProduct` chooses what a polar plant delivers:
- **`water`** (default): stored water ice, as before.
- **`propellant`**: all captured water is split by electrolysis, then both
  gases are liquefied and stored. The plant keeps a water buffer.

The electrolysis step is the one the Sabatier loop already used (cell voltage
`Vel` and Faradaic efficiency `etaFaradayEl`), now a function of its own. With
the Sabatier loop on, the loop still sets the products.

Electrolysis yields oxygen and hydrogen at O/F 7.94 by mass. A LOX/LH₂ vehicle
burns them at its mixture ratio (`mixtureRatio`, default 6 from the NASA case),
so hydrogen limits the usable propellant:

```
usable propellant = H2 × (1 + mixtureRatio)
surplus O2        = O2 − mixtureRatio × H2
```

At 1,000 kg/day of water, that is 778 kg/day of propellant and 222 kg/day of
surplus oxygen. The campaign ledger credits only the usable propellant.

With passive or capacity-limited storage, water lost from the buffer is never
split. LOX and LH₂ lost in storage come off each stream before the mixture-ratio
limit is applied. While hydrogen limits, each kilogram of LH₂ lost costs
`1 + mixtureRatio` kilograms of usable propellant.

## Calibration to Kleinhenz & Paz 2020

NASA's case study (Kleinhenz & Paz 2020, *Case Studies for Lunar ISRU Systems
Utilizing Polar Water*, AIAA 2020-4042, [NTRS PDF](https://ntrs.nasa.gov/api/citations/20205007966/downloads/PolarWaterISRUstudy_Kleinhenz_final.pdf))
processes 15 t of water into 13 t of O₂ and 1.7 t of H₂. It does this over
225 days less 48 h of commissioning, which is 67.26 kg/day of water. Fig. 8
gives each subsystem's mass and power on log axes.

**How the figure was read.**
1. The page was rendered at 400 dpi.
2. Each bar's end was measured in pixels against the decade gridlines.
3. The readings were checked against the totals the paper states:

| Check | Measured | Paper |
|---|---|---|
| Ridge system mass | 2,629 kg | 2.6 t |
| Water tankers | 1,843 kg | 1.8 t |
| Mine system | 489 kg | 0.49 t |
| Ridge power | 45.8 kW | 46 kW |
| Mine power | 21.4 kW | 22 kW |

**Derived values.** Powers have the study's 20% power margin removed. Masses
keep its growth and structure margins, as in v0.4.

| Parameter | Was | Now | Basis |
|---|---|---|---|
| `secCondLh2` | 12 kWh/kg | **54 kWh/kg** | H₂ liquefaction 20.3 kW → 16.9 kW for 7.53 kg/day of H₂. Range widened to 80. |
| `secCondLox` | 2.2 kWh/kg | **1.32 kWh/kg** | O₂ liquefaction 3.94 kW → 3.28 kW for 59.7 kg/day of O₂. |
| `kLiquefierLh2` | — | **233 kg per kg/day of H₂** | H₂ liquefaction mass 1,753 kg. |
| `kLiquefierLox` | — | **2.5 kg per kg/day of O₂** | O₂ liquefaction mass 150 kg. |
| `kElectrolyzerMass` | — | **1.46 kg per kg/day of water** | Electrolyzer 47 kg + dryers 51 kg. The water tank is left out because the cryo block already sizes the water buffer. |
| `mixtureRatio` | — | **6** | Table 1. |

Liquefier mass applies only to stored LOX and LH₂ products. It joins the cryo
block as `liquefierMassKg` on each inventory, beside the existing storage mass.
Liquefaction for methane and CO₂ has no data here and stays at zero hardware.

**Benchmark.** The new calibration benchmark `kleinhenz-paz-2020-polar-propellant`
runs the NASA case in propellant mode:
- The five derived terms reproduce within 1%. That is by construction, because
  the defaults came from this case.
- Electrolysis power is the independent check: 15.8 kW against the study's
  17.5 kW, about 10% low. The study's figure includes pumps and balance of
  plant that a cell-voltage model leaves out.
- The water extractor still matches the v0.4 anchor.

### Why 54 kWh/kg for hydrogen

Large terrestrial hydrogen liquefiers reach about 10–12 kWh/kg, which is where
the old default sat. NASA's design is a small cryocooler-based unit rejecting
heat through radiators, at 7.5 kg/day. Its 54 kWh/kg is therefore pessimistic
for a large plant. Linear scaling of both energy and liquefier mass with
hydrogen rate makes larger plants conservative. That is the first item left
for later.

## Published numbers that moved

Default inputs except as named. Polar water results do not move.

| Case | Energy per kg (kWh/kg) | Grid power (kW) | Landed mass (t) | Leverage L | Payback / return |
|---|---|---|---|---|---|
| Equatorial | 24.78 → **23.89** | 1,032 → **996** | 58.97 → **60.37** | 185.7 → **181.4** | day 242 / 6.67× → **6.63×** |
| Polar + Sabatier | 15.47 → **14.92** | 645 → **622** | 62.26 → **65.09** | 175.9 → **168.2** | never / 0.79× |

- **Equatorial:** less LOX conditioning energy lowers grid power and the power
  plant. The 2.5 t LOX liquefier more than offsets that in landed mass.
- **Sabatier:** it gains a LOX liquefier and a 1.3 t LH₂ liquefier for its
  leftover hydrogen.

## Reference results

| Case | kWh/kg | Grid (kW) | Landed (t) | Liquefiers (t) | Propellant (kg/day) | Leverage L | Payback (day) | Return |
|---|---|---|---|---|---|---|---|---|
| Polar water | 7.24 | 302 | 29.9 | 0 | — | 367× | 238 | 7.63× |
| Polar propellant, 1,000 kg/day water | 20.78 | 866 | 82.3 | 28.1 | 778 | 133× | 311 | 4.71× |
| Polar propellant, 10 t/day water (10 landers) | 20.36 | 8,485 | 804.8 | 281.1 | 7,778 | 136× | 1,406 | 4.74× |
| NASA baseline, 67.3 kg/day water, dedicated lander | 22.08 | 62 | 7.0 | 1.9 | 52 | 105× | 4,298 (after the campaign) | 0.45× |
| NASA baseline, shared lander | 22.08 | 62 | 7.0 | 1.9 | 52 | 105× | 380 | 3.80× |

What the table shows:
- **Hydrogen liquefaction dominates.** In the 1,000 kg/day propellant plant, the
  LH₂ liquefier alone is 26 t of 82 t landed, and liquefaction is about 40% of
  the energy. NASA's study reaches the same conclusion for its baseline.
- **Propellant costs return compared with water.** Water pays back on day 238
  at 7.6×. Propellant pays back on day 311 at 4.7×, because liquefaction and
  electrolysis nearly triple the energy and the plant is nearly three times
  heavier. The return assumes the same gear ratio per kg. If propellant
  displaces more Earth-launched mass than water does, raise `gearRatio` for
  this case.
- **NASA's baseline is a pilot-scale plant.** On a dedicated lander it does not
  pay back its launch mass in five years. Manifested as a share of a lander,
  it pays back on day 380.

## In the app

- **Rail:**
  - A POLAR PRODUCT select in the polar extraction group.
  - A new Propellant plant group, which reads out electrolysis power and holds
    cell voltage, Faradaic efficiency, mixture ratio, and electrolyzer mass.
    It appears only when electrolysis runs. With the Sabatier loop on, only
    the electrolysis inputs show.
  - The liquefier inputs show only for streams being liquefied.
  - Tests check that every input hidden this way is inert.
- **Text and exports:**
  - The case summary names the plant and its usable propellant.
  - The Campaign view says the surplus oxygen is not credited.
  - The study CSV adds `production.propellantKgPerDay` and
    `production.excessO2KgPerDay`.
- **Preset:** "Polar Propellant (NASA baseline)".

Screenshots: [rail](screenshots/propellant/propellant-rail.png),
[energy](screenshots/propellant/propellant-energy.png),
[mass](screenshots/propellant/propellant-mass.png), and
[campaign](screenshots/propellant/propellant-campaign.png).

## Verification

- **Parity.** Golden vectors cover propellant mode in two named scenarios: the
  NASA baseline rate, and O/F 5.5 at 2 wt% ice. That makes 213 vectors.
- **Regression anchors.**
  - New: the propellant default (products, usable propellant, surplus oxygen,
    liquefier mass, 20.78 kWh/kg, 82.35 t, payback day 311).
  - Updated deliberately: the equatorial SEC and grid power, the fixed-seed
    uncertainty anchor, and the Sabatier return.
- **Conservation.** Material and energy balances close at zero residual in
  propellant mode.

## Left for later

- **Liquefaction scale.** Energy and hardware per kg should fall with plant
  size, especially for hydrogen. Better data for 0.1–10 t/day lunar liquefiers
  would replace the linear scaling.
- **Architecture.** NASA's case liquefies on the illuminated ridge and hauls
  water from the crater by tanker. This model still processes at the plant it
  sizes.
- **Surplus oxygen.** It is stored and liquefied but not credited. A
  life-support or second-vehicle demand could credit it. This connects to the
  planned lander-refuelling scenario.
- **Electrolysis balance of plant.** The cell-voltage model runs about 10% below
  NASA's system power. A separate auxiliary term would close that gap.
- **Sabatier plant mass** still reuses the MRE reactor coefficient (v0.4 item).
- **Water cleanup** before electrolysis is not modelled. NASA's case does not
  model it either.
