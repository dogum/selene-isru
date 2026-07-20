import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import castingYardUrl from "../../assets/models/casting-yard.glb?url";
import cryogenicFarmUrl from "../../assets/models/cryogenic-farm.glb?url";
import excavatorUrl from "../../assets/models/excavator.glb?url";
import habitatUrl from "../../assets/models/habitat.glb?url";
import haulerUrl from "../../assets/models/hauler.glb?url";
import landingSystemUrl from "../../assets/models/landing-system.glb?url";
import powerHubUrl from "../../assets/models/power-hub.glb?url";
import { disposeObject } from "../dioramas/shared";
import { enableBloom } from "../layers";

export type EquatorialEquipmentKey =
  | "excavator"
  | "hauler"
  | "castingYard"
  | "tanks"
  | "station"
  | "pad"
  | "habitat";

const URLS: Record<EquatorialEquipmentKey, string> = {
  excavator: excavatorUrl,
  hauler: haulerUrl,
  castingYard: castingYardUrl,
  tanks: cryogenicFarmUrl,
  station: powerHubUrl,
  pad: landingSystemUrl,
  habitat: habitatUrl
};

const LABELS: Record<EquatorialEquipmentKey, string> = {
  excavator: "Excavation rover EX-01",
  hauler: "Regolith hauler HV-01",
  castingYard: "Slag casting yard CY-01",
  tanks: "Cryogenic storage farm CR-01",
  station: "Hybrid power hub PW-01",
  pad: "Landing system LP-01",
  habitat: "Shielded habitat HAB-01"
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Shared runtime wrapper for the reproducibly generated equatorial GLBs. */
export class EquatorialEquipmentAsset {
  readonly group = new THREE.Group();
  readonly key: EquatorialEquipmentKey;

  private scene: THREE.Group | null = null;
  private loaded = false;
  private disposed = false;

  constructor(key: EquatorialEquipmentKey, onReady: () => void) {
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
            material.envMapIntensity = Math.max(material.envMapIntensity, 0.55);
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
        console.error(`[selene] failed to load the ${key} asset`, error);
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

  nodes(prefix: string): THREE.Object3D[] {
    const found: THREE.Object3D[] = [];
    this.scene?.traverse((object) => {
      if (object.name.startsWith(prefix)) {
        found.push(object);
      }
    });
    return found;
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
