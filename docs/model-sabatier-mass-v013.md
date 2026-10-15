# Sabatier plant mass v0.13

This continues the audit trail from
[`model-fidelity-v04.md`](model-fidelity-v04.md) and
[`model-propellant-v06.md`](model-propellant-v06.md). Both left the same item
open: the polar Sabatier loop borrowed the MRE reactor's mass coefficient.

Only the Sabatier loop moves. MRE, ilmenite, polar water, and polar propellant
plants do not.

> **Model boundary:** the Sabatier block is one conceptual Mars design scaled
> linearly with methane, margins included. TypeScript/Python parity proves the
> two implementations agree, not that the answer is right.

## Why

Since v0.4 the loop's plant mass was `kReactorMass × targetKgPerDay`: 12 kg
per kg/day of *water*, a coefficient written for a molten-regolith
electrolysis cell. That had three problems:
- **The wrong hardware.** An MRE cell at 1,600 °C has nothing in common with
  a 250–400 °C catalytic Sabatier reactor and its gas handling.
- **The wrong basis.** The water electrolyzer scales with water, but the
  Sabatier side scales with the methane it makes.
- **Unsourced.** The coefficient's source read "spec".

The electrolyzer the loop runs was also never charged on its own, although
propellant mode, splitting the same water, charges it.

## What the model computes

```
Sabatier plant  = kElectrolyzerMass · water fed + kSabatierMass · methane made   [kg]
methane liquefier = kLiquefierCh4 · liquid methane stored                          [kg]
```

- **Water electrolyzer:** the existing `kElectrolyzerMass`, 1.46 kg per kg/day
  of water. It is NASA's polar propellant electrolyzer and dryers (Kleinhenz &
  Paz 2020), the same electrolyzer propellant mode carries.
- **Sabatier block:** a new input, `kSabatierMass`, per kg/day of methane.
  It covers the reactor, gas handling, and the methane dryer.
- **Methane liquefier:** a new input, `kLiquefierCh4`, in the cryo block beside
  the LOX and LH₂ liquefiers. The loop already stored liquid methane and paid
  its conditioning energy but landed no liquefier.
- **Water extractor:** carried as before.
- **MRE reactor:** `kReactorMass` now applies to the MRE plant alone.

## Inputs

| Key | Default | Range | Unit | Basis |
|---|---|---|---|---|
| `kSabatierMass` | 33 | 1–60 | kg/(kg/day) of methane | Kleinhenz & Paz 2017, Fig. 10A |
| `kLiquefierCh4` | 3.4 | 0–20 | kg/(kg/day) of methane | Kleinhenz & Paz 2017, Fig. 10A |

The rail now shows the electrolyzer mass when the Sabatier loop is on, since
it acts there.

## Calibration and cross-checks

**NASA's Mars plant** (calibration benchmark
`kleinhenz-paz-2017-sabatier-block`). Kleinhenz & Paz 2017 (AIAA 2017-0423)
sized an oxygen-and-methane plant for a Mars ascent vehicle.
- **Production:** 6,978 kg of methane in 480 days, or 14.5 kg/day.
- **The block:** "atmosphere processing" is about 450 kg in their Fig. 10A,
  case 2, measured on the bar's pixels (about 900 to 1,350 kg). It holds:
  - a CO₂ freezer
  - PNNL's microchannel Sabatier reactor
  - a condenser
  - a water separator
  - a CH₄/H₂ separator
- **Methane dryer and liquefaction:** about 25 and 50 kg, separate thin bars
  above the electrolysis bar. They read to about ±8 kg each.
- **Margins:** every bar carries the study's 15% structural and 20% growth
  margins.
- **Result:** the Sabatier block is (450 + 25) / 14.5 = 33 kg per kg/day of
  methane, and the liquefier 50 / 14.5 = 3.4.

The default is that block, so it errs heavy. A lunar loop fed from imported CO₂
does not need the freezer, and this model already sizes the CO₂ feed store in
its cryo block.

**The reactor alone** (documentation-only benchmark
`pnnl-2005-sabatier-reactor`). PNNL's human-scale Mars plant (PNNL-15456,
Fig. 6.5) makes 14,200 kg of propellant at O₂:CH₄ 3.8 in 300 days, or
9.9 kg/day of methane.
- **Reactor mass:** about 22 kg for JSC's baseline reactor with its
  recuperator, or 11 kg for PNNL's microchannel unit. That is 1.1–2.3 kg per
  kg/day.
- **What dominates:** in PNNL's words, the reactors are "incidental"; the CO₂
  compressor dominates.
- **In the model:** the input's range reaches down to the reactor alone.

**Electrolysis.** Kleinhenz & Paz 2017's own electrolysis bar, about 170 kg for
32.7 kg/day of water, is 5.2 kg per kg/day. The 2020 polar design, at
1.46 kg per kg/day, is the newer and lunar one and is already the model's
electrolyzer, so it is kept.

## Published numbers that moved

Polar site with the Sabatier loop, default inputs except as named. Before →
after.

| Case | Plant (t) | Landed (t) | Landings | Leverage | Campaign return |
|---|---|---|---|---|---|
| 1 t/day of water (default) | 16.80 → **13.23** | 56.76 → **53.90** | 1 | 213× → **225×** | 0.796 → **0.797** |
| 100 kg/day | 1.68 → **1.32** | 7.10 → **6.82** | 1 | 171× → **178×** | 0.460 → **0.461** |
| 5 t/day | 84.0 → **66.1** | 276.8 → **262.6** | 4 | 219× → **231×** | 0.810 → **0.811** |

- **The loop is lighter.** At the default it makes 211 kg/day of methane:
  - a 7.0 t Sabatier block
  - a 1.5 t electrolyzer
  - the 4.8 t extractor
  - a new 0.7 t methane liquefier, in the cryo block

  Together that is 2.9 t less than before. At the reactor alone
  (`kSabatierMass` = 2.3) it would land about 6.5 t less again.
- **It still never pays back.** The imported CO₂ outweighs the product saving
  either way, so the campaign return barely moves.
- **Nothing else moves.**

Regression anchors moved deliberately in `regression.test.ts` and
`test_regression.py`:
- **v0.5:** the Sabatier campaign return, 0.796 → 0.797.
- **v0.6:** the Sabatier leverage, 213.4× → 224.6×.
- **v0.13:** new anchors for the plant and landed mass.

Golden vectors were regenerated.

**A roundoff fix rode along.** With the cooler removing the whole heat leak,
each store's removed heat was computed as budget × leak / total. That can
differ from its leak by about 1e-12 W, which left a spurious residual. TS and
Python rounded the total differently, and two new parity samples caught it.
A budget that covers the whole leak now removes each leak exactly, in both
languages.

## In the app

- **Rail:** the electrolyzer mass shows in the propellant group when the
  Sabatier loop is on.
- **Rail:** the methane liquefier mass shows in the cryogenics group when
  liquid methane is stored.
- **Inspector:** the beam receiver and Sabatier plant offers the Sabatier
  block mass as a control. Its assumptions name the block's basis and the CO₂
  freezer it over-counts.
- **Evidence:** `kSabatierMass` states its range, from the reactor alone to
  twice NASA's block, and why the default errs heavy. The electrolyzer's
  applicability now includes the Sabatier loop.

Screenshot: [the Sabatier plant inspector](screenshots/sabatier-mass/sabatier-inspector.png)

## Verification

- **Benchmarks:** the block calibration and the reactor cross-check run in
  both suites. They also check that the plant row equals the extractor plus
  the electrolyzer plus the block.
- **Regression:** v0.13 anchors in both suites; MRE landed mass unchanged.
- **App:** the input-activity test now expects the electrolyzer mass to show
  and act in the Sabatier loop.
- **Parity:** 218 golden vectors; the Latin hypercube samples the new input.

## Left for later

- **A Sabatier block without CO₂ acquisition.** Neither source separates the
  freezer from the reactor and separators. A breakdown would take the default
  from the heavy end toward the middle of its range.
- **Still open from v0.5–v0.7:** a lunar carbon source, and methalox landers
  fed by the loop.
