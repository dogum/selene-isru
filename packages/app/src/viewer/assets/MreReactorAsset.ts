import * as THREE from "three";
import type { SimParams, SimResult } from "@selene-isru/engine";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import reactorUrl from "../../assets/models/mre-reactor.glb?url";
import { disposeObject } from "../dioramas/shared";
import { enableBloom } from "../layers";

/** Runtime wrapper around the reproducibly generated MRE GLB. */
export class MreReactorAsset {
  readonly group = new THREE.Group();

  private feedGate: THREE.Object3D | null = null;
  private tapValve: THREE.Object3D | null = null;
  private gaugeNeedle: THREE.Object3D | null = null;
  private thermalMaterials: THREE.MeshStandardMaterial[] = [];
  private statusMaterials: THREE.MeshStandardMaterial[] = [];
  private activity = 0.25;
  private thermalLoad = 0.4;
  private glow = 0.4;
  private loaded = false;
  private disposed = false;

  constructor(onReady: () => void) {
    this.group.name = "Equatorial MRE reactor and service foundation";
    this.group.userData.assetKey = "reactor";

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      reactorUrl,
      (gltf) => {
        const scene = gltf.scene;
        if (this.disposed) {
          disposeObject(scene);
          return;
        }
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
              if (material instanceof THREE.MeshStandardMaterial) {
                material.envMapIntensity = Math.max(material.envMapIntensity, 0.52);
                if (material.name === "MRE_HotMelt") {
                  this.thermalMaterials.push(material);
                  enableBloom(mesh);
                } else if (material.name === "MRE_StatusLight") {
                  this.statusMaterials.push(material);
                  enableBloom(mesh);
                }
              }
            }
          }
        });
        this.feedGate = scene.getObjectByName("MRE_FeedGate") ?? null;
        this.tapValve = scene.getObjectByName("MRE_TapValve") ?? null;
        this.gaugeNeedle = scene.getObjectByName("MRE_GaugeNeedle") ?? null;
        this.group.add(scene);
        this.loaded = true;
        this.updateState(0);
        onReady();
      },
      undefined,
      (error) => {
        if (this.disposed) {
          return;
        }
        console.error("[selene] failed to load the MRE reactor asset", error);
        this.group.userData.assetLoadError = true;
        onReady();
      }
    );
  }

  apply(result: SimResult, params: SimParams, glow: number): void {
    this.activity = THREE.MathUtils.clamp(result.electrolysis.currentA / 600_000, 0.08, 1);
    this.thermalLoad = THREE.MathUtils.clamp((params.Tmelt - 1_400) / 900, 0, 1);
    this.glow = glow;
    if (this.loaded) {
      this.updateState(0);
    }
  }

  tick(t: number, reduced: boolean): boolean {
    if (!this.loaded) {
      return false;
    }
    this.updateState(reduced ? 0 : t);
    return !reduced;
  }

  dispose(): void {
    this.disposed = true;
  }

  private updateState(t: number): void {
    const pulse = t > 0 ? 0.9 + Math.sin(t * Math.PI) * 0.1 : 1;
    const gateOpen = 0.08 + this.activity * 0.72;
    const valveOpen = 0.2 + this.activity * 0.8;
    const gauge = -0.75 + this.activity * 1.5;

    if (this.feedGate !== null) {
      this.feedGate.rotation.y = gateOpen * 0.46;
    }
    if (this.tapValve !== null) {
      this.tapValve.rotation.y = valveOpen * Math.PI * 1.5 + (t > 0 ? Math.sin(t * 0.7) * 0.04 : 0);
    }
    if (this.gaugeNeedle !== null) {
      this.gaugeNeedle.rotation.y = gauge;
    }
    for (const material of this.thermalMaterials) {
      material.emissiveIntensity = (1.1 + this.thermalLoad * 2.6 + this.glow * 0.35) * pulse;
    }
    for (const material of this.statusMaterials) {
      material.emissiveIntensity = (1.4 + this.activity * 2.2) * (t > 0 ? 0.88 + Math.sin(t * 2.2) * 0.12 : 1);
    }
  }
}
