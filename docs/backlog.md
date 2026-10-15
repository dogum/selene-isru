# Backlog

Open items gathered from every "left for later" and "remaining" section in the
audit trail ([`model-audit-v02.md`](model-audit-v02.md) through
[`model-size-to-demand-v016.md`](model-size-to-demand-v016.md)), plus the
visual and Custom Site notes. Each item names the doc it came from. When an item
ships, delete it here and annotate the source doc, as the audit trail already
does.

**How to work it:** one item (or one tight cluster) per branch and PR, in the
order below, under the Codex review cap in CLAUDE.md. Each model item follows
the usual chain: sourced constants, TS and Python together, golden vectors,
deliberate anchors, a `docs/model-*-vNNN.md` entry, and screenshots when the UI
changes.

Size: **S** a day or less, **M** a phase like v0.9, **L** more than one phase.
"Sourced" means a primary source is already in hand or named.

## Next up

| # | Item | Size | Source in hand | From |
|---|---|---|---|---|
| 1 | **Radiator area into fission mass.** Computed but not charged; `alphaSpecific` lumps it today. | S | needs a radiator areal-mass source | v0.4 |

## Model depth, larger

| Item | Size | From |
|---|---|---|
| Polar ridge-and-tanker architecture (NASA's: process on the lit ridge, haul water from the crater) beside today's beamed-power crater plant | L | v0.4, v0.6 |
| Phased start-up: production as each modular train lands, and on the first exposed face while stripping continues | M | v0.5, v0.15 |
| Lander reuse: delivery landers refuelled with ISRU propellant lower `M0leo` after the first landing | M | v0.5, v0.7 |
| Sizing for return or to fill the landings a plant needs, and a target that follows the demand live | S | v0.16 |
| Methalox landers fed by the Sabatier loop (own mixture ratio and Isp) | M | v0.7 |
| Propellant export to a depot, credited at an in-orbit gear ratio | M | v0.7 |
| Ilmenite grain size through a shrinking-core rate | M | v0.10 |
| Basalt grind size coupling liberation and fines lost | M | v0.11 |
| Haul energy: mining energy that grows with haul distance (split `eMining` into digging and driving) | S | v0.12 |
| Water electrolysis cell voltage from a polarization curve, trading stack mass against power | M | v0.14 |
| Ilmenite stage count as a design input (Eagle's single-stage case) | S | v0.10 |
| Reduction of TiO₂ and of FeO in other minerals | M | v0.8, v0.10 |
| Iron and tailings credit (iron product, bagged or bermed tailings as shielding) | M | v0.8 |
| Economy of scale in liquefaction and in the ilmenite bed and gas loop | M | v0.6, v0.10 |
| Time-varying spares (infant mortality, wear-out) and probabilistic losses | M | v0.5, v0.3 |
| Vehicle losses between sorties: boil-off, reserves, hover margins | S | v0.7 |
| A lunar carbon source for the Sabatier loop | M | v0.5 |

## Validation and data

| Item | From |
|---|---|
| MLI coefficient and unit pair benchmarked against heat-flux cases (open benchmark `mli-layer-density-units`) | v0.2, v0.3 |
| MRE polarization and transport calibrated against cell data | v0.2, v0.3 |
| Stream-specific tanks: pressure vessels, minimum sizes, redundancy | v0.3 |
| Polar purification and water cleanup, heterogeneous assay, transient bed heating | v0.3, v0.6 |
| Site-trace uncertainty and comparison of location and height alternatives | v0.3 |
| Wider runtime instrumentation of intermediate equations and thresholds | v0.3 |
| Digging icy regolith near saturation (parked: no data) | v0.9 |
| Sabatier block without CO₂ acquisition (today's default carries NASA's Mars CO₂ freezer) | v0.13 |
| Conditioning energy for water ice, liquid water, methane, and CO₂ calibrated against a cited source (today's values are uncited) | v0.4 |

## Visual and Custom Site

| Item | Note | From |
|---|---|---|
| A dedicated ilmenite scene: beneficiation plant, fluidized bed, electrolyzer | needs Blender, not in the cloud container | v0.8 |
| Ilmenite catalog kinds for Custom Site | after the scene | CLAUDE.md §5 |
| Automatic routing and layout optimization, detailed network solvers, terrain and site-profile map layers, construction scheduling and reliability | deliberately future-facing | Custom Site spec |
| Experimental mixed-environment equipment, user-authored equipment definitions, collaborative and cloud projects | deliberately future-facing | Custom Site spec |
| Close-range shadow banding; a real-device GPU and browser matrix | | visual milestone |
