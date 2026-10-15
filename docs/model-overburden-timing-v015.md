# Overburden timing v0.15

This continues the audit trail from
[`model-excavation-v09.md`](model-excavation-v09.md) and
[`model-basalt-feed-v011.md`](model-basalt-feed-v011.md). Both left the same
item open: a mine has to strip its first overburden before it delivers any
ore, and the model spread stripping evenly over the campaign instead.

At the default inputs nothing moves: the polar and basalt strips finish inside
the 30-day commissioning. The input matters for short commissioning, deep
cover, or a mine that strips far ahead.

> **Model boundary:** the strip is one block of the fleet's whole capacity
> before production, then steady stripping with mining. Ramps, benches, and a
> separate overburden haul route are not modelled. TypeScript/Python parity
> proves the two implementations agree, not that the answer is right.

## Why

Since v0.9 the fleet has stripped overburden at a steady rate, alongside
mining, from day one of production. Real pit mines don't work that way:
- **NASA's polar mine** (Kleinhenz & Paz 2020, Sec. IV-C) removes the
  overburden and builds its access ramps for the whole 32 m pit before any
  ice is delivered. In their overburden trade, deeper cover takes longer to
  remove and so shortens the production window.
- **Eagle's basalt mine** (Eagle Engineering 1988) begins mine site
  preparation and overburden removal while the plant is being set up. It then
  keeps stripping alongside basalt mining (Table 6-4 strips 5,088 t in the
  first year for 4,458 t of basalt).

## What the model computes

```
initial strip days = stripAheadDays · overburden per day / (excavators · soil per excavator per day)
first product day  = deployment + max(commissioningDays, initial strip days)
```

- **Strip size:** the whole fleet, at its whole-vehicle capacity, strips the
  cover over the first `stripAheadDays` of mining.
- **Overlap:** this runs alongside commissioning, so production waits for
  whichever finishes last.
- **After the strip:** stripping continues at a steady rate with mining, as
  before.
- **New result field:** `excavation.initialStripDays`. It is 0 where there is
  no overburden: MRE, and ilmenite on a soil feed.

| Key | Default | Range | Unit | Basis |
|---|---|---|---|---|
| `stripAheadDays` | 30 | 0–730 | day | Design assumption: a month of working face |

The default is an assumption, labelled as one: neither study states a lead
for a multi-year plant. Setting it to the whole campaign reproduces NASA's
whole-pit sequencing. The rail shows it only where a mine strips overburden:
the polar pit, or an ilmenite plant mining basalt.

## Numbers

Default inputs except as named.

| Case | Overburden (t/day) | Fleet | Initial strip (days) | First product (day) | Payback (day) |
|---|---|---|---|---|---|
| Polar ice (default) | 17.8 | 17 RASSORs | 11.5 | 30 (commissioning) | 237, unchanged |
| Polar, 90 days ahead | 17.8 | 17 | 34.6 | **34.6** | **241** |
| Polar, overburden ratio 2.5 | 66.7 | 35 | 21.0 | 30 (commissioning) | 237 |
| Basalt feed (default) | 204.9 | 144 | 15.7 | 30 (commissioning) | 246, unchanged |
| Basalt, 90 days ahead | 204.9 | 144 | 47.1 | **47.1** | **263** |
| NASA propellant case, 2-day commissioning | 1.2 | 2 | 6.6 | **6.6** | 6,525 → **6,530** |
| NASA case, whole 223-day pit first | 1.2 | 2 | 49.0 | **49.0** | **6,573** |

- **The NASA case shows why the timing matters.** Its two RASSORs need about
  49 days to strip the whole pit's 266 t, a fifth of its 225-day window,
  before the first ice. With the 30-day default face they need 6.6 days,
  which outlasts its 2-day commissioning.
- **Defaults do not move,** because commissioning covers the strip. Every
  earlier anchor holds.

The NASA case is a preset ("Polar Propellant (NASA baseline)"), so its
payback moves from day 6,525 to 6,530 in the app.

## In the app

- **Rail:** `stripAheadDays` joins the excavation group where a mine strips
  overburden. A test checks that it is hidden, and inert, everywhere else.
- **Campaign panel:** when the strip outlasts commissioning, the caption
  names it ("a 35-day initial overburden strip, which outlasts 30 days of
  commissioning") and the pre-production phase reads STRIP OVERBURDEN.
- **Evidence:** the input states NASA's whole-pit and Eagle's concurrent
  practice. Commissioning's evidence now says the strip runs alongside it.

Screenshot: [the campaign panel with a 90-day strip at the pole](screenshots/overburden-timing/campaign-strip.png)

## Verification

- **Regression (v0.15):** in both suites:
  - the default polar strip and that it hides in commissioning
  - a 90-day basalt strip delaying production and payback
  - NASA's whole-pit strip, written out against two whole RASSORs
- **App:**
  - `campaign-panel.test.tsx` checks the caption either way.
  - It also checks the rail rule, and that the input is inert where hidden.
- **Parity:** 218 golden vectors; the Latin hypercube samples the new input.
  The dynamics vectors run at defaults, where the start day does not move.

## Left for later

- **The overburden route.** NASA strips to a tailings site half the mine
  length plus 10 m away, shorter than the mining loop, and before production
  rather than at a steady rate.
- **Ramps and benches.** Deeper mines keep building ramps as they mine.
- **Phased start-up.** Production could start on the first exposed face
  while stripping continues (backlog: phased start-up).
