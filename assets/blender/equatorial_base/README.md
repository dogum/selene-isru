# Equatorial base equipment library

This directory contains the reproducible Blender/Python source for the second SELENE visual-fidelity pass. It generates seven original assets:

- excavation rover
- regolith hauler
- casting yard
- cryogenic tank farm
- solar/nuclear power hub
- landing system
- shielded habitat

Rebuild everything from the repository root with:

```sh
pnpm asset:equatorial
```

The script saves an editable `.blend` beside each asset and exports a meshopt-compressed GLB to `packages/app/src/assets/models/`. Named pivots, tank groups, solar trackers, radiator wings, shield sections, status materials, and service mechanisms are part of the generated scene graph so Three.js can connect them to live simulator state.

All geometry and materials are original, generated entirely from Blender primitives, and released under CC0-1.0. No external textures, meshes, fonts, or paid tools are required.
