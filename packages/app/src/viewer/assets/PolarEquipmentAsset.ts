import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import polarCryogenicFarmUrl from "../../assets/models/polar-cryogenic-farm.glb?url";
import polarExcavatorUrl from "../../assets/models/polar-excavator.glb?url";
import polarHabitatUrl from "../../assets/models/polar-habitat.glb?url";
import polarNuclearStationUrl from "../../assets/models/polar-nuclear-station.glb?url";
import polarPowerTowersUrl from "../../assets/models/polar-power-towers.glb?url";
import receiverPlantUrl from "../../assets/models/receiver-plant.glb?url";
import sublimationCampUrl from "../../assets/models/sublimation-camp.glb?url";
import { disposeObject } from "../dioramas/shared";
import { enableBloom } from "../layers";

export type PolarEquipmentKey =
  | "excavator"
  | "tents"
  | "receiver"
  | "tanks"
  | "towers"
  | "station"
  | "habitat";

const URLS: Record<PolarEquipmentKey, string> = {
  excavator: polarExcavatorUrl,
  tents: sublimationCampUrl,
  receiver: receiverPlantUrl,
  tanks: polarCryogenicFarmUrl,
  towers: polarPowerTowersUrl,
  station: polarNuclearStationUrl,
  habitat: polarHabitatUrl
};

const LABELS: Record<PolarEquipmentKey, string> = {
  excavator: "Polar ice excavator PX-01",
  tents: "Sublimation field camp SUB-01",
  receiver: "Beam receiver and Sabatier plant BR-01",
  tanks: "Polar cryogenic farm PCR-01",
  towers: "Peaks-of-eternal-light power towers PT-01",
  station: "Polar nuclear station PN-01",
  habitat: "Polar surface habitat PHAB-01"
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Runtime wrapper for the reproducibly generated polar-equipment GLBs. */
export class PolarEquipmentAsset {
  readonly group = new THREE.Group();
  readonly key: PolarEquipmentKey;

  private scene: THREE.Group | null = null;
  private loaded = false;
  private disposed = false;

  constructor(key: PolarEquipmentKey, onReady: () => void) {
    this.key = key;
    this.group.name = LABELS[key];
    this.group.userData.assetKey = key;

    loader.load(
      URLS[key],
      (gltf) => {
        const scene = gltf.scene;
        if (this.disposed) {
          disposeObject(scene);
          return;
        }
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) {
            return;
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) {
              continue;
            }
            material.envMapIntensity = Math.max(material.envMapIntensity, 0.58);
            if (material.name.endsWith("_StatusLight") || material.name.endsWith("_WarmLight")) {
              enableBloom(mesh);
            }
          }
        });
        this.scene = scene;
        this.group.add(scene);
        this.loaded = true;
        onReady();
      },
      undefined,
      (error) => {
        if (this.disposed) {
          return;
        }
        console.error(`[selene] failed to load the polar ${key} asset`, error);
        this.group.userData.assetLoadError = true;
        onReady();
      }
    );
  }

  get ready(): boolean {
    return this.loaded;
  }

  node(name: string): THREE.Object3D | null {
    return this.scene?.getObjectByName(name) ?? null;
  }

  materials(name: string): THREE.MeshStandardMaterial[] {
    const found = new Set<THREE.MeshStandardMaterial>();
    this.scene?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial && material.name === name) {
          found.add(material);
        }
      }
    });
    return [...found];
  }

  dispose(): void {
    this.disposed = true;
  }
}
