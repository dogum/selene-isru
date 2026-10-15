# Whole excavators v0.12

This continues the audit trail from
[`model-excavation-v09.md`](model-excavation-v09.md). It takes up two of that
doc's "left for later" items:
- **Whole vehicles.** The fleet is now a count of RASSOR-class excavators,
  and even a small plant gets at least one.
- **Haul distance.** Haul distance is now an input, and it sets how many
  trips each vehicle makes.

At the default 1 t/day plants, landed mass moves by a few tens of kilograms.
The cases that move are small plants and long hauls.

> **Model boundary:** the fleet is one excavator design driving a fixed loop,
> with no growth margin, no spare vehicle, no hazard avoidance, and no queueing
> at the plant. TypeScript/Python parity proves the two implementations agree,
> not that the answer is right.

## Why

Since v0.9 the fleet mass was a continuous coefficient, `kMiningMass`: 0.0244 kg
per kg/day of soil moved. That is one 66 kg RASSOR moving 2.7 t/day. It had two
problems:
- **Fractions of a vehicle.** A 100 kg/day plant landed 10.8 kg of excavator.
  NASA's polar mine study lands whole vehicles: two RASSORs for 3 t/day.
- **No haul length.** Guerrero-Gonzalez & Zabel's 2.7 t/day assumes 100 m
  hauls. A mine half a kilometre away needs far more vehicles, and the model
  could not show it.

## What the model computes

Each excavator drives a loop: it digs at the mine, unloads at the plant,
carries the plant's tailings to the disposal site, and returns. This is
Guerrero-Gonzalez & Zabel's three-leg route, and it serves overburden stripping
too.

```
trip time       = 3 · haulDistanceM / excavatorSpeedMps + excavatorLoadingMin · 60      [s]
trips per day   = floor(excavatorHoursPerDay · 3600 / trip time), at least 1           [1/day]
soil per day    = trips per day · excavatorPayloadKg                                    [kg/day]
excavators      = ceil(soil moved per day / soil per day), at least 1                  [1]
fleet mass      = excavators · excavatorMassKg                                          [kg]
```

- **Whole trips.** Only whole trips fit in a shift, and only whole vehicles
  land, so the fleet steps rather than sliding.
- **Same fleet for the ilmenite plant.** The ilmenite plant's mining mass is
  this same fleet; the manifest row and `ilmenite.miningMassKg` agree.
- **New result fields:** `excavation.excavatorCount`,
  `excavation.excavatorTripsPerDay`, and `excavation.excavatorKgPerDay`.

Mining energy (`eMining`, per kg moved) does not change with haul distance
yet. It is calibrated on 100 m hauls, and the evidence drawer now says so
instead of claiming that longer hauls cost more.

## Inputs

All from Guerrero-Gonzalez & Zabel 2023, *Acta Astronautica* 203:187–201,
Sec. 3.4.1 ([doi:10.1016/j.actaastro.2022.11.050](https://doi.org/10.1016/j.actaastro.2022.11.050)),
with Kleinhenz & Paz 2020 (AIAA 2020-4042) where it agrees.

| Key | Default | Range | Unit | Basis |
|---|---|---|---|---|
| `excavatorMassKg` | 66 | 30–500 | kg | RASSOR 2.0 vehicle |
| `excavatorPayloadKg` | 80 | 20–500 | kg | RASSOR payload capacity |
| `excavatorSpeedMps` | 0.27 | 0.1–1 | m/s | RASSOR average speed |
| `excavatorLoadingMin` | 9 | 2–60 | min | Excavation and disposal maneuvers per trip |
| `excavatorHoursPerDay` | 16 | 10–22 | h/day | 16 h of work, 8 h recharging (NASA: 5 h recharge) |
| `haulDistanceM` | 100 | 20–1,000 | m | Each leg; both studies put the mine 100 m from the plant |

The bounds keep at least one trip in a shift: the slowest, longest loop
(3 km at 0.1 m/s plus an hour of loading) still fits in 10 h.

`kMiningMass` is retired. Saved cases, study and case files, and links drop
it (and the ilmenite key v0.9 mapped onto it), and take the default fleet
(`src/lib/legacyParams.ts`). One vehicle's mass is a different quantity, so
the old value is not reinterpreted.

## Calibration and cross-checks

**One RASSOR's rate** (calibration benchmark `guerrero-zabel-2023-rassor-rate`).
- **The paper's case:** a 300 m loop at 0.27 m/s with 9 min of digging and
  dumping takes 27.5 min, so 34 whole trips fit in 16 h.
- **Result:** 34 trips × 80 kg = 2,720 kg/day, against the paper's 2.7 t/day.
- **What it confirms:** the inputs are the paper's, so agreement confirms the
  loop arithmetic, not the vehicle.

**NASA's polar mine** (documentation-only benchmark
`kleinhenz-paz-2020-polar-excavation`, updated):
- **Fleet size:** the model now lands the study's two whole RASSORs itself,
  132 kg.
- **The gap:** the study's 20% growth margin closes the difference to its
  Fig. 8 bar of about 161 kg.
- **Before v0.12:** the benchmark had to round up by hand.

## Published numbers that moved

1 t/day product unless named, default inputs except as named. Before → after.

| Case | Excavators | Fleet (kg) | Landed (t) | Payback (day) |
|---|---|---|---|---|
| Equatorial MRE (default) | 2 | 108 → **132** | 51.81 → **51.83** | 241 |
| MRE, 100 kg/day | 1 | 11 → **66** | 6.55 → **6.60** | 2,158 |
| MRE, 10 t/day | 17 | 1,084 → **1,122** | 503.90 → **503.93** | 765 |
| MRE, 500 m hauls (new input) | **7** | 108 → **462** | 51.81 → **52.16** | 241 |
| Polar ice (default) | 17 | 1,085 → **1,122** | 21.48 → **21.52** | 237 |
| Polar, 500 m hauls (new input) | **62** | 1,085 → **4,092** | 21.48 → **24.49** | 237 |
| Polar pilot, 10 kg/day | 1 | 11 → **66** | 1.24 → **1.29** | 22,182 → **22,268** |
| Polar propellant (NASA baseline) | 2 | 73 → **132** | 6.48 → **6.54** | 6,511 → **6,519** |
| Ilmenite, mare soil | 121 | 7,985 → **7,986** | 93.75 | 586 |
| Ilmenite, high-Ti basalt | 144 | 9,546 → **9,504** | 84.24 → **84.19** | 246 |

- **Small plants carry a whole vehicle.** A 100 kg/day plant now lands a
  full 66 kg excavator, not a sixth of one.
- **Haul distance matters where the fleet is large.** At 500 m each vehicle
  makes 9 trips a day instead of 34. The polar mine, which moves 44 t/day, then
  needs 62 vehicles and lands 3 t more.
- **Large fleets barely move.** Rounding up costs at most one vehicle, and at
  one 2.72 t/day vehicle, 34 trips is slightly better than the 2.7 t/day
  behind the old coefficient.
- **Landing counts do not change** at any of these cases.

Regression anchors moved deliberately, in `regression.test.ts`,
`test_regression.py`, and the fixed-seed uncertainty anchor:
- **v0.4:** polar landed mass 21.48 → 21.52 t.
- **v0.9:** the MRE and polar fleets are now exact whole-vehicle masses
  (132 and 1,122 kg).
- **v0.12:** new anchors for the trip count, a small plant, long hauls, and
  the ilmenite fleet.

The campaign panel's late-payback test moves from day 22,182 to 22,268.
Golden vectors were regenerated.

## In the app

- **Rail:** the excavation group shows the six fleet inputs in place of the
  fleet-mass coefficient.
- **Inspector:** the haulers and the polar excavator read the excavator count
  and each vehicle's daily soil, beside fleet mass, and offer haul distance
  as a control.
- **Evidence:** each input states its range basis and validity. Mining energy
  now says it is calibrated on 100 m hauls and does not yet grow with them.

Screenshots:
- [the excavation rail and haul distance's evidence](screenshots/whole-excavators/rail-haul-evidence.png)
- [the polar excavator at 500 m hauls](screenshots/whole-excavators/polar-excavator-500m.png)

## Verification

- **Regression:** v0.12 anchors in both suites check the trip count, the
  minimum fleet, the haul-distance step, and that the ilmenite plant's mining
  mass is the excavation fleet.
- **External benchmarks:** the RASSOR rate calibration and the updated NASA
  polar comparison, in both suites.
- **App:** the legacy-params tests cover the retired key on every entry
  point. The ilmenite route test checks that the new inputs act on both
  equatorial plants.
- **Parity:** 218 golden vectors. The Latin hypercube samples the six new
  inputs.
- **Size budget:** the ratchet goes from 192 to 208 KiB, for the v0.11 basalt
  feed and these fleet inputs. The engine is 199,077 B.

## Left for later

- **Haul energy.** Mining energy per kg should grow with haul distance, since
  most of a RASSOR's day is driving. That needs a split of `eMining` into
  digging and driving terms.
- **Margin and spares.** NASA carries 20% growth margin and the campaign
  ledger charges spares plant-wide; a spare excavator is not landed.
- **Overburden route.** NASA's mine strips overburden on a shorter route to
  the tailings site (half the mine length plus 10 m), before production
  starts. Overburden timing is still on the backlog.
- **Queueing and hopper waits.** NASA's excavators idle while the extractor
  hopper is full; the model assumes steady delivery.
