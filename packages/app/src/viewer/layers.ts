import type * as THREE from "three";

/** Dedicated camera/object layer for emissive-only bloom rendering. */
export const BLOOM_LAYER = 1;

export function enableBloom(root: THREE.Object3D): void {
  root.traverse((obj) => {
    obj.layers.enable(BLOOM_LAYER);
  });
}
