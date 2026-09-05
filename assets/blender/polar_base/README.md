# Polar equipment source

This directory contains the reproducible source for the polar-site equipment
overhaul. The assets are original, use only Blender primitives and generated
materials, and are released under CC0-1.0.

Regenerate the editable `.blend` files, optimized GLBs, and metrics from the
repository root with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python assets/blender/polar_base/generate_polar_base.py
```

The runtime GLBs are written to `packages/app/src/assets/models/`. Named roots,
pivots, status materials, tank fill columns, trackers, and radiator groups form
the stable contract used by the Three.js simulator bindings.

The shared `../refine_equipment.py` pass adds manufacturing details, consistent materials, split normals, and export-only static batching after saving the editable source. Blender 5.2 LTS is the reference exporter. Run `pnpm asset:audit` after regeneration to check runtime budgets, meter-scale bounds, hierarchy, and authored joint positions. See [the visual milestone report](../../../docs/visual-milestone.md) for measured results and limitations.
