# Reactor mass per kW of heat v0.18

This continues the audit trail from
[`model-radiator-mass-v017.md`](model-radiator-mass-v017.md), which left the
item open. The fission core was charged per kW of electrical output, so a less
efficient cycle cost no reactor mass, and a hotter radiator always won.

At the defaults nothing moves by more than 0.01%. What changes is that
conversion efficiency now costs reactor mass, so the radiator temperature has
an optimum.

> **Model boundary:** the fission system is a shield, a reactor per kW of heat,
> conversion per kW of output, and a radiator per m². The split comes from one
> 40 kWe NASA design and the scale is an uncited assumption; it is not a reactor
> design. TypeScript/Python parity proves the two implementations agree, not
> that the answer is right.

## Why

v0.17 charged the radiator by its area. The rest of the fission system,
`alphaSpecific`, stayed one mass per kW of electrical output.

But the reactor is sized by the heat it makes, not by the electricity it
delivers. A cycle running at half the efficiency needs a reactor twice the
size. The model charged nothing for it, so:
- **Hotter was always lighter.** Raising the radiator temperature shrank the
  radiator and cost nothing in reactor, up to the input's 900 K bound.
- **Efficiency was free.** `etaMech` and `Tsource` changed only the radiator.

## What the model computes

```
reactor heat   = electrical output / conversion efficiency                     [W]
fission mass   = MshieldKg
               + kReactorKgPerKwt · reactor heat (kWt)
               + kConversionKgPerKwe · electrical output (kWe)
               + kRadiatorKgPerM2 · radiator area                              [kg]
fission slope  = kReactorKgPerKwt / efficiency + kConversionKgPerKwe
               + kRadiatorKgPerM2 · radiator area per kWe                      [kg/kW]
```

- **Conversion efficiency:** unchanged, `(1 − Tsink / Tsource) · etaMech`. It
  is now exported as `fissionEfficiency`.
- **The power trade:** the slope sets the solar/nuclear crossover, and the
  power panel plots it (`nuclearSpecificKgPerKw`).
- **New result field:** `power.fissionThermalW`, the reactor heat.

| Key | Default | Range | Unit | Basis |
|---|---|---|---|---|
| `kReactorKgPerKwt` | 3.87 | 1–15 | kg/kWt | NASA FSP's split, at the model's scale |
| `kConversionKgPerKwe` | 13.93 | 3–60 | kg/kW | NASA FSP's split, at the model's scale |
| `alphaSpecific` | retired | | | |

**The split comes from NASA.** In NASA's 40 kWe fission surface power design
(Mason, Poston & Qualls 2008, NASA/TM-2008-215166, Table II), the reactor is
913 kg of the 1,816 kg of reactor, power conversion, and power management:
50.3%.

**The scale stays the model's.** At the default 27.5% efficiency the two
terms add to the old 28 kg/kWe: 3.87 / 0.275 + 13.93 = 28.00.
- **Why not FSP's own values:** FSP's 5.2 kg/kWt and 22.6 kg/kWe belong to a
  40 kWe unit, heavier per kW than the megawatt plants modelled.
- **What stays open:** the megawatt-class calibration stays on the backlog.

**Saved cases, files, and links.** `alphaSpecific` has no single equivalent:
one mass per kW of output cannot say how much of it was reactor. So it is
dropped, and the case takes the new defaults (`src/lib/legacyParams.ts`). At
the default efficiency those reproduce 28 kg/kW, so a case that kept the old
default lands the same mass.

## Calibration

The calibration benchmark `mason-2008-fsp-radiator` (v0.17) now also checks
that the default split matches FSP's, the reactor's share of reactor,
conversion and power management at the default efficiency, to 0.5%.

## Numbers

1 t/day product, default inputs except as named. Before → after.

| Case | Reactor heat (MWt) | Fission slope (kg/kW) | Fission mass (t) | Landed (t) | Payback (day) |
|---|---|---|---|---|---|
| Equatorial MRE (default) | 3.60 | 29.98 | 31.18 | 51.81 | 241 |
| Radiator at 400 K | 2.70 | 35.52 → **32.01** | 36.66 → **33.18** | 57.30 → **53.82** | 241 |
| Radiator at 520 K | 3.18 | 31.01 → **29.36** | 32.20 → **30.57** | 52.83 → **51.20** | 241 |
| Radiator at 800 K | 5.40 | 29.04 → **36.08** | 30.25 → **37.21** | 50.88 → **57.85** | 242 |
| `etaMech` 0.35 | 5.66 | 31.54 → **39.59** | 32.73 → **40.69** | 53.36 → **61.32** | 242 |
| Hot side at 1,500 K | 3.00 | 29.53 → **27.18** | 30.73 → **28.41** | 51.36 → **49.04** | 240 |
| Polar ice | 0.98 | 29.98 | 9.59 | 21.51 → **21.52** | 237 |
| Polar propellant | 3.12 | 29.98 | 27.26 | 74.75 | 309 |

What the table shows:
- **The radiator temperature has an optimum.**
  - **Colder:** the radiator grows; at 400 K it is 7.4 t.
  - **Hotter:** the reactor grows; at 800 K it makes 5.4 MWt for the same
    990 kW.
  - **Optimum:** the default plant is lightest near 520 K, 0.6 t under the
    default 600 K.
- **Efficiency costs reactor now.**
  - **Worse conversion:** a converter at 35% of Carnot instead of 55% needs a
    reactor 57% bigger, and lands 9.5 t more.
  - **Hotter hot side:** 1,500 K saves 2.8 t.
- **Defaults hold.** At the default efficiency the two terms reproduce the old
  slope to 0.003 kg/kW.
- **No landing count changes.**

Regression anchors moved deliberately, each marked "v0.18":
- **The v0.17 400 K case:** its fission system 36.66 → 33.18 t and landed mass
  57.29 → 53.82 t.
- **The fixed-seed uncertainty anchor:** its median landed-mass-to-product
  ratio 51.781 → 51.783 days.
- **New v0.18 anchors:**
  - the reactor heat and mass at the defaults
  - the slope's three terms
  - the 520 K optimum

Golden vectors were regenerated; the Latin hypercube samples both new inputs.

## In the app

- **Rail:** the power group shows both inputs in place of `alphaSpecific`.
  Their evidence gives FSP's split and own values, and says the scale is an
  assumption.
- **Brief:** its nuclear lever is now conversion mass (4, 12, and 30 kg/kW),
  and a candidate's summary quotes the engine's fission slope.
- **Sweep, frontier, and uncertainty panel:** they offer both inputs.
- **Inspectors:** the power hub and the polar nuclear station offer the reactor
  input, and the station shows reactor heat.

Screenshot: [fission mass against radiator temperature, from the sweep tool, with the reactor input's evidence](screenshots/reactor-per-kwt/radiator-temperature-sweep.png)

## Verification

- **Regression (v0.18):** in both suites:
  - the reactor heat and mass at the defaults
  - the slope against its three terms
  - the optimum near 520 K
- **External benchmark:** the default split against FSP's, in both suites.
- **Slopes:** `power-slopes.test.ts` still rebuilds the engine's fission mass
  and aged crossover from `nuclearSpecificKgPerKw`.
- **App:**
  - `legacy-params.test.ts` drops `alphaSpecific` from saved cases and links.
  - `analysis-tools.test.ts` keeps the Brief's new lever inside the engine
    bounds.
- **Parity:** 218 golden vectors.
- **Size budget:** the engine is 207,987 B, within 208 KiB.

## Left for later

- **Megawatt-class calibration** (backlog): the scale of both terms, the
  shield, and the default temperatures.
- **Conversion efficiency from the converter.** `etaMech`, a fraction of
  Carnot, is one number for Stirling and Brayton alike; a converter choice
  would carry its own efficiency, temperatures, and mass.
