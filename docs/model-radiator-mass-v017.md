# Radiator mass in the fission system v0.17

This continues the audit trail from
[`model-fidelity-v04.md`](model-fidelity-v04.md), which left the item open: the
model sized a fission radiator from the waste heat but did not charge its mass.
The lumped `alphaSpecific` carried it at whatever temperature the radiator ran.

At the defaults nothing moves by more than 0.04%. What changes is that the
radiator's temperature, emissivity, and environment now cost mass.

> **Model boundary:** the fission system is a shield plus a specific mass per
> kW plus a radiator per m², calibrated to one 40 kWe NASA design. It is not a
> reactor design, and the remaining fission defaults are uncited assumptions.
> TypeScript/Python parity proves the two implementations agree, not that the
> answer is right.

## Why

Since v0.2 the fission system weighed `MshieldKg + alphaSpecific × kWe`, and
the power panel showed a radiator area computed alongside it. The area
depended on:
- the radiator temperature (`Tsink`)
- its environment (`Tenv`)
- emissivity and fin efficiency (`epsRad`, `etaRad`)
- the conversion efficiency the waste heat comes from

None of those changed the mass. A 300 K radiator, 16 times the area of the
default, landed nothing extra.

## What the model computes

```
radiator area      = waste heat / (etaRad · epsRad · σ · (Tsink⁴ − Tenv⁴))      [m²]
radiator mass      = kRadiatorKgPerM2 · radiator area                           [kg]
fission mass       = MshieldKg + alphaSpecific · kWe + radiator mass            [kg]
fission slope      = alphaSpecific + kRadiatorKgPerM2 · radiator area per kWe   [kg/kW]
```

- **Radiator area:** unchanged from v0.2.
- **`alphaSpecific`:** now excludes the radiator. It covers the reactor, power
  conversion, and power management per kW of electrical output.
- **The solar/nuclear crossover:** the slope above, which includes the
  radiator, now sets it, and the power panel plots that same slope.
- **New result fields:**
  - `power.radiatorMassKg`
  - `power.nuclearSpecificKgPerKw`
  - exported helpers `radiatorM2PerKw` and `nuclearSpecificKgPerKw`

| Key | Default | Range | Unit | Basis |
|---|---|---|---|---|
| `kRadiatorKgPerM2` | 3.87 | 2–12 | kg/m² | NASA's 40 kWe surface power design (below) |
| `alphaSpecific` | 30 → **28** | 8–90 | kg/kW | The old value less the 2 kg/kW its 600 K radiator carried |

The default `alphaSpecific` drops by exactly what the default radiator now
charges: 3.87 kg/m² × 0.512 m²/kW = 1.98 kg/kW. So a default case's fission
mass is unchanged but for the rounding (0.02 kg/kW).

## Calibration

**NASA's affordable fission surface power system** (calibration benchmark
`mason-2008-fsp-radiator`). Mason, Poston & Qualls 2008 (NASA/TM-2008-215166),
Table II.

**The design:** a 40 kWe Stirling system.
- **Reactor:** 175 kWt.
- **Conversion:** 48 kWe gross, with an 830 K hot end.
- **Radiator:** a 380 K effective radiator rejecting about 120 kWt to a 250 K
  sink.
- **Heat rejection subsystem:** 615 kg. It comprises:
  - pumped water loops
  - composite panels with titanium–water heat pipes
  - scissor deployment
- **Radiating area:** 175 m², two-sided, including a 10% area margin.

**Areal mass.** 615 kg / (175 m² / 1.1) = 3.87 kg per m² of radiating area
before margin. Per m² of panel, since panels radiate from both faces, that is
the study's "about 7 kg/m²" for the whole subsystem.

**The area itself is a cross-check.** At FSP's temperatures and 27.4% gross
conversion, the model sizes 152 m² for 40 kWe, against FSP's 159 m² before
margin (−4%). The model rejects only the waste heat behind the delivered
power, not FSP's 8 kWe of electrical losses and parasitic loads. The
radiator's mass comes to 589 kg against 615 kg.

**What is not calibrated here.** On the same basis, FSP's reactor,
conversion, and power management come to 45 kg/kW against the model's 28. A
40 kWe unit is heavier per kW than the megawatt-class plants this model
sizes, and FSP's own mass scaling (its Fig. 14) is shallow with power. So
`alphaSpecific`, `MshieldKg`, and the 1,200/600 K default temperatures stay
assumptions; the backlog carries a megawatt-class calibration.

## Numbers

1 t/day product, default inputs except as named. Before → after.

| Case | Radiator (m²) | Radiator (t) | Fission slope (kg/kW) | Fission mass (t) | Landed (t) | Payback (day) |
|---|---|---|---|---|---|---|
| Equatorial MRE (default) | 507 | 1.96 | 30 → **29.98** | 31.20 → **31.18** | 51.83 → **51.81** | 241 |
| MRE, radiator at 400 K | 1,924 | **7.45** | 30 → **35.52** | 31.20 → **36.66** | 51.83 → **57.30** | 241 → **242** |
| MRE, radiator at 900 K | 232 | 0.90 | 30 → **28.91** | 31.20 → **30.12** | 51.83 → **50.75** | 241 |
| MRE, 10 kg/m² radiator | 507 | **5.07** | 30 → **33.12** | 31.20 → **34.29** | 51.83 → **54.92** | 241 |
| MRE at FSP's temperatures | 3,773 | **14.60** | 30 → **42.75** | 31.20 → **43.82** | 51.83 → **64.45** | 241 → **243** |
| Polar ice | 138 | 0.53 | 30 → **29.98** | 9.60 → **9.59** | 21.52 → **21.51** | 237 |
| Polar propellant | 440 | 1.70 | 30 → **29.98** | 27.27 → **27.26** | 74.77 → **74.75** | 309 |
| Ilmenite on soil | 437 | 1.69 | 30 → **29.98** | 27.11 → **27.09** | 94.60 → **94.58** | 586 |

What the table shows:
- **The defaults hold.** The default radiator runs at 600 K, so it is small:
  2 t of a 31 t fission system.
- **A cool radiator costs mass now.** At FSP's 380 K the same megawatt plant
  needs 3,800 m² and 15 t of radiator, and lands 13 t more. Before v0.17 its
  temperature changed only the area shown.
- **A hotter radiator always wins here.** It lowers conversion efficiency but
  costs nothing for it: the core is charged per kW of electrical output, not
  per kW of reactor heat. A real system trades the two (backlog).
- **No landing count changes.** The crossover where nuclear beats solar stays
  near 1.9 kW at the equator and 4.1 kW at the pole.

Regression anchors moved deliberately:
- **v0.17:** new anchors in both suites, for the default radiator, a 400 K
  radiator, and the power-trade slope.
- **The fixed-seed uncertainty anchor:** its median landed-mass-to-product
  ratio moves from 51.799 to 51.781 days.

Golden vectors were regenerated; the Latin hypercube samples the new input.

## In the app

- **Rail:** the power group gains "Fission radiator mass per square metre of
  radiating area". Its evidence cites the NASA design, the 5–11 kg/m² range of
  lunar radiator concepts, and what the default covers.
- **`alphaSpecific`:** now reads "excluding shielding and radiator", in the
  rail, the inspectors, the uncertainty panel, and the sweep.
- **Power panel:**
  - The radiator line shows area and mass.
  - The nuclear curve and the crossover use the engine's radiator-inclusive
    slope, not the raw input.
- **Inspectors:** the power hub and the polar nuclear station show radiator
  area and mass, and offer the new input as a control.

Screenshot: [the power panel with a 400 K radiator, and the new input's evidence](screenshots/radiator-mass/power-radiator-400k.png)

## Verification

- **Benchmark:** `mason-2008-fsp-radiator` in both suites checks:
  - the areal mass
  - the default against it
  - the model's area and radiator mass at FSP's design point, within 5%
  - that the engine charges the area to the fission system
- **Slopes:** `power-slopes.test.ts` checks that the engine's fission mass and
  aged crossover rebuild from `nuclearSpecificKgPerKw`, the slope the power
  panel plots.
- **Parity:** 218 golden vectors.
- **Size budget:** the engine is 207,081 B, within 208 KiB.

## Left for later

- **Reactor mass per kW of heat.** Splitting `alphaSpecific` into reactor mass
  per kWt and conversion per kWe would make conversion efficiency cost reactor
  mass, and give the radiator temperature a real optimum. *(v0.18: done; see
  [`model-reactor-per-kwt-v018.md`](model-reactor-per-kwt-v018.md).)*
- **Megawatt-class calibration.** The 1,200/600 K temperatures, 28 kg/kW, and
  1.5 t shield are uncited. A megawatt-class surface fission study would anchor
  them, and FSP's power scaling would replace the linear slope.
- **A hotter radiator's areal mass.** The default 600 K radiator would need
  liquid-metal heat pipes, not FSP's water ones; one areal mass serves both.
