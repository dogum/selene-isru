# Model fidelity v0.4

This continues the audit trail from [`model-audit-v02.md`](model-audit-v02.md)
and [`model-depth-v03.md`](model-depth-v03.md). It records what changed in the
v0.4 fidelity pass, why, which published numbers moved, and what was looked at
and deliberately left alone.

> **Model boundary:** SELENE-ISRU remains a conceptual systems and comparative
> trade tool, not a flight, hardware, safety, cost, or mission-readiness model.
> The calibration anchor added here confirms that two defaults were derived
> correctly from one NASA case study. It does not validate the polar chain.

## How the pass was scoped

Every numeric input was moved across its full range with everything else held
at the reference cases, and every field of the result was compared (this is now
a live feature: `packages/app/src/analysis/activity.ts`). Inputs that changed
nothing, or only diagnostics, were then sorted three ways:

- **Physically should matter → wire it in.** The polar chain had three such
  gaps (below).
- **Conditional by design → hide or explain it.** Solar inputs while fission is
  selected, Sabatier inputs while the loop is off, the lumped O₂ fraction while
  the oxide model is on, and the other site's power inputs. The rail now hides
  the structurally inapplicable ones and tags the rest CHECKS or NO EFFECT with a
  reason.
- **No physical role in the headline → keep as a diagnostic and say why.** The
  blade-cutting model (below).

## Changes

### 1. Polar extraction: capture loss, heater loss, and extractor mass

Before v0.4 the polar water chain landed **0 kg** of extraction hardware (only
the MRE reactor and the Sabatier loop carried a plant-mass term), captured every
mobilized kilogram of ice, and charged the thermodynamic lower bound for
sublimation. All three are now anchored to NASA's polar-water case study,
Kleinhenz & Paz 2020, *Case Studies for Lunar ISRU Systems Utilizing Polar
Water*, AIAA 2020-4042 ([NTRS PDF](https://ntrs.nasa.gov/api/citations/20205007966/downloads/PolarWaterISRUstudy_Kleinhenz_final.pdf)):
15 t of water in 225 days from 5 wt% regolith.

| Parameter | Default | Basis |
|---|---|---|
| `etaIceCapture` | 0.75 | The study's extraction efficiency (Table 1). Regolith per kg of water becomes `1/(χ·η_capture)`; delivered heat per kg of captured water is the thermodynamic minimum divided by `η_capture`, because uncaptured ice was still heated and sublimated. The material ledger books the difference as `water-vapor → uncaptured-loss`. |
| `etaSubHeater` | 0.40 | **Derived.** This model's thermal minimum for the study's baseline divided by its ~20 kW water-extractor power (Sec. IV.B), less the study's 20% power margin (~16.7 kW). Heater loss joins the polar parasitic line. |
| `kIceExtractorMass` | 0.18 kg per kg-regolith/day | **Derived.** The study's water extractor (~330 kg including its 20% growth and 15% structure margins, read from Fig. 8's log scale) at ~1.8 t/day of regolith. Scaling follows regolith throughput because the study's main finding is that system mass tracks deposit richness (Fig. 9B). |

`secSubJPerKg` is unchanged and still the pure thermodynamic minimum, so its
external anchors (1.78 and 10.7 kWh/kg) still hold. `secSubDeliveredJPerKg` is
exported beside it.

The external benchmark `kleinhenz-paz-2020-polar-water` (kind `calibration`)
reproduces the study's extractor mass and heater power within 10%. Because the
two derived defaults came from that case, agreement confirms the derivation,
not the physics. Linear scaling with regolith throughput is conservative for
plants much larger than the study's; its own production-rate trade (Fig. 9A) is
sub-linear.

### 2. Storage properties and literals into `constants.json`

The per-stream storage table (density, storage temperature, conditioning
energy) and four other literals (0.12 lunar albedo, 3 K deep-space sink, the
354 h equatorial night, a 300 K reference temperature) lived in both `cryo.ts`
and `cryo.py`. Fluid properties are now physical constants with sources; design
choices such as the 150 K water-ice storage temperature are marked `spec`.

The six conditioning energies (`secCondLox` 2.2, `secCondWaterIce` 0.15,
`secCondLiquidWater` 0.08, `secCondLh2` 12, `secCondLch4` 1.2, `secCondCo2`
0.15 kWh/kg) are now adjustable parameters. They had no recorded source, so they
are labelled *v0.3 conditioning estimate, uncited*; LOX conditioning alone is
about 9% of equatorial SEC. This change moves no result: every reference case is
bit-identical to the commit before it.

### 3. Blade-cutting model stays a diagnostic

The Terzaghi/McKyes blade model computes about 1.8 kN of cutting force at
defaults, i.e. about **34 J per kg of regolith**, against the 120 kJ/kg
fleet-level mining energy (`eMining`, a RASSOR-class estimate): about 0.03%.
Feeding it into energy would be connected but meaningless. The physically
important coupling for a *blade* excavator in one-sixth gravity is traction (the
vehicle must weigh enough to react the cutting force; Wilkinson & DeGennaro
2007), but the fleet energy basis is RASSOR-class, whose counter-rotating drums
exist precisely to cancel that reaction. Applying a blade traction limit to a
RASSOR-class fleet would contradict the energy basis, so the cutting inputs stay
diagnostics, and the evidence drawer now says so.

### 4. Polar power narrative

The polar scene is built around rim solar towers, but at polar defaults the
engine selects fission. Beamed delivery is about 24% (0.5 emitter × 0.5 receiver
× 0.95 wiring), and rim solar must also carry fuel-cell storage through the
117 h shadow. The defaults themselves hold up: Gläser et al. 2014 (Icarus 243,
78–90) find the best Shackleton–de Gerlache ridge site lit 92% of the time at
2 m with longest darkness of 3–5 days, so 117 h sits inside that range and the
0.71 lit fraction is deliberately conservative (now a documentation-only
benchmark). What was wrong was the narration: tour captions now state which
option the engine chose and quote the delivered fraction from `beamEfficiency`.

## Published numbers that moved

Default inputs except as named. Equatorial results do not move.

| Case | Energy per kg (kWh/kg) | Grid power (kW) | Landed mass (t) | Leverage L | Plant-mass equivalent (days) |
|---|---|---|---|---|---|
| Equatorial | 24.775 | 1032.3 | 58.97 | 185.7 | 59.0 |
| Polar | 2.814 → **7.242** | 117.2 → **301.8** | 19.52 → **29.85** | 561.0 → **366.8** | 19.5 → **29.9** |
| Polar + Sabatier | 11.045 → **15.473** | 460.2 → **644.7** | 51.92 → **62.26** | 210.9 → **175.9** | 51.9 → **62.3** |
| Polar, 1 wt% ice | 9.841 → **24.541** | 410.1 → **1022.5** | 28.3 → **70.68** | 386.9 → **154.9** | 28.3 → **70.7** |

Regression anchors for the polar default were added deliberately in
`regression.test.ts` and `test_regression.py`; golden vectors were regenerated.

## Looked at and left for later

- **Excavation fleet basis.** `kExcFleet` scales with *product*, so a 1 wt% ice
  deposit moves five times the regolith with the same fleet. NASA's RASSOR-based
  estimate is roughly 20× lighter per tonne of regolith than the current
  equatorial default. Re-basing it on regolith throughput would move equatorial
  numbers too, on one data point, so it needs its own calibration pass.
  *(v0.9: re-based on soil moved from three studies, with polar overburden. See
  [`model-excavation-v09.md`](model-excavation-v09.md).)*
- **Conditioning energy from cryocooler efficiency.** The conditioning energies
  could be derived from ideal liquefaction work and the existing second-law
  cryocooler efficiency, which would make that input drive results. LOX would
  fall from 2.2 to about 0.9 kWh/kg at η₂ = 0.2; that calibration deserves its
  own sources.
  *(v0.6: LOX and LH₂ were instead derived from NASA's polar propellant design,
  1.32 and 54 kWh/kg, with liquefier mass added. See
  [`model-propellant-v06.md`](model-propellant-v06.md).)*
- **Sabatier plant mass** reuses the MRE reactor coefficient (`kReactorMass`).
  The NASA study's ridge propellant system is about 39 kg per kg/day of water,
  dominated by hydrogen liquefaction.
- **Polar architecture.** NASA's case processes water on the illuminated ridge
  and hauls it from the crater by tanker; this model beams power to a crater
  floor plant. Both are legitimate; only one is modelled.
- **Radiator area** is computed but does not feed fission system mass, which is
  carried by the lumped `alphaSpecific`.

The v0.3 list of remaining validation work still applies; item 3 (polar vapor
capture and lower-bound extraction) is now partly addressed by the capture and
heater efficiencies above, while purification, heterogeneous assay, and
transient bed heating remain open.
