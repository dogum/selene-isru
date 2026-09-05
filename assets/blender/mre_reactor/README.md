# MRE reactor asset

This directory is the editable source for the equatorial molten-regolith-electrolysis reactor vertical slice.

The asset is generated entirely from Blender primitives and procedural Principled BSDF materials. It has no external mesh, texture, font, or paid-asset dependency.

Regenerate both the checked-in Blender source and optimized web GLB from the repository root:

```sh
pnpm asset:mre
```

Outputs:

- `assets/blender/mre_reactor/mre_reactor.blend` — editable Blender source.
- `packages/app/src/assets/models/mre-reactor.glb` — meshopt-compressed runtime asset.

Blender 5.2 LTS is the reference exporter. Scene units are meters, transforms are applied during export, custom properties are retained, and the named `MRE_FeedGate`, `MRE_TapValve`, `MRE_GaugeNeedle`, `MRE_ThermalBand`, and `MRE_StatusBeacon` nodes are runtime control points.

The runtime asset contains 41,352 triangles in 17 render primitives and occupies 593,472 bytes. The editable source retains separate manufactured parts; export-only batching in `../refine_equipment.py` preserves named control anchors. Run `pnpm asset:audit` to validate the exported bounds, hierarchy, authored pivot positions, and budgets. See [the visual milestone report](../../../docs/visual-milestone.md).
