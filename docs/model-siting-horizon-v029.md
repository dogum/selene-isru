# The reactor's line-of-sight horizon v0.29

This continues the audit trail from
[`model-ac-transmission-v028.md`](model-ac-transmission-v028.md). Since v0.25 the
backlog has carried topography: a crater rim or ridge between reactor and
outpost attenuates dose, and the model's outpost is in line of sight. No source
in hand says by how much, so this release adds the geometry and charges
nothing for it.

**What changes:**
- **A line-of-sight horizon:** the distance at which the reactor's core drops
  below the outpost's view over a smooth Moon.
  - **At the defaults:** 2.43 km, Barth & Pike's 2.4 km lunar horizon.
  - **New inputs:** the outpost's height `hOutpostM` (1.7 m, a crew member's
    eyes) and the reactor core's height `hReactorM` (0 m, at the surface).
- **A note beyond it:** when the outpost sits farther than the horizon, the
  plant raises an info note: terrain blocks direct radiation, and the shield,
  sized for line of sight, does not credit it.
- **No mass moves.** No result but the horizon and the note depends on the two
  heights, and no regression anchor changes.

> **Model boundary:** the horizon is geometry over a sphere of the Moon's mean
> radius. Real terrain can put the horizon nearer or farther, and the model
> charges the shield in full beyond it, since no source quantifies how much
> terrain attenuates dose. It is a check, not a dose calculation.
> TypeScript/Python parity proves the two implementations agree, not that the
> answer is right.

## Why

- **NASA uses the horizon as a siting argument.** Barth & Pike 2022: "Although
  the distance to the horizon is very dependent on topography, a 3 km
  separation places the reactor over the 2.4 km lunar horizon from the crew and
  shields them from radiation."
- **The model's shield ignores it.** It is Mason 2025's directional shield,
  sized for an outpost in line of sight at every separation (v0.25).
- **What would be needed to credit it:** the attenuation of the regolith
  between reactor and crew, which depends on the ground profile. Mason 2006
  suggests a partial shield sited behind hills or crater rims "could also be
  considered", without sizing it.
- **So, the honest step:** show where the horizon falls and say when the
  outpost is past it, without inventing a credit.

## What the model computes

```
horizonKm = ( sqrt(2 R hReactor) + sqrt(2 R hOutpost) ) / 1000     [km]
```

- **R** is the Moon's mean radius, 1,737.4 km (new physical constant `rMoonM`).
- **A buried reactor's core** is at or below the surface, so its height is 0
  whatever `hReactorM` says; the rail hides `hReactorM` under buried.
- **The note `outpost-beyond-horizon`** (info) fires when the architecture is
  nuclear and `dSeparationKm` exceeds the horizon.
- **`power.horizonKm`** reports the horizon; `horizonKm(params)` is exported as a
  pure helper in both implementations.

| Key | Default | Range | Basis |
|---|---|---|---|
| `hOutpostM` | 1.7 m | 0–20 m | A standing crew member's eyes; reproduces Barth & Pike's 2.4 km, whose eye height is not stated |
| `hReactorM` | 0 m | 0–10 m | Design assumption: Barth & Pike take the reactor at the surface; a core left on its lander stands several metres up |
| `rMoonM` | 1,737.4 km | physical | IAU mean radius |

## The sources

**Barth & Pike 2022** (NETS 2022), Sec. I:
- current FSP concepts transfer power 1 to 3 km from the reactor
- a 3 km separation places the reactor over the 2.4 km lunar horizon from the
  crew, though the horizon "is very dependent on topography"

**Mason 2006** (NASA/TM-2006-214120), Deployment Concepts: "A hybrid shielding
approach that uses a partial on-board shield combined with selective siting of
the system behind natural surface features (e.g., hills, crater rims, etc.)
could also be considered." It is not sized.

## Calibration and cross-checks

- **Barth & Pike's horizon, not fitted beyond the eye height:** 2.43 km for
  1.7 m, against their 2.4 km (benchmark `barth-pike-2022-lunar-horizon`); at
  their 3 km the note fires.
- **The separations the model finds best are all in view:**

  | Case | Lightest separation | Horizon | Outpost |
  |---|---|---|---|
  | Mason 2025's 40 kWe system | 1.87 km | 2.43 km | in view |
  | Equatorial MRE, 1 t/day | ~1.8 km | 2.43 km | in view |
  | Polar ice | ~2.05 km | 2.43 km | in view |
  | NASA FSP's design, 1 km | 1 km | 2.43 km | in view |
  | Barth & Pike's 3 km | 3 km | 2.43 km | **beyond** |

  So crediting terrain would not change any default answer; it would only make
  separations past 2.4 km cheaper than the model says.
- **A raised core sees farther:** 5.07 km at 2 m and 6.16 km at 4 m, so a
  reactor left on its lander must sit much farther away to hide.

## Numbers

No result moves at any setting except the horizon and the note:
- the default plant's landed mass stays 50.35 t
- every v0.4–v0.28 anchor holds unchanged

New v0.29 anchors in both suites:
- the default horizon, 2.430 km, and no note at 1 km
- the info note at 3 km, with the shield unchanged
- a reactor at 4 m sees 6.158 km; a buried one ignores its height
- either height moves no mass, and a solar plant raises no note

Golden vectors were regenerated: the Latin hypercube now samples the two
heights, and the parity set stays 221 vectors.

## In the app

- **Rail:** the power group shows the outpost's and the reactor's heights; the
  reactor's is hidden under buried. Both tag as CHECKS: they move only the
  horizon.
- **Evidence:** both cite Barth & Pike's Sec. I and state that the shield is
  still charged in full.
- **Power panel:** a HORIZON line, under the nuclear architecture, gives the
  horizon and whether the outpost is in view or beyond it.

Screenshot: [the outpost height's evidence at 3 km, with the power panel's HORIZON line](screenshots/siting-horizon/siting-horizon.png)

## Verification

- **Regression (v0.29):** in both suites.
- **Benchmarks:** `barth-pike-2022-lunar-horizon` (documentation-only) checks
  the horizon, the note at 3 km, and the uncredited shield.
- **App:** `fission-converter.test.tsx` covers the rail's visibility, the CHECKS
  tags, and the evidence.
- **Parity:** 221 golden vectors.
- **Size budget:** the engine is 233,189 B, within 240 KiB.

## Left for later

- **Terrain attenuation.** A credit for the regolith between reactor and
  outpost needs a ground profile and a dose model; no source in hand sizes it.
- **The buried reactor's excavation,** from v0.26.
- **The converters at each end, and skin effect,** from v0.28.
