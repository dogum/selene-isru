# Campaign ledger v0.5

This continues the audit trail from [`model-audit-v02.md`](model-audit-v02.md),
[`model-depth-v03.md`](model-depth-v03.md), and
[`model-fidelity-v04.md`](model-fidelity-v04.md). It adds one new evaluation
layer, the campaign mass ledger. No earlier result moves.

> **Model boundary:** the ledger is a mass account, not a cost, schedule-risk,
> reliability, or mission-readiness model. It answers "how long until the
> product has saved as much launch mass as the plant cost to land and keep
> running?" under stated assumptions. TypeScript/Python parity proves the two
> implementations agree, not that the answer is right.

## Why

Before v0.5 the only return metric was Leverage L:

```
L = annual product × mission years × gearRatio / landed plant mass
```

It has three gaps:
- **It mixes units.** The numerator is launch mass saved; the denominator is
  mass landed on the Moon. Landing a kilogram costs far more than a kilogram:
  at defaults the lander model needs 12.8 kg in low Earth orbit (LEO) per kg
  landed.
- **It assumes full output from day one.** There is no deployment time or
  commissioning.
- **It has no spares or downtime.**

At the equatorial default L reads 186×. The like-for-like figure below is 6.7×.

## What the ledger computes

Both sides are in kg of mass in LEO, the currency of the lander model's
`M0leo`. Times are days from the first infrastructure landing.

```
spent(t) = M0leo × landers arrived by t                      (dedicated)
         | (M0leo / lander capacity) × plant mass landed by t  (shared)
         + (M0leo / lander capacity) × (spares + imported feed) landed by t
saved(t) = gearRatio × product delivered by t
```

Product is what the plant delivers:
- oxygen at the equator
- water at the pole
- with the Sabatier loop, its oxygen, methane, and leftover hydrogen

It is not the water processed.

- **Deployment:** landers arrive every `365 / landingsPerYear` days from day 0.
  Each carries up to one lander capacity (`etaPack × payload`) of plant.
- **Start-up:** production starts once the last lander has arrived and
  `commissioningDays` have passed (all-up deployment).
- **Operation:** the plant then runs for `missionYears` at its product rate ×
  `plantAvailability`.
- **Spares:** `sparesFracPerYear` of the landed plant mass is delivered each
  year as a mass share of other cargo.
- **Imported feed:** the Sabatier loop's CO₂ has no lunar source in this model.
  It is landed as it is consumed (× availability) and charged like spares.
- **Payback** is the day saved first equals spent:
  `firstProductDay + plantLeoMass / (daily saving − daily spares cost)`. It is
  null when spares and feed cost at least as much LEO mass per day as the
  product saves.
- **Return** is saved ÷ spent at campaign end.

`deploymentManifest` sets how deployment landers are charged:
- **`dedicated`** (default) charges whole landers. This matches the engine's
  MISSIONS count.
- **`shared`** charges only the plant's mass share of each lander.

Spares are always charged by mass share.

If the lander can carry no payload at the given inputs, nothing is landed. The
ledger is then empty and a `lander-no-payload` alarm is raised.

`simulate()` returns the totals as `result.campaign`. `campaignTimeline()` and
`campaignAt()` evaluate the same terms over time for charts and export.

## Inputs

| Input | Default | Range | Basis |
|---|---|---|---|
| `landingsPerYear` | 3 /yr | 0.5–12 | Chen, Sarton du Jonchay, Hou & Ho 2021, *Multifidelity Space Mission Planning and Infrastructure Design Framework for Space Resource Logistics*, J. Spacecraft & Rockets ([arXiv:1910.04265](https://arxiv.org/abs/1910.04265)), Table 4: 120-day launch interval. |
| `sparesFracPerYear` | 0.10 /yr | 0–0.3 | Same source, Table 4: ISRU maintenance of 10% of system mass per year, after Ho et al. 2014 and Chen & Ho 2018. Chen, Ornik & Ho 2021 ([arXiv:2103.08970](https://arxiv.org/abs/2103.08970)) use 5%. |
| `commissioningDays` | 30 d | 0–365 | **Design assumption.** Kleinhenz & Paz 2020 (AIAA 2020-4042) assume 48 h, which is optimistic for a first-of-a-kind plant. |
| `plantAvailability` | 0.9 | 0.5–1 | **Design assumption.** A constant allowance for unplanned downtime. Night-time power storage is already covered by plant sizing. |
| `deploymentManifest` | dedicated | dedicated / shared | Model switch. |

`gearRatio` (default 6) is read as LEO mass saved per kg of product, the same
unit as `M0leo`. Product used on the lunar surface displaces landed cargo, and
for that use the lander model itself implies about 12.8 kg/kg. Lower values
suit product used in orbit.

## Reference results

Default inputs except as named.

| Case | Landed (t) | Landers | Leverage L | First product (day) | Payback (day) | Return | Net LEO mass (t) |
|---|---|---|---|---|---|---|---|
| Equatorial | 59.0 | 1 | 186× | 30 | 242 | 6.67× | 8,377 |
| Equatorial, shared lander | 59.0 | 1 | 186× | 30 | 176 | 8.69× | 8,721 |
| Polar | 29.9 | 1 | 367× | 30 | 238 | 7.63× | 8,564 |
| Polar + Sabatier (CO₂ landed from Earth) | 62.3 | 1 | 176× | 30 | never | 0.79× | −2,827 |
| Polar, 1 wt% ice | 70.7 | 1 | 155× | 30 | 244 | 6.35× | 8,302 |
| Equatorial, 10 t/day, 2 landings/yr | 575.5 | 7 | 190× | 1,125 | 1,273 | 8.65× | 87,162 |
| Polar pilot, 10 kg/day | 1.4 | 1 | 76× | 30 | 22,501 (after the campaign) | 0.09× | −1,011 |
| Polar pilot, 10 kg/day, shared lander | 1.4 | 1 | 76× | 30 | 406 | 3.57× | 71 |

What the table shows:

- **Production-scale plants.** Payback falls in the first year for every
  reference plant that imports nothing, and those plants differ by days, not
  months. Within a 1,100 t lander, plant mass barely matters.
- **Sabatier.** It never pays back. At defaults it lands about 191 t of CO₂ a
  year, which costs about 6.7 t of LEO mass a day. Its products save 6.0 t a
  day, so it loses ground every day it runs. Leverage L rates it 176× because
  L ignores the feed. A lunar carbon source would change this answer; the
  model has none.
- **Large plants.** Time to land dominates. A 10 t/day plant on seven landers
  at two a year starts producing on day 1,125 and pays back on day 1,273.
- **Pilot plants.** The charging question decides the answer. On a dedicated
  lander a 10 kg/day pilot never pays back its launch mass. Charged by mass
  share, it pays back on day 406.
- **Leverage L.** It ranks polar above equatorial by 2×. The ledger puts the
  two within 15%, because both plants fit on one lander.

At the equatorial default, payback moves as follows when one input changes:

| Input change | Payback (day) | Return |
|---|---|---|
| Commissioning 0 d | 212 | 6.67× |
| Commissioning 180 d | 392 | 6.67× |
| Availability 0.5 | 424 | 3.70× |
| Spares 5%/yr | 238 | 7.65× |
| Spares 30%/yr | 260 | 4.41× |
| Gear ratio 12.8 (surface use) | 127 | 14.23× |

## In the app

- **Campaign view:**
  - charts cumulative LEO mass spent and saved, with deployment,
    commissioning, and operating phases
  - marks payback, and states the payback day, campaign return, and net LEO
    mass
  - switches between dedicated and shared landers
  - exports the ledger as CSV every 30 days, plus each landing, production
    start, payback, and campaign end
- **Rail:** a Campaign group with the four inputs and the lander-charging
  select. Landing cadence shows NO EFFECT for a one-lander plant and says why.
- **Other surfaces:**
  - A/B compare shows payback and campaign return.
  - The study CSV adds eleven `campaign.*` columns.
  - The case summary and report state the payback.
  - The Leverage and plant-mass inspectors point to the ledger.

Screenshots: [equatorial default](screenshots/campaign/campaign-equatorial-default.png),
[seven-lander deployment](screenshots/campaign/campaign-multi-lander.png),
[pilot on a dedicated lander](screenshots/campaign/campaign-pilot-dedicated.png)
and [shared](screenshots/campaign/campaign-pilot-shared.png),
[rail inputs](screenshots/campaign/campaign-rail.png), and
[mobile](screenshots/campaign/campaign-mobile.png).

## Verification

- `packages/engine/test/campaign.test.ts` and `python/tests/test_campaign.py`
  check that the ledger agrees with itself:
  - the timeline reproduces the totals at campaign end
  - saved equals spent at payback
  - the timeline is cumulative and marks every landing
  - a dedicated landing steps spend by exactly one `M0leo`
  - a shared manifest charges every landed kg at the same LEO cost
  - a no-payload lander leaves the ledger empty
- **Golden vectors** cover the ledger at all 211 points (two new named
  scenarios: a multi-lander deployment and a shared pilot). The dynamics
  fixture adds two `campaignTimeline` vectors, so the time history is
  parity-checked too.
- **Regression anchors** for the equatorial payback (day 241.8, return 6.67)
  are new and deliberate, in `regression.test.ts` and `test_regression.py`.

## Left for later

- **Phased start-up.** Production could begin as modular trains land rather
  than after the last lander. That would shorten payback for multi-lander
  plants.
- **Product demand.** Every kilogram produced is assumed useful. A demand
  ceiling, for example a refuelling campaign's propellant need, would cap
  `saved`. This connects to the planned lander-refuelling scenario.
- **Lander reuse.** Landers refuelled with ISRU propellant would change
  `M0leo` per landing after the first.
- **Spares that change over time.** Infant-mortality and wear-out curves
  instead of a constant fraction.
- **Probabilistic losses.** Launch failure, landing failure, and early plant
  loss.
- **A lunar carbon source.** CO₂ from cold-trap volatiles would remove the
  Sabatier feed charge. Nothing in the model sources carbon locally today.
