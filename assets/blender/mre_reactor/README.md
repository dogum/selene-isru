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

The current generated asset contains 119 mesh objects, 22,114 vertices, and 43,780 triangles. Blender's bundled meshopt exporter reduces the web asset from 1,410,072 bytes to 742,784 bytes.
