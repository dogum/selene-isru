# Electrolysis balance of plant v0.14

This continues the audit trail from
[`model-propellant-v06.md`](model-propellant-v06.md), which left the item open:
the cell-voltage electrolysis model ran about 10% under NASA's system power.

Every plant that splits water moves: polar propellant, the Sabatier loop, and
the ilmenite plant. MRE and polar water plants do not.

> **Model boundary:** balance of plant is a single fraction of stack power,
> calibrated to one small lunar design. TypeScript/Python parity proves the
> two implementations agree, not that the answer is right.

## Why

Water electrolysis was charged at the cell alone:

```
stack energy per kg water = Vel · 2F / (M_H2O · etaFaradayEl)
```

At 1.8 V and 95% Faradaic efficiency, NASA's polar propellant case
(Kleinhenz & Paz 2020) came out at 15.8 kW against the study's 17.5 kW, with
its 20% power margin removed. The study's figure also runs:
- the feed pumps
- the water deionizer
- the gas dryers
- the controls

A cell-voltage model has none of these.

## What the model computes

```
electrolysis energy per kg water = stack energy · (1 + fElectrolysisBop)
```

- **Where it applies:** wherever the model splits water: polar propellant
  mode, the Sabatier loop, and the ilmenite plant's electrolyzer.
- **Energy ledger:** the extra power enters as electrical input and leaves as
  rejected heat, so the water-electrolysis balance still closes.

| Key | Default | Range | Unit | Basis |
|---|---|---|---|---|
| `fElectrolysisBop` | 0.107 | 0–0.4 | 1 | Kleinhenz & Paz 2020, Fig. 8, against the model's stack power |

## Calibration and cross-checks

**NASA's polar propellant case** (calibration benchmark
`kleinhenz-paz-2020-polar-propellant`, now at 1% tolerance).
- **The study:** 17.5 kW, from 21.0 kW with its 20% power margin removed.
- **The model's stack:** 15.8 kW for 67.26 kg/day of water.
- **Result:** 17.5 / 15.8 − 1 = 0.107.
- **What changed in the benchmark:** electrolysis power was its independent
  check; now it is a calibration, like the liquefiers and the electrolyzer
  mass beside it.

**DOE's PEM targets** (documentation-only benchmark `doe-pem-electrolysis-bop`).
The independent check is DOE's PEM electrolysis targets, system energy over
stack energy:

| | Stack (kWh/kg H₂) | System (kWh/kg H₂) | Balance of plant |
|---|---|---|---|
| 2022 status | 51 | 55 | 7.8% |
| 2026 target | 48 | 51 | 6.3% |
| Ultimate | 43 | 46 | 7.0% |

Large terrestrial systems carry 6–8% over the stack. NASA's 67 kg/day lunar
unit, at 10.7%, sits above them, as a small plant with its own pumps,
deionizer, and dryers would.

**Eagle's ilmenite calibration does not move.** `fIlmHeatLoss` was fitted to
Eagle's 1,160 kW using Eagle's own solid-oxide electrolysis figures, not this
model's electrolyzer, so it stays valid.

## Published numbers that moved

Default inputs except as named. Before → after.

| Case | Electrolysis (kW) | Energy (kWh/kg) | Grid (kW) | Landed (t) | Payback (day) |
|---|---|---|---|---|---|
| Polar propellant, 1 t/day of water | 235 → **260** | 20.01 → **20.62** | 834 → **859** | 74.01 → **74.77** | 309 |
| NASA polar propellant case | 15.8 → **17.5** | 21.32 → **21.92** | 60 → **61** | 6.54 → **6.59** | 6,519 → **6,525** |
| Polar + Sabatier | 235 → **260** | 14.16 → **14.76** | 590 → **615** | 53.90 → **54.65** | never |
| Ilmenite, mare soil | 265 → **293** | 19.81 → **20.49** | 825 → **854** | 93.75 → **94.60** | 586 |
| Ilmenite, high-Ti basalt | 265 → **293** | 16.23 → **16.91** | 676 → **705** | 84.19 → **85.04** | 246 |

- **About 0.6–0.7 kWh/kg more** wherever water is split. At these 1 t/day
  plants the added power system weighs 0.75–0.85 t.
- **No landing count changes,** and paybacks shift by under a day except for
  NASA's small case.
- **MRE and polar water plants do not move.**

Regression anchors moved deliberately, each marked "v0.14":
- **Energy, landed mass, grid power, payback, and leverage:** the v0.6, v0.8,
  v0.10, v0.11, and v0.13 anchors, for propellant mode, the ilmenite plant,
  and the Sabatier loop.

Golden vectors were regenerated.

## In the app

- **Rail:** the new input shows with the electrolysis inputs: in the
  propellant group in propellant mode and with the Sabatier loop, and in the
  oxygen-process group for the ilmenite plant. The input-activity test checks
  that it acts wherever it shows and is inert where it is hidden.
- **Evidence:** it states the NASA calibration, DOE's 6–8%, and that the
  power ends as waste heat.

Screenshot: [the propellant group with the new input's evidence](screenshots/electrolysis-bop/rail-bop-evidence.png)

## Verification

- **Benchmarks:**
  - NASA's case now reproduces all six terms within 1%.
  - The DOE cross-check confirms the default sits above terrestrial balance
    of plant but within a factor of two.
  - Both suites check that stack power times (1 + fElectrolysisBop) gives
    17.5 kW.
- **Parity:** 218 golden vectors; the Latin hypercube samples the new input.

## Left for later

- **Scale.** A fixed fraction does not shrink with plant size, as DOE's
  numbers suggest balance of plant does for large systems.
- **Cell voltage from current density.** `Vel` is a fixed 1.8 V. A
  polarization curve would tie voltage to the current density the stack is
  sized for, and so trade stack mass against power.
