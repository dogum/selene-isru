# Refuelling demand v0.7

This continues the audit trail from [`model-audit-v02.md`](model-audit-v02.md),
[`model-depth-v03.md`](model-depth-v03.md),
[`model-fidelity-v04.md`](model-fidelity-v04.md),
[`model-campaign-v05.md`](model-campaign-v05.md), and
[`model-propellant-v06.md`](model-propellant-v06.md). It adds a demand side:
what uses the product. No earlier result moves at the defaults.

> **Model boundary:** the refuelling demand is an ideal rocket-equation
> estimate for one conceptual reusable lander. It is not a vehicle design,
> trajectory, operations, or cost model. TypeScript/Python parity proves the two
> implementations agree, not that the answer is right.

## Why

Until v0.6 the campaign ledger credited every kilogram the plant made as launch
mass saved. Nothing in the model used the product. A plant ten times larger
than any customer needs looked ten times better.

The demand the literature studies most is propellant for landers. v0.7 models
one: a reusable LOX/LH₂ lander based at the plant and refuelled on the surface.
The ledger then credits only the propellant it burns.

## What the model computes

`refuelDemand` chooses the demand:
- **`none`** (default): every kilogram is useful, as before.
- **`lander`**: a reusable lander flies `sortiesPerYear` round trips between the
  surface and a staging orbit.

The demand applies to plants that make lander propellant:
- oxygen at the equator
- LOX and LH₂ in polar propellant mode

Elsewhere (polar water, the Sabatier loop) the engine ignores it.

**One sortie.** All propellant is loaded on the surface. The lander climbs
with the up cargo and the propellant for its return, then lands with the down
cargo. With `c = IspReusable × g0`:

```
descent = (MdryReusable + McargoDown) × (exp(dvDescent / c) − 1)
ascent  = (MdryReusable + McargoUp + descent) × (exp(dvAscent / c) − 1)
oxidizer = (descent + ascent) × MR / (1 + MR)      fuel = (descent + ascent) / (1 + MR)
```

`MR` is the vehicle `mixtureRatio` from v0.6. A sortie that needs more than
`MtankReusable` raises a `refuel-tank-exceeded` caution. The demand is then
computed as if the load fitted.

**Supply and use.** The demand per day is the sortie load × `sortiesPerYear` /
365. The plant offers its oxygen and hydrogen after storage losses and
downtime, and each component is used up to its own demand:

```
used = min(O2 supplied, O2 demand) + min(H2 supplied, H2 demand)
```

Earth supplies any shortfall. At the equator, which makes no hydrogen, Earth
supplies all of it. In propellant mode the oxygen beyond the mixture ratio
becomes useful, because Earth tops up the hydrogen. The v0.6 ledger had to
discard that oxygen.

**Ledger.** `saved = gearRatio × used`. Earth-supplied propellant is not
charged to the plant: without the plant it would be launched anyway.
Propellant saves launch mass only when a sortie burns it, so the ledger
credits it a sortie at a time:
- Every 365 / `sortiesPerYear` days from production start, a sortie adds
  that interval's use.
- Only sorties flown within the campaign count. Two sorties fly in five
  years at one every two years, not 2.5.
- Spares still accrue daily, so payback falls on the first sortie whose
  credit clears the spend.

**Stores.** A lander loads a whole sortie at once, so the LOX and LH₂ stores
must hold at least one sortie's oxidizer and hydrogen. A store larger than
`reserveDays` of output scales its mass by `kCryoMass × inventory /
reserveDays`. Below that floor nothing changes.

**Tank drawdown.** `refuelTimeline()` starts the stores empty at production
start. Each store fills at the plant's rate after downtime, up to its
capacity. Every 365 / `sortiesPerYear` days a sortie draws its load, or
whatever is in the store.

`simulate()` returns the demand as `result.refuel`, which is null without a
demand. The campaign gains `usedKgPerDay`, `sortieIntervalDays` and
`cumulativeUsedKg`. Timeline points gain `usedKg` and are marked before and at
each sortie.

## Inputs

| Input | Default | Range | Basis |
|---|---|---|---|
| `sortiesPerYear` | 1 /yr | 0.5–52 | Chen, Sarton du Jonchay, Hou & Ho 2021 ([arXiv:1910.04265](https://arxiv.org/abs/1910.04265)), Table 1: one crewed mission a year. |
| `MdryReusable` | 5,917 kg | 2–40 t | Same source, Table 2: ACES-based LH₂/LOX spacecraft structure mass. |
| `MtankReusable` | 68,040 kg | 10–150 t | Same source, Table 2: propellant capacity. |
| `IspReusable` | 420 s | 350–465 | Same source, Table 2. |
| `McargoDown` | 30,000 kg | 0–60 t | Same source, Table 1: crew cabin and equipment to the Moon. |
| `McargoUp` | 5,000 kg | 0–30 t | Same source, Table 1: crew cabin and lunar samples back. |
| `dvDescent` | 2,050 m/s | 1,800–3,200 | Merancy 2023, *How: NRHO – The Artemis Orbit*, NASA Architecture Workshop ([PDF](https://www.nasa.gov/wp-content/uploads/2023/10/nrho-artemis-orbit.pdf)): LLO descent about 2,050 m/s, NRHO about 2,700 m/s. |
| `dvAscent` | 1,860 m/s | 1,700–3,000 | Same slides: LLO ascent about 1,860 m/s, NRHO about 2,700 m/s. |

The vehicle and the sortie come from the same study as the campaign inputs. The
default staging orbit is low lunar orbit. With NRHO values (2,700 m/s each
way), the crewed sortie needs 74 t, more than the vehicle's 68 t tanks, and the
caution says so.

## Reference results

Default inputs except as named. "Used" is after 90% availability. With a
demand, payback falls on a sortie day.

| Case | Per sortie (t) | Demand (kg/day) | Plant share | Used / delivered (kg/day) | Landed (t) | Payback (day) | Return |
|---|---|---|---|---|---|---|---|
| Equatorial, no demand | — | — | — | 900 / 900 | 60.4 | 242 | 6.63× |
| Equatorial, 1 crewed sortie/yr | 42.6 | 117 | 86% | 100 / 900 | 61.7 | 2,950 (after the campaign) | 0.73× |
| Equatorial, 9 crewed sorties/yr | 42.6 | 1,050 | 86% | 900 / 900 | 61.7 | 273 | 6.59× |
| Equatorial, crewed sortie from NRHO | 74.1 (over the tanks) | 203 | 86% | 174 / 900 | 67.2 | 1,490 | 1.25× |
| Equatorial, tanker: 8/yr, 5 t down | 17.3 | 379 | 86% | 325 / 900 | 60.4 | 669 | 2.39× |
| Polar propellant, no demand | — | — | — | 700 / 700 | 82.3 | 311 | 4.71× |
| Polar propellant, 1 crewed sortie/yr | 42.6 | 117 | 100% | 117 / 900 | 85.3 | 2,950 (after the campaign) | 0.78× |
| Polar propellant, tanker: 8/yr, 5 t down | 17.3 | 379 | 100% | 379 / 900 | 82.3 | 623 | 2.55× |
| Polar propellant, 20 crewed sorties/yr | 42.6 | 2,334 | 39% | 900 / 900 | 85.3 | 249 | 5.99× |

What the table shows:
- **Demand decides the return.** One crewed sortie a year uses a ninth of a
  1 t/day plant, and neither site pays back within the campaign. About nine
  sorties a year use all of it. Payback then comes with the sixth sortie, on
  day 273, against day 242 without a demand.
- **LOX-only plants supply at most 6/7 of the propellant.** At O/F 6 the
  hydrogen is a seventh of the load and comes from Earth.
- **A demand makes the surplus oxygen useful.** At 20 sorties a year the polar
  plant cannot meet either component. Earth tops up the hydrogen, so all
  900 kg/day of its oxygen and hydrogen is burned. The return is 5.99×,
  against 4.71× when only mixture-ratio propellant counted.
- **A better lander can lower the return of an oversized plant.** Raising
  `IspReusable` to 450 s cuts the sortie to 38.1 t and the return to 0.66×,
  because less product is used. The answer is to size the plant to the
  demand, not to fly worse landers.
- **Sortie-sized stores cost little.** Holding one 36.5 t oxygen load instead
  of 30 days of output adds 1.3 t at the equator. In propellant mode both
  stores grow, LOX from 26.7 t to 36.5 t and LH₂ from 3.3 t to 6.1 t, adding
  3 t.

## In the app

- **Rail:** a Refuelling demand group, shown for plants that make lander
  propellant.
  - A PRODUCT DEMAND select and the eight inputs, which appear while a demand is set.
  - At the equator the group also holds the mixture ratio, which then splits
    the demand.
  - The header reads the share of the lander's propellant the plant supplies.
  - Tests check that each hidden input is inert. The tank capacity is tagged
    CHECKS, because it only raises or clears its caution.
- **Campaign view:** a refuelling section.
  - Shows the propellant per sortie, the demand, the sorties the plant's oxygen
    and hydrogen can cover, and the product not needed.
  - Charts the tank drawdown.
  - Exports a DRAWDOWN CSV.
  - The ledger legend and caption say that only propellant burned is credited.
- **Exports and text:**
  - The campaign CSV gains `usedKg`.
  - The study CSV gains `campaign.usedKgPerDay` and eight `refuel.*` columns.
  - The case summary and report state the share.
  - URLs round-trip the demand.
- **Presets:** "Crew Lander Refuelling" and "Polar Propellant Tanker".

Screenshots: [campaign ledger](screenshots/refuel/refuel-crew-campaign.png),
[crewed-sortie drawdown](screenshots/refuel/refuel-crew-drawdown.png),
[polar tanker](screenshots/refuel/refuel-polar-tanker.png),
[rail](screenshots/refuel/refuel-rail.png), and
[mobile](screenshots/refuel/refuel-mobile.png).

## Verification

- `packages/engine/test/refuel.test.ts` and `python/tests/test_refuel.py`
  check that:
  - each leg closes the rocket equation
  - each component is used up to its demand and Earth supplies the rest
  - the ledger credits only what is used
  - stores hold a sortie's load and their mass follows
  - a demand on a water or Sabatier plant changes nothing
  - the tank caution fires
  - drawdown stays within the stores, and each sortie draws the demand's
    steady use
- **Parity:**
  - The Latin hypercube now also samples `polarProduct` and `refuelDemand`.
  - There are 215 golden vectors, 56 with an active demand, including two new
    named scenarios (an equatorial crewed sortie, and an NRHO polar tanker
    with passive storage).
  - The dynamics fixture adds two drawdown timelines.
- **Regression anchors** (new and deliberate): one crewed sortie a year burns
  42.6 t, uses 100 kg/day, and returns 0.73×. At nine a year, payback comes
  on day 273, with the sixth sortie.
- **Size budget:** the engine ratchet goes from 160 to 176 KiB for the v0.6
  and v0.7 models and their cited parameters.

## Left for later

- **Methalox landers.** The Sabatier loop's LOX and methane could fuel a
  methane lander, at a different mixture ratio and Isp. The demand covers
  LOX/LH₂ only.
- **Propellant export.** A tanker lifting propellant to a depot as cargo would
  turn `McargoUp` into product and credit it at an in-orbit gear ratio.
- **Delivery-lander reuse.** Refuelling the infrastructure landers themselves
  would lower `M0leo` per landing after the first (v0.5 item).
- **Vehicle losses.** Boil-off between sorties, reserves, and hover margins
  beyond the delta-v figures.
- **Sizing to demand.** A control that sets the plant target from the demand
  instead of by hand.
