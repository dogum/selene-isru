# Basalt feed v0.11

This continues the audit trail from
[`model-ilmenite-v08.md`](model-ilmenite-v08.md) and
[`model-ilmenite-reactor-v010.md`](model-ilmenite-reactor-v010.md). It takes up
v0.8's "basalt feed" item: Eagle Engineering's second feedstock, crushed
high-Ti basalt, beside the mare soil the ilmenite plant has mined so far.

The soil route does not move. Every v0.8 and v0.10 anchor stays where it was;
the basalt anchors are new.

> **Model boundary:** the basalt chain is Eagle's conceptual flowsheet, scaled
> linearly. Its liberation, sizing, and mined-layer fractions are one study's
> estimates, not measurements on a surveyed deposit. TypeScript/Python parity
> proves the two implementations agree, not that the answer is right.

## Why

Eagle's 1988 pilot-plant study designed two plants around the same reactor:
- **Soil-fed:** mare soil at 7.5 wt% ilmenite, scooped, sized, and separated.
- **Basalt-fed:** high-Ti basalt at 25 vol% (about 33 wt%) ilmenite, mined
  from a layer under the soil, crushed, ground, and separated.

The basalt plant mines far less per kg of oxygen and needed 20% less power.
The simulator could only run the soil plant, so the trade between the two
feedstocks, which is the first question a site selection would ask, could not
be run.

## What the model computes

A switch, `ilmFeed` (`soil` or `basalt`), picks the feed. On basalt:

**Feed grade.** The basalt's ilmenite fraction, `fIlmBasalt`, takes the place
of the soil's `fIlmenite`, including in the test for whether the concentrate
grade enriches the feed at all.

**Basalt ground per kg of oxygen.**

```
basalt/O2 = 1 / (fIlmBasalt · fBasaltSized · recovery · conversion · x_O)
recovery  = etaIlmRecovery · fIlmLiberated   (with separation)
          = 1                                (fed whole)
```

- `x_O` is the oxygen removed per kg of ilmenite reduced, as for soil.
- `fBasaltSized` is the share of the ground basalt inside the reactor's
  0.045–0.5 mm window; fines below it are lost.
- `fIlmLiberated` is the share of the ilmenite freed as clean grains by
  grinding. It multiplies the separator's recovery, and drops out when the
  ground basalt is fed whole, since locked grains still reach the reactor.

**Layer mined.** Only part of the mined layer is crushable basalt:

```
layer/O2      = basalt/O2 / fBasaltInMined
overburden/O2 = basaltOverburdenRatio · layer/O2
```

`soilPerKgO2` and `soilKgPerDay` now carry the layer mined on a basalt feed.
The overburden joins the excavation's `overburdenKgPerDay`, which was polar
only.

In the material ledger only the basalt enters the mill. The layer's soil and
oversize go straight to tailings as `layer-rejects`, and `tailingsKgPerDay`
counts both reject streams.

**Energy and mass.**
- **Mining:** the shared `eMining` and `kMiningMass`, on layer plus
  overburden. Eagle's 144 kW mining power for the basalt plant works out to
  about 10.5 kJ/kg of everything moved, the soil plant's figure, so no new
  mining inputs were needed.
- **Crushing, grinding, and separation:** `eIlmComminution` (J/kg) and
  `kIlmComminutionMass` (kg per kg/day), per kg of basalt fed. They replace
  the soil's screening inputs.
- **Reactor and electrolysis:** unchanged. The reactor sees the same
  concentrate it would from soil.

## Inputs and constants

All from Eagle Engineering 1988 (EEI 88-182), Table 6-1 and Table 6-5.

| Key | Default | Range | Unit | Meaning |
|---|---|---|---|---|
| `ilmFeed` | soil | soil, basalt | mode | Feedstock |
| `fIlmBasalt` | 0.33 | 0.05–0.45 | kg/kg | Ilmenite in the basalt (25 vol%) |
| `fIlmLiberated` | 0.647 | 0.2–0.95 | 1 | Ilmenite freed by grinding |
| `fBasaltSized` | 0.569 | 0.3–0.95 | 1 | Ground basalt in the reactor window |
| `fBasaltInMined` | 0.475 | 0.2–1 | kg/kg | Crushable basalt in the mined layer |
| `basaltOverburdenRatio` | 1.1 | 0–4 | kg/kg | Overburden per kg of layer mined |
| `eIlmComminution` | 169,000 | 50,000–400,000 | J/kg | Crushing to separation, per kg basalt |
| `kIlmComminutionMass` | 0.273 | 0.05–1 | kg/(kg/day) | That plant's mass, per kg/day basalt |

Each feed's own inputs are inert on the other feed, and the rail hides them.

## Calibration and cross-checks

**Eagle's basalt plant** (calibration benchmark `eagle-1988-basalt-feed`).
Eagle's 1,000 t/yr basalt plant runs at 3,044 kg/day of oxygen at 90% duty.

| Quantity | Eagle | Model |
|---|---|---|
| Basalt fed per t O₂ | 88.23 t | 88.49 t |
| Layer mined per t O₂ | 185.74 t | 186.3 t |
| Beneficiation power | 526 kW | 527 kW |
| Beneficiation mass | 73.4 t | 73.5 t |

The fractions are Eagle's, and the two beneficiation coefficients were derived
from the same plant, so agreement confirms the derivation, not the physics.

**Basalt against soil** (documentation-only benchmark
`eagle-1988-basalt-vs-soil`). Eagle's two nuclear plants at 1,000 t/yr:

| Ratio, basalt ÷ soil | Eagle | Model (1 t/day) |
|---|---|---|
| Power | 0.797 | 0.819 |
| Landed mass | 0.827 | 0.899 |

Only beneficiation was fitted to the basalt plant, so the power ratio coming
out near Eagle's is a real cross-check. The mass ratio is closer to one:
Eagle's basalt process area is 13 t lighter than its soil one for the same
concentrate, which Eagle does not explain. The model's reactor follows the
concentrate, so it does not reproduce that.

**Grinding energy** (documentation-only benchmark `bond-law-basalt-grinding`).
Bond's law with Eagle's basalt work index (20.41 kWh/t), from 100 mm to
0.1 mm, gives 71.3 kJ/kg. That is well under the calibrated 169 kJ/kg, which
also carries fine screening, magnetic separation, and handling.

## Reference results

Equatorial ilmenite, 1 t/day of oxygen, default inputs except as named.
All new; the soil row is unchanged.

| Case | Mined per kg O₂ | Overburden (t/day) | Energy (kWh/kg) | Power (kW) | Landed (t) | Landings | Payback (day) |
|---|---|---|---|---|---|---|---|
| Mare soil, 7.5 wt% (default) | 327 | 0 | 19.81 | 825 | 93.8 | 2 | 586 |
| High-Ti basalt, 33 wt% | 186 | 205 | 16.23 | 676 | 84.2 | 1 | 246 |
| Basalt, no overburden | 186 | 0 | 15.66 | 652 | 78.5 | 1 | 245 |
| Basalt fed whole (no separation) | 118 | 130 | 18.19 | 758 | 76.4 | 1 | 244 |
| Basalt at 45 wt% | 137 | 150 | 14.83 | 618 | 73.5 | 1 | 244 |
| Basalt at 45 wt%, fed whole | 87 | 95 | 15.67 | 653 | 66.7 | 1 | 243 |
| Basalt at 15 wt% | 410 | 451 | 22.53 | 939 | 132.6 | 2 | 598 |

- **Basalt beats soil at Eagle's grades.** It mines 43% less of the
  ilmenite-bearing layer per kg of oxygen and spends half the beneficiation
  energy, grinding included. With its overburden it moves 20% more material
  in all (391 against 327 kg per kg of oxygen), which costs 0.2 kWh/kg more
  mining. The plant fits one lander, so it pays back in 246 days instead
  of 586. The landing count, not the energy, sets most of that gap.
- **Feeding it whole saves mass and costs energy.** Without separation,
  nothing is lost to liberation or the separator, so the plant mines 37% less
  and lands 8 t less. The reactor heats nearly three times the solids, so it
  spends 12% more energy. Eagle noted that skipping separation gets more
  attractive as the basalt gets richer; the model agrees, and at 45 wt% the
  energy penalty halves.
- **A lean basalt loses.** At 15 wt% the basalt plant mines more than the
  soil plant and needs a second landing again.
- **MRE and the pole do not move.**

Regression anchors (v0.11) were added deliberately in `regression.test.ts` and
`test_regression.py`. No earlier anchor moved. Golden vectors were
regenerated, with every eighth Latin-hypercube point and one named scenario
(`equatorial-ilmenite-basalt-eagle`) on basalt.

## Saved cases and links

The feed and its inputs are new keys, so nothing needs migrating. A case or
link saved before v0.11 reads the soil feed, which is what it ran.

## In the app

- **Rail:** the oxygen-process group gains a FEEDSTOCK select (MARE SOIL or
  CRUSHED HIGH-TI BASALT) once the process is ilmenite. Each feed shows only
  its own inputs.
- **Preset:** "Ilmenite Reduction (High-Ti Basalt)".
- **Labels:** the case summary, process edges, energy stages, inspector, and
  engineering report name the basalt layer, its overburden, and the basalt
  ground. The case name reads "Equatorial ilmenite (basalt)".
- **Evidence:** each basalt input states its range, validity, and that it
  applies only to the basalt feed; the soil-only inputs now say so too.
- **Analysis:** the frontier, uncertainty panel, and report pick the basalt
  grade, not the soil's, as the dominant lever on a basalt feed. The
  uncertainty panel also offers liberation and grinding energy.

Screenshots:
- [the feedstock select](screenshots/basalt-feed/rail-feedstock.png)
- [the basalt grade's evidence](screenshots/basalt-feed/basalt-grade-evidence.png)
- [the hauler inspector on basalt](screenshots/basalt-feed/hauler-inspector.png)

## Verification

- **Chain:** `ilmenite.test.ts` and `test_ilmenite.py` write the basalt chain
  out, check that each feed ignores the other's inputs, that mass is
  conserved, and that MRE ignores the feed.
- **External benchmarks:** the Eagle basalt calibration, the basalt-against-soil
  comparison, and the Bond's-law cross-check, in both suites.
- **App:** `ilmenite-app.test.tsx` checks the rail, the hidden-input guard per
  feed, the URL round trip, labels, preset, analysis levers, evidence, and
  inspector.
- **Parity:** 218 golden vectors.
- **Size budget:** the engine is 196,333 B, within 192 KiB.

## Left for later

- **Grind size against liberation.** Finer grinding frees more ilmenite but
  sends more fines out of the reactor window. The two fractions are separate
  inputs here; a grind-size model would couple them.
- **Overburden timing.** The first strip delays production (in [`backlog.md`](backlog.md)).
- **A surveyed deposit.** Eagle's mined-layer and overburden fractions are its
  own estimates for a mare flow under a few metres of soil.
- **Still open from v0.8 and v0.10:** iron and tailings credit, a dedicated
  ilmenite scene, grain size, stage count, and reduction of other oxides.
