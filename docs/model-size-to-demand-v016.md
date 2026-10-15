# Sizing the plant to its demand v0.16

This continues the audit trail from [`model-refuel-v07.md`](model-refuel-v07.md),
which left the item open: the plant target was set by hand, so a refuelling
demand could only be matched by trial and error.

`simulate()` does not change, and no earlier result moves. v0.16 adds a solver
and a control that sets the target.

> **Model boundary:** the size is a steady-state match of average supply to
> average demand, for one conceptual lander. It is not a plant design, a
> schedule, or an optimum. TypeScript/Python parity proves the two
> implementations agree, not that the answer is right.

## Why

v0.7 credited only the propellant a lander burns, and showed what follows.
One crewed sortie a year burns a ninth of a 1 t/day plant's oxygen, so neither
site paid back within the campaign. Its conclusion was to size the plant to
the demand, not to fly worse landers. But finding that size meant sliding the
target until the surplus disappeared, by hand, for every change to the lander
or the sortie rate.

## What the engine computes

`sizeToDemand(params)` (Python `size_to_demand`) returns the **smallest target
at which every component the plant makes meets the lander's demand for it**:

```
coverage of a component = its supply after storage losses and downtime / its demand    [1]
sized target            = smallest targetKgPerDay where min(coverage of each made component) = 1
```

- **Equator:** the plant makes oxygen only, so the size is the oxygen demand.
  Earth supplies all the hydrogen, as before. With zero-boil-off stores this is
  exactly the oxygen demand over `plantAvailability`.
- **Pole, propellant mode:** water splits at 8 kg of oxygen per kg of hydrogen.
  The lander burns them at its O/F of 6 (at most 7.9). So hydrogen meets its
  demand last and sets the size, and some oxygen is left over. Sizing to the
  oxygen instead would leave a quarter of the hydrogen to come from Earth.
- **Larger plants:** a plant larger than the sized one adds only product the
  lander does not burn.
- **No demand:** where no demand applies (no lander, a polar water plant, or
  the Sabatier loop), the solver returns null.
- **Bounds:** a demand outside the target's 10 kg/day–20 t/day bounds holds the
  target at the bound. The result says which bound it hit.

**How it solves.** Supply rises monotonically with the target, because storage
losses grow more slowly than output. On passive storage, small plants can
lose all of it. So a bisection over the target's bounds finds the size.
- **Cost:** about 45 engine runs, a few tens of milliseconds, only when asked.
- **Result:** it returns the bracket's low end, under a part in 10¹² short of
  the demand, so float noise never shows up as surplus.

The result (`DemandSizing`) carries:
- `targetKgPerDay`
- `limitedBy`: the component that sets the size
- `bound`: `within`, `min`, or `max`

## Reference results

1 crewed sortie a year unless named, default inputs otherwise. Hand-set
1 t/day → sized. Payback after day 1,855 is after the campaign ends.

| Case | Sized target (kg/day) | Plant landed (t) | Landings | Not needed (kg/day) | Payback (day) | Return |
|---|---|---|---|---|---|---|
| Equatorial MRE | 111 | 53.2 → **13.9** | 1 | 800 → **0** | 2,950 → **2,220** | 0.76 → **0.92** |
| Equatorial MRE, from NRHO | 193 | 58.6 → **23.0** | 1 | 726 → **0** | 1,490 | 1.29 → **1.53** |
| Equatorial MRE, tanker: 8/yr, 5 t down | 361 | 51.8 → **20.5** | 1 | 575 → **0** | 669 → **623** | 2.48 → **2.89** |
| Ilmenite on mare soil, tanker | 361 | 94.6 → **35.9** | 2 → **1** | 575 → **0** | 1,520 → **669** | 1.27 → **2.67** |
| Ilmenite on basalt, tanker | 361 | 85.0 → **32.5** | 1 | 575 → **0** | 714 → **669** | 2.16 → **2.72** |
| Equatorial MRE, 9 sorties/yr | 1,000.3 | 53.2 | 1 | 0 | 273 | 6.84 |
| Polar propellant | 167 | 77.7 → **22.4** | 1 | 783 → **33** | 2,950 → **1,855** | 0.80 → **1.03** |
| Polar propellant, tanker | 541 | 74.8 → **41.6** | 1 | 521 → **108** | 578 | 2.63 → **3.04** |
| Polar propellant, tanker, passive storage | 1,020 | 73.8 → **75.2** | 1 | 411 → **426** | 623 | 2.63 → **2.62** |
| Polar propellant, 20 sorties/yr | 3,334 | 77.7 → **244.6** | 1 → **3** | 0 → **667** | 249 → **529** | 6.17 → **5.25** |

What the table shows:
- **An oversized plant hides a good case.** Sized to one crewed sortie a year,
  the polar plant lands 22 t instead of 78 t and pays back, on the campaign's
  last sortie, where the 1 t/day plant never did.
- **Some demands are too small to pay back at any size.** The equatorial plant
  sized the same way still returns 0.92×. A small plant carries whole vehicles
  and a whole landing's overheads.
- **Sizing can save a landing.** The ilmenite soil plant at 1 t/day needs two
  landings; sized to a tanker's demand it fits one, and payback moves from
  day 1,520 to 669.
- **Passive hydrogen storage sets its own size.** On passive stores the LH₂
  boil-off takes about half the hydrogen made. The tanker then needs a
  1,020 kg/day plant, with oxygen left over, for 541 kg/day on zero-boil-off
  stores.
- **Sizing to demand is not maximising return.** Twenty crewed sorties a year
  at the pole need a 3.3 t/day plant and three landings.
  - **Return:** 6.17× → 5.25×, because more of the spend is landings.
  - **Net saved:** 8,300 t → 20,700 t of LEO mass, two and a half times more.
  - Which matters is the user's question, so the solver answers the demand and
    the ledger shows both.
- **Why the pole sizes to its hydrogen.** At the pole the landing, not the
  plant mass, dominates LEO spend.
  - **Sized to oxygen:** 125 kg/day, return 1.005×, and Earth supplies a
    quarter of the hydrogen.
  - **Sized to hydrogen:** 2.7 t more plant in the same landing raises the
    return to 1.03× and the plant supplies all of it.

## In the app

- **Rail:** the Refuelling demand group gains SIZE PLANT TO DEMAND once a
  demand is set.
  - **One step:** it runs the solver and sets the target through `applyPatch`,
    so one undo step takes it back.
  - **Note:** it says what it set, with the product the target is in (oxygen at
    the equator, water at the pole), any oxygen left over, and which bound held
    the target if one did.
  - **Retiring:** any later edit retires the note.
  - **Authored cases only:** a Custom Site's output comes from its placed
    equipment, not the plain model the solver runs, so the planner does not
    offer it.
- **Engine API:** the app consumes `sizeToDemand` like any other exported
  helper; it computes nothing itself.

Screenshot: [the polar plant sized to one crewed sortie a year](screenshots/size-to-demand/polar-sized.png)

## Verification

- **Solver:** `refuel.test.ts` and `test_refuel.py` check, for five plants:
  - the sized plant meets the demand for each component it makes
  - 1% more adds nothing burned, and 1% less supplies less
  - the equatorial size is the oxygen demand over availability, with no float
    surplus
  - the polar size leaves only oxygen over, and the plant supplies the whole
    demand
  - the bounds hold, inputs are clamped first, and no demand means no size
- **Regression (v0.16):** anchors in both suites for the sized equatorial and
  polar crewed cases and the 20-sortie polar case.
- **Parity:** seven sizing vectors in `dynamics_vectors.json`, including both
  bounds and a plant with no demand, compared leaf by leaf. Golden vectors do
  not change, since `simulate()` does not.
- **App:** `control-rail.test.tsx` checks:
  - the click sets the engine's size and leaves no surplus
  - the note's wording at both sites and at a bound
  - one undo restores the hand-set target and retires the note
  - the Custom Site workspace does not offer the button

## Left for later

- **Sizing for return or for landings.** The solver meets the demand. A size
  that maximises the return ratio, or fills the landings a plant already
  needs, is a different question (the 20-sortie case shows they diverge).
- **Following the demand live.** The target is set once; changing the
  lander afterwards leaves it where it was until the button is pressed again.
  A live mode would need every surface that reads the target to read the
  engine's sized value instead.
- **Peak rather than average.** Stores already hold a sortie's load, but a
  plant sized to the average cannot catch up after downtime longer than its
  `plantAvailability` allows for.
