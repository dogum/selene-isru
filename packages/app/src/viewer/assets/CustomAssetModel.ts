import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import castingYardUrl from "../../assets/models/casting-yard.glb?url";
import cryogenicFarmUrl from "../../assets/models/cryogenic-farm.glb?url";
import excavatorUrl from "../../assets/models/excavator.glb?url";
import habitatUrl from "../../assets/models/habitat.glb?url";
import haulerUrl from "../../assets/models/hauler.glb?url";
import landingSystemUrl from "../../assets/models/landing-system.glb?url";
import mreReactorUrl from "../../assets/models/mre-reactor.glb?url";
import polarCryogenicFarmUrl from "../../assets/models/polar-cryogenic-farm.glb?url";
import polarExcavatorUrl from "../../assets/models/polar-excavator.glb?url";
import polarHabitatUrl from "../../assets/models/polar-habitat.glb?url";
import polarNuclearStationUrl from "../../assets/models/polar-nuclear-station.glb?url";
import polarPowerTowersUrl from "../../assets/models/polar-power-towers.glb?url";
import powerHubUrl from "../../assets/models/power-hub.glb?url";
import receiverPlantUrl from "../../assets/models/receiver-plant.glb?url";
import sublimationCampUrl from "../../assets/models/sublimation-camp.glb?url";
import { enableBloom } from "../layers";

const URLS: Record<string, string> = {
  "equatorial.excavator": excavatorUrl,
  "equatorial.hauler": haulerUrl,
  "equatorial.mre-reactor": mreReactorUrl,
  "equatorial.casting-yard": castingYardUrl,
  "equatorial.cryo-farm": cryogenicFarmUrl,
  "equatorial.power-hub": powerHubUrl,
  "equatorial.landing-system": landingSystemUrl,
  "equatorial.habitat": habitatUrl,
  "polar.ice-excavator": polarExcavatorUrl,
  "polar.sublimation-camp": sublimationCampUrl,
  "polar.receiver-plant": receiverPlantUrl,
  "polar.cryo-farm": polarCryogenicFarmUrl,
  "polar.power-towers": polarPowerTowersUrl,
  "polar.nuclear-station": polarNuclearStationUrl,
  "polar.habitat": polarHabitatUrl
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const templates = new Map<string, Promise<THREE.Group | null>>();

function templateFor(kind: string): Promise<THREE.Group | null> {
  const existing = templates.get(kind);
  if (existing !== undefined) {
    return existing;
  }
  const url = URLS[kind];
  if (url === undefined) {
    return Promise.resolve(null);
  }
  const pending = loader.loadAsync(url)
    .then((gltf) => {
      const scene = gltf.scene;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.envMapIntensity = Math.max(material.envMapIntensity, 0.55);
            if (
              material.name.endsWith("_StatusLight") ||
              material.name.endsWith("_WarmLight") ||
              material.name === "MRE_HotMelt"
            ) {
              enableBloom(mesh);
            }
          }
        }
      });
      return scene;
    })
    .catch((error: unknown) => {
      console.error(`[selene] failed to load custom asset ${kind}`, error);
      return null;
    });
  templates.set(kind, pending);
  return pending;
}

/** A light instance wrapper over one cached GLB template per catalog kind. */
export class CustomAssetModel {
  readonly group = new THREE.Group();

  private materials: THREE.Material[] = [];
  private disposed = false;
  private enabled = true;

  constructor(kind: string, onReady: () => void) {
    void templateFor(kind).then((template) => {
      if (this.disposed || template === null) {
        onReady();
        return;
      }
      const scene = cloneSkeleton(template) as THREE.Group;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((material) => material.clone());
          this.materials.push(...mesh.material);
        } else {
          mesh.material = mesh.material.clone();
          this.materials.push(mesh.material);
        }
      });
      this.group.add(scene);
      this.applyEnabled();
      onReady();
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyEnabled();
  }

  dispose(): void {
    this.disposed = true;
    for (const material of this.materials) {
      material.dispose();
    }
    this.materials = [];
    this.group.clear();
  }

  private applyEnabled(): void {
    for (const material of this.materials) {
      material.transparent = !this.enabled;
      material.opacity = this.enabled ? 1 : 0.28;
      material.depthWrite = this.enabled;
      material.needsUpdate = true;
    }
  }
}
