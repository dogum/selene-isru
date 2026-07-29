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
  "polar.receiver-sabatier": receiverPlantUrl,
  "polar.cryo-farm": polarCryogenicFarmUrl,
  "polar.power-towers": polarPowerTowersUrl,
  "polar.nuclear-station": polarNuclearStationUrl,
  "polar.habitat": polarHabitatUrl
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const templates = new Map<string, Promise<THREE.Group | null>>();

export type CustomAssetRenderStatus =
  | "loading"
  | "loaded"
  | "fallback"
  | "simplified";

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

function placeholderModel(): {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
} {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const baseGeometry = new THREE.BoxGeometry(4.2, 1.8, 3.2);
  const baseMaterial = new THREE.MeshBasicMaterial({
    color: 0x74d8ff,
    wireframe: true,
    transparent: true,
    opacity: 0.72
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = 0.95;
  const mastGeometry = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8);
  const mastMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.62
  });
  const mast = new THREE.Mesh(mastGeometry, mastMaterial);
  mast.position.y = 2.8;
  const beaconGeometry = new THREE.OctahedronGeometry(0.42, 0);
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb347,
    wireframe: true,
    transparent: true,
    opacity: 0.9
  });
  const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
  beacon.position.y = 4.1;
  group.add(base, mast, beacon);
  geometries.push(baseGeometry, mastGeometry, beaconGeometry);
  materials.push(baseMaterial, mastMaterial, beaconMaterial);
  return { group, geometries, materials };
}

/** A cached GLB instance with a selectable low-poly fallback at every stage. */
export class CustomAssetModel {
  readonly group = new THREE.Group();

  private materials: THREE.Material[] = [];
  private placeholderGeometries: THREE.BufferGeometry[] = [];
  private placeholderMaterials: THREE.Material[] = [];
  private placeholder: THREE.Group | null = null;
  private status: CustomAssetRenderStatus;
  private disposed = false;
  private enabled = true;

  constructor(
    kind: string,
    onReady: () => void,
    loadDetailed = true
  ) {
    const placeholder = placeholderModel();
    this.placeholder = placeholder.group;
    this.placeholderGeometries = placeholder.geometries;
    this.placeholderMaterials = placeholder.materials;
    this.status = loadDetailed ? "loading" : "simplified";
    this.group.userData.assetRenderStatus = this.status;
    this.group.add(placeholder.group);
    if (!loadDetailed) {
      this.applyEnabled();
      onReady();
      return;
    }
    void templateFor(kind).then((template) => {
      if (this.disposed) {
        return;
      }
      if (template === null) {
        this.setStatus("fallback");
        this.applyEnabled();
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
      this.removePlaceholder();
      this.group.add(scene);
      this.setStatus("loaded");
      this.applyEnabled();
      onReady();
    });
  }

  get renderStatus(): CustomAssetRenderStatus {
    return this.status;
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
    this.removePlaceholder();
    this.materials = [];
    this.group.clear();
  }

  private applyEnabled(): void {
    for (const material of [...this.materials, ...this.placeholderMaterials]) {
      material.transparent = !this.enabled;
      material.opacity = this.enabled ? 1 : 0.28;
      material.depthWrite = this.enabled;
      material.needsUpdate = true;
    }
  }

  private setStatus(status: CustomAssetRenderStatus): void {
    this.status = status;
    this.group.userData.assetRenderStatus = status;
  }

  private removePlaceholder(): void {
    if (this.placeholder === null) {
      return;
    }
    this.group.remove(this.placeholder);
    for (const geometry of this.placeholderGeometries) {
      geometry.dispose();
    }
    for (const material of this.placeholderMaterials) {
      material.dispose();
    }
    this.placeholderGeometries = [];
    this.placeholderMaterials = [];
    this.placeholder = null;
  }
}
