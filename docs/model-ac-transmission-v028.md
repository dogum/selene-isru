# AC transmission v0.28

This continues the audit trail from
[`model-cable-voltage-v027.md`](model-cable-voltage-v027.md). v0.27 designed the
cable to the outpost as a bipolar DC line, Barth & Pike's lightest form. NASA's
current 40 kWe design transmits at 3 kVac instead, so the model could neither
compare the two forms nor reproduce the cable Mason 2025's mass figures were
fitted to.

**What changes:**
- **A transmission switch:**
  - **Bipolar DC** stays the default.
  - **Three-phase AC:** three conductors, each insulated for its peak voltage
    to ground, held to the same peak as the DC line.
- **The cable's fixed mass per km is refitted** to the cable Mason 2025 actually
  uses, 3 kVac, rather than v0.27's DC line.
- **At the defaults:**
  - The cable falls from 795 to 726 kg, and the plant lands 50.35 t, from
    50.42 t.
  - Its lightest separation is 1.8 km, Mason's figure.
- **AC instead of DC:** the default plant lands 50.74 t, and a 10 t/day plant
  3.2 t more.

> **Model boundary:** the AC line is three aluminium conductors at unity power
> factor with FEP insulation at one design stress, inside one jacket. Skin
> effect at NASA's 1 kHz, reactive power, and the transformers and converters at
> each end are not modelled for either form. TypeScript/Python parity proves
> the two implementations agree, not that the answer is right.

## Why

- **The two NASA designs disagree on form:**
  - **Barth & Pike 2022:** DC is the lighter cable.
  - **Mason 2025 and Mason 2006:** choose AC, at 3 kVac and 5,000 Vac.
- **What AC buys:** transformers step its voltage up and down without high-voltage
  switching devices (Oleson et al. 2022).
- **What it costs:** its peak voltage is √2 times its RMS, so its insulation is
  thicker for the same RMS voltage.
- **What v0.27 got wrong:** it fitted the cable's fixed mass per km by
  subtracting a DC line from Mason 2025's pallet growth. Mason's pallet carries
  a 3 kVac cable.

## What the model computes

| | Bipolar DC | Three-phase AC |
|---|---|---|
| Conductors | 2 | 3 |
| Conductor area for a loss f per km | 2 ρ P / (V² f) | ρ P / (V² f) |
| Peak voltage to ground (sets insulation) | V / 2 | V √(2/3) |
| Jacket's bundle radius | 2 (r + t) | (1 + 2/√3)(r + t) |
| Voltage cap, line to line | VCableMaxV | VCableMaxV / 2 / √(2/3) |

- **V** is the line-to-line voltage, RMS for AC.
- **Conductor:**
  - The three-phase line carries P/(√3 V) in each conductor and loses
    ρ P L / (V² A) in all three.
  - At the same line voltage it needs ¾ of the DC line's aluminium.
- **Voltage:** found as in v0.27, by bisection on the sign of the mass's slope,
  with the slope written for either form.
- **Cap:** the peak voltage to ground stays within `VCableMaxV` / 2 for both
  forms, the partial-discharge limit the cap stands for.
  - The default 8 kV DC cap becomes 4.9 kVrms AC, Mason 2006's 5,000 Vac cable.
  - At that cap both lines have the same insulation thickness.
- **`cableForm`** chooses `dc` (the default) or `ac`.
- **`power.cableVoltageV`** reports the line-to-line voltage, RMS for AC. The
  power panel's CABLE line names the form.

| Key | Default | Range | Basis |
|---|---|---|---|
| `cableForm` | dc | dc, ac | Model switch |
| `kCableKgPerKm` | **243** kg/km (was 312) | 0–1,000 | Refitted: Mason 2025's 385 kg/km less the 3 kVac cable the model designs for 40 kWe (143 kg/km) |
| `VCableMaxV` | 8,000 V | 1–30 kV | Unchanged; now read as the DC line-to-line limit, the same peak to ground for AC |

## The sources

**Barth & Pike 2022** (NETS 2022), Sec. III.D, Figs. 3 and 4:
- **The AC cable:** a three-phase cable with the same insulation thickness per
  peak voltage as the DC one, heavier than it, because the AC peak voltage needs
  thicker insulation.
- **Its optimum:** lightest at 3,000 Vrms line to neutral, 5,200 Vrms line to
  line, for 40 kW over 3 km at 95% efficiency.

**Mason 2025** (NETS 2025):
- **The line:** 3 kVac at 1 kHz, four 10 kWe feeds of three 14 AWG wires each.
- **Why that voltage:** no mass benefit above 3 kVac for 40 kWe, since the
  wires reached their minimum size.
- **The mass figures:** the user interface pallet and cable, 670, 872, and
  1,250 kg at 0.5, 1, and 2 km.

**Mason 2006** (NASA/TM-2006-214120):
- **The line:** a 5,000 Vac three-phase cable with copper conductors and Kapton
  insulation.
- **AC against DC:** high-voltage DC "was also considered and found to not
  significantly effect PMAD mass".

**Oleson et al. 2022** (NASA/TM-20220012395): AC is easier to implement with
available switching devices, and transformers boost and buck it.

## Calibration and cross-checks

- **Barth & Pike's AC cable, not fitted:**
  - **The optimum:** the model gives 3,027 Vrms line to neutral, against their
    3,000.
  - **The mass:** the AC line is 49% heavier than the DC one (109 against
    73 kg/km), as they find it heavier (benchmark
    `barth-pike-2022-cable-voltage`).
- **The fixed mass per km, refitted:**
  - **Mason's own 3 kVac, 40 kWe cable:** the model designs it at 143 kg/km,
    so the rest of the pallet's 385 kg/km growth is 243 kg/km.
  - **The benchmark** `mason-2025-fsp-separation` now models that cable:
    - its 1 km cable is 385 kg, the pallet's slope
    - its shield-plus-cable optimum is still 1.87 km, against Mason's 1.8 km
- **Mason 2001's marginal masses hold without recalibration:** the fixed mass
  per km does not change with power. The model lands 2.53 t lighter at 100 and
  500 kWe (2.46 t in v0.27).

## Numbers that moved

1 t/day product, default inputs (1 km, surface, DC) except as named.

| Case | v0.27 | **v0.28 DC** | v0.28 AC |
|---|---|---|---|
| Equatorial MRE: cable | 795 kg, 8 kV | **726 kg, 8 kV** | 1,110 kg, 4.9 kVrms |
| Equatorial MRE: landed | 50.42 t | **50.35 t** | 50.74 t |
| Equatorial MRE: best separation | ~1.75 km, 49.76 t | **~1.8 km, 49.64 t** | ~1.55 km, 50.28 t |
| MRE, 10 t/day: cable | 3,732 kg | **3,663 kg** | 6,817 kg |
| MRE, 10 t/day: landed | 452.7 t | **452.65 t** | 455.8 t |
| Polar ice: landed | 22.05 t | **21.98 t** | 22.11 t |
| Polar ice: best separation | ~2 km, 21.48 t | **~2.05 km, 21.34 t** | ~1.85 km, 21.60 t |
| Buried at 100 m, default | 50.16 t | **50.15 t** | |

What the table shows:
- **The default DC plant is 69 kg lighter.** Its 1 km cable keeps only the
  fixed mass Mason's own AC cable leaves over.
- **Its best separation is now Mason's 1.8 km.**
- **AC costs the default plant 0.38 t and a 10 t/day plant 3.2 t.**
  - **Why:** both lines are held to the same peak voltage to ground, so AC runs
    at 0.61 of the DC voltage and needs twice the conductor.
  - **The cost of AC's easier conversion,** which the model does not credit.
- **AC's lightest separation is shorter:** 1.55 km for the default plant,
  since its cable is heavier.
- **Burial against the surface does not change:** a surface reactor at its best
  separation still beats a buried one up to 1 t/day.
- **The solar/nuclear crossover** moves from 2.14 to 2.05 kW at the equator and
  from 4.67 to 4.48 kW at the pole: a small plant's cable carries less fixed
  mass.

Regression anchors moved deliberately, each marked "v0.28":
- **The fixed-seed uncertainty anchor:** 50.346 → 50.278 days.
- **The landed-mass and fission anchors** from v0.4 through v0.27, including the
  default landed mass, 50.42 → 50.35 t.
- **New v0.28 anchors in both suites:**
  - the AC line's voltage and mass
  - the AC line's equal loss and insulation thickness
  - the 10 t/day AC plant
  - an unsupported form resetting to DC

Golden vectors were regenerated:
- the Latin hypercube runs one sample in five as AC
- a named AC scenario brings the parity set to 221 vectors

## In the app

- **Rail:** the power group gains a TRANSMISSION select (bipolar DC or
  three-phase AC) beside the converter and siting.
- **Evidence:**
  - The cable form cites Barth & Pike and Mason.
  - The voltage cap explains its peak-to-ground reading.
  - The cable's fixed mass names Mason's 3 kVac cable.
  - The separation and siting evidence give the v0.28 optima.
- **Power panel:** the CABLE line names the form.
- **Links:** `cableForm=ac` round-trips through a link.

Screenshot: [the transmission select under AC, with the power panel's CABLE line](screenshots/ac-transmission/ac-transmission.png)

## Verification

- **Regression (v0.28):** in both suites.
- **Benchmarks:**
  - `barth-pike-2022-cable-voltage` adds the AC optimum and the AC line's extra
    mass.
  - `mason-2025-fsp-separation` models Mason's 3 kVac cable.
  - `mason-2001-*` still check the marginal masses.
- **App:** `fission-converter.test.tsx` covers the select, the link, and a
  switch from the rail.
- **Parity:** 221 golden vectors.
- **Size budget:** the engine is 231,488 B, within 240 KiB.

## Left for later

- **The converters at each end.**
  - **The trade:** AC's transformers against DC's high-voltage switching
    converters.
  - **What the model does:** both sit in the conversion and power management
    mass per kWe, unchanged with voltage or form; Mason 2006 found the form did
    not significantly change PMAD mass.
- **Skin effect.** At 1 kHz the skin depth in aluminium is 2.7 mm, against a
  megawatt AC conductor's 4.8 mm radius, so its resistance would rise by
  roughly a fifth, and its conductor with it.
- **Topography,** and **the buried reactor's excavation,** from v0.25 and v0.26.
  *(v0.29: topography reduced to a disclosed horizon check; see
  [`model-siting-horizon-v029.md`](model-siting-horizon-v029.md).)*
