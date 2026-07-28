import * as THREE from "three";
import type { SiteEnvironment } from "@selene-isru/engine";
import type { QualityProfile } from "../bindings";
import { disposeObject, makeTerrain } from "./shared";
import type { Diorama } from "./types";

function planningGrid(environment: SiteEnvironment): THREE.Group {
  const group = new THREE.Group();
  const grid = new THREE.GridHelper(
    200,
    40,
    environment === "polar" ? 0x6fb8d3 : 0xd19055,
    environment === "polar" ? 0x385866 : 0x57483c
  );
  grid.position.y = 0.18;
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of materials) {
    material.transparent = true;
    material.opacity = 0.38;
    material.depthWrite = false;
  }
  group.add(grid);

  const boundary = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 96 }, (_, index) => {
        const angle = (index / 96) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * 92, 0.24, Math.sin(angle) * 92);
      })
    ),
    new THREE.LineBasicMaterial({
      color: environment === "polar" ? 0x8addf5 : 0xffa55b,
      transparent: true,
      opacity: 0.64
    })
  );
  group.add(boundary);

  const crosshair = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3, 0.28, 0),
      new THREE.Vector3(3, 0.28, 0),
      new THREE.Vector3(0, 0.28, -3),
      new THREE.Vector3(0, 0.28, 3)
    ]),
    new THREE.LineBasicMaterial({
      color: environment === "polar" ? 0xb8ecff : 0xffbe83,
      transparent: true,
      opacity: 0.9
    })
  );
  group.add(crosshair);

  const north = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: environment === "polar" ? 0x8addf5 : 0xffa55b,
    transparent: true,
    opacity: 0.8
  });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 8), material);
  shaft.position.z = -4;
  const head = new THREE.Mesh(new THREE.ConeGeometry(1, 2.8, 3), material);
  head.rotation.x = -Math.PI / 2;
  head.position.z = -9.2;
  north.add(shaft, head);
  north.position.set(-88, 0.32, 88);
  group.add(north);

  return group;
}

export class CustomSiteDiorama implements Diorama {
  readonly group = new THREE.Group();
  readonly assets: Record<string, THREE.Object3D> = {};

  constructor(environment: SiteEnvironment, quality: QualityProfile) {
    const terrain = makeTerrain({
      noiseAmp: environment === "polar" ? 0.72 : 0.5,
      noiseScale: environment === "polar" ? 0.012 : 0.01,
      segments: quality.terrainSegments
    });
    const material = terrain.material as THREE.MeshStandardMaterial;
    material.color.setHex(environment === "polar" ? 0x747b82 : 0xb7afa4);
    material.emissive.setHex(environment === "polar" ? 0x18222a : 0x0d0b09);
    material.emissiveIntensity = environment === "polar" ? 0.42 : 0.08;
    this.group.add(terrain, planningGrid(environment));
  }

  apply(): void {}

  applyTime(): void {}

  tick(): boolean {
    return false;
  }

  dispose(): void {
    disposeObject(this.group);
  }
}
