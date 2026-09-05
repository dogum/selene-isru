# Equipment and lunar environment visual milestone

Baseline: `main` at `4f21849`. Implementation branch: `codex/visuals-3d-improvements`.

All 15 existing runtime equipment assets have been regenerated from their checked-in procedural Blender sources. This is an integrated rendering and asset-pipeline update, not a replacement simulation or a set of standalone showcase models. Engine equations, dimensions in the engineering catalog, equipment IDs, planner ports, connection topology, instance caps, and study formats are unchanged.

## Inspection and decisions

The pass began with the existing app, generator scripts, GLB loading and cloning, named-node animation bindings, Custom Site catalog/ports, camera bookmarks, terrain samplers, tier budgets, previous overhaul documents, and prior screenshots. Production baseline screenshots were captured before rebuilding or replacing the original assets. Blender 5.2 LTS ran headlessly for the authoring/export iterations; visual judgment used the actual production Three.js app, including its controls and overlays.

### Equipment

| Equipment | Changes and retained identity |
| --- | --- |
| Equatorial excavator | Correctly radial wheel grousers, suspension links, open bucket trough with cheek/back plates; articulated excavation equipment remains recognizable. |
| Hauler | Bed stiffeners, cabinet hardware, tire/metal separation; load anchor now stays at the intended bed position. |
| MRE reactor | Open feed hopper, tangent insulation/skirt panels, cleaner vessel highlights, reduced hidden cap geometry; feed gate, thermal band, gauge, tap and status nodes remain driven by existing state. |
| Casting yard | Downward-tapering hopper, open receiver collar, dark manufacturing frame; existing feed/casting animation retained. |
| Both cryogenic farms | Branch pipes and flanges visibly connect vessels to headers, insulation reads as nonmetal, valve hardware is clearer; independent tank/fill groups remain intact. |
| Equatorial power hub | Solar buslines/rims and segmented radiator faces, subdued PV and contrasting thermal surfaces; solar/nuclear visibility groups preserved. |
| Landing system | Open, downward-facing nozzle bells and leg braces; original envelope and landing role retained. |
| Both habitats | Support structure, cabinet/airlock detailing, muted glazing, polar access steps; shielding state and pressure-shell proportions retained. |
| Polar excavator | Consistent mechanical materials, weighted normals and corrected cutter joint; original low-poly track geometry retained within budget. |
| Sublimation camp | Curved ribs correctly follow all three tent shells, header branches and valve wheels; no change to sublimation physics. |
| Receiver/Sabatier | Process risers, cabinet hardware and mechanically aligned valves; existing architecture and Sabatier controls retained. |
| Polar rim towers | Segmented PV surfaces, correct tracker attachment positions and metal response; original lattice structure retained. |
| Polar nuclear station | Ceramic radiator tiles/channels and manufacturing hardware, neutral thermal shell; existing radiator sizing and architecture behavior retained. |

Thermal whites and concrete-like foundations are nonmetallic; load-bearing frames are neutral metal; orange remains the engineering accent. Small details are geometry-only and selectively applied where they survive the inspection camera distance. No image textures, HDRIs, external meshes, dependencies, or extra runtime model downloads were introduced.

### A real rigging defect, not just cosmetic work

The original generators read `matrix_world` immediately after changing object locations, before Blender evaluated the scene. Empty control pivots consequently collapsed to the asset origin. Calling `view_layer.update()` before preserving world transforms fixes those mounts without moving the resting equipment geometry. Each control records its intended Blender-space world location in `selene_bind_world_m`; the audit checks the converted glTF position, parent, name and rotation/scale basis. Front-facing MRE and polar valve/gauge rotations now use their actual Z axes. This deliberately corrects pivot translations rather than preserving erroneous identity transforms.

### Terrain, materials, light and camera

- Corrected generated tangent normal maps from `(slopeX, 2, slopeY)` to `(slopeX, slopeY, 2)`, and encoded generated albedo pixels to sRGB before tagging their textures. These address rendering errors, not merely taste. Three.js distinguishes color textures from linear non-color maps in its [color management guidance](https://threejs.org/manual/en/color-management.html).
- Removed a regular diagonal sparkle pattern from the regolith texture. Added restrained broad geology variation and seeded shallow impact bowls/rims using the same deterministic height sampler as terrain placement.
- Rocks and rover tread marks sample the terrain rather than floating on one plane; rocks exclude facility grades. Treads follow local slope. Crater strata use broken surface-following ribbons instead of floating perfect torus rings.
- Terrain now casts shadows as well as receiving them, so the polar crater wall occludes sunlight on its floor. Lowered polar emissive fill, reduced ambient washout, used near-neutral sunlight, a black upper environment and a neutral ground reflection proxy. The Moon has only a tenuous exosphere, and south-pole terrain produces long shadows: [NASA lunar environment](https://science.nasa.gov/moon/weather-on-the-moon/), [NASA south-pole shadows](https://science.nasa.gov/resource/shadows-near-the-moons-south-pole/).
- Reduced AO radius/thickness to avoid oversized dirty halos and tuned shadow bias to limit detached shadows. Friendly lighting remains the readable default; the darker mode remains available.
- Widened both site overview cameras. Focus framing uses currently visible equipment bounds, including actual rover positions, and reserves screen space for the inspector. Hidden alternative equipment no longer distorts framing. Custom Site's planner camera behavior is unchanged.
- Renderer counters now accumulate scene, shadow and post passes for the whole frame. Older HUD counts that showed only the last postprocess quad are **not comparable** to these new values.

## Export and performance

Editable `.blend` files are saved **before** static batching. Runtime export combines only leaf meshes sharing a material and a direct rig parent. Original mesh names survive as transform anchors; nodes with children and animated `FillColumn` meshes are excluded. Batches never cross tracker, tank, radiator, shielding or mechanism parents. Unused material slots are removed; GLBs retain meshopt compression.

| Metric, all 15 GLBs | Before | After | Change |
| --- | ---: | ---: | ---: |
| Bytes | 4,810,688 | 4,235,492 | −12.0% |
| Triangles | 254,232 | 249,996 | −1.7% |
| Render primitives | 1,040 | 432 | −58.5% |

These are exported full-library counts, not visible frame counts or claims of equivalent FPS gains. Shared scene geometry, particles, shadows, AO and bloom also cost time. All existing instance caps are preserved.

| GLB | Before bytes | After bytes | After triangles | After primitives |
| --- | ---: | ---: | ---: | ---: |
| casting-yard | 129,828 | 130,188 | 6,568 | 13 |
| cryogenic-farm | 533,936 | 521,776 | 35,980 | 65 |
| excavator | 376,792 | 240,868 | 13,132 | 12 |
| habitat | 216,180 | 176,388 | 10,072 | 18 |
| hauler | 337,964 | 206,784 | 11,284 | 10 |
| landing-system | 193,012 | 194,020 | 12,528 | 12 |
| mre-reactor | 742,784 | 593,472 | 41,352 | 17 |
| polar-cryogenic-farm | 469,496 | 459,016 | 29,080 | 62 |
| polar-excavator | 233,284 | 144,268 | 7,524 | 10 |
| polar-habitat | 151,256 | 148,928 | 8,208 | 18 |
| polar-nuclear-station | 198,660 | 177,804 | 9,920 | 17 |
| polar-power-towers | 444,308 | 398,532 | 23,404 | 36 |
| power-hub | 355,396 | 375,980 | 16,856 | 83 |
| receiver-plant | 174,084 | 189,388 | 10,548 | 25 |
| sublimation-camp | 253,708 | 278,080 | 13,540 | 34 |

The [before](performance/visual-assets-before.json) and [after](performance/visual-assets-after.json) audit records include meter-space bounds, hierarchy and control positions. Automated ceilings are per-asset +30% bytes, +35% triangles and at most 0.25 m change on each bounding-box face. The latter permits small access/service details, not arbitrary equipment rescaling. These are regression guards against the baseline, not independent CAD certification.

## Visual evidence and validation

The [before](screenshots/visual-milestone/before/) and [after](screenshots/visual-milestone/after/) folders contain both overviews and all 15 asset inspection views at 1440×1000, DPR 1, high tier, readable lighting and locked daylight. The scenarios/settings match; camera composition intentionally changes and animated phases are not pixel-locked. Intermediate inspection caught misplaced tent ribs, broken pivots, floating strata, normal/color encoding errors and inspector clipping; these were corrected before final capture.

| View | Before | After |
| --- | --- | --- |
| Equatorial overview | [PNG](screenshots/visual-milestone/before/equatorial-overview.png) | [PNG](screenshots/visual-milestone/after/equatorial-overview.png) |
| MRE | [PNG](screenshots/visual-milestone/before/equatorial-2-mre-reactor.png) | [PNG](screenshots/visual-milestone/after/equatorial-2-mre-reactor.png) |
| Polar overview | [PNG](screenshots/visual-milestone/before/polar-overview.png) | [PNG](screenshots/visual-milestone/after/polar-overview.png) |
| Sublimation camp | [PNG](screenshots/visual-milestone/before/polar-1-sublimation-camp.png) | [PNG](screenshots/visual-milestone/after/polar-1-sublimation-camp.png) |

Validation commands (Node 22 reference toolchain, Blender 5.2 LTS):

```sh
pnpm asset:equatorial
pnpm asset:polar
pnpm asset:mre
pnpm asset:audit
pnpm run ci
node scripts/capture-visual-milestone.mjs after
node scripts/check-visual-variants.mjs
pnpm evidence:custom
git diff --check
```

CI covers 22 Python tests, golden-output verification, generated-constant verification, 278 engine tests, 119 app tests, TypeScript checking, engine/app production builds and Ruff. New tests cover exported asset contracts, tangent normals, color-space handling, terrain/placement consistency and shadows. The full suite passed; app tests and production build were rerun after the final tread spacing adjustment.

The [variant captures](screenshots/visual-milestone/variants/) additionally verify equatorial solar, polar solar with active Sabatier, all four graphics tiers across the captures, 390×844 mobile views, and dark photo mode with its exit control. Both capture scripts completed without browser console errors. These are rendering/interaction smoke checks, not exhaustive tests of every parameter combination.

Custom Site release evidence is in [its performance record](performance/custom-site-release.json), [screenshots](screenshots/custom-site/) and [short video](media/custom-site-sandbox-demo.mp4). It exercises blank planning, placement, explicit reference import, the eight-asset/eight-connection topology, Planner/Explore switching, study persistence, download and mobile review. Headless timing is a smoke measurement, not a claim about real mobile or discrete-GPU performance. See the recorded browser, renderer and timing values rather than comparing against unrelated historical machines.

## Remaining limitations

- Equipment remains a meter-scaled engineering illustration, not fabrication CAD or a pressure-vessel/thermal/structural validation. Existing nominal planner footprints and animated tool reach are not identical physical envelopes.
- Planner ports and displayed flow arcs are semantic, footprint-relative connection markers. This pass adds plausible local plumbing but does not silently reinterpret the graph as a fully routed piping design.
- Terrain is deterministic procedural geology, not a surveyed lunar DEM. Earth, stars, glow, flow particles, beamed-power graphics and friendly fill are presentation aids; visible stars and beams are not exposure-accurate lunar photography or vacuum-scattering predictions.
- Finite real-time shadow-map resolution still produces occasional bands/faceting at close range. Tiny details are deliberately omitted and no new LOD system was added. Wider site framing cannot make every machine legible simultaneously on a phone.
- The existing Custom Site smoke script does not inject a forced WebGL context loss. Automated tests and production browser smoke checks do not replace a real-device cross-browser/GPU matrix.
