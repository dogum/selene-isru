import {
  siteAssetDefinition,
  type SiteDesignDocument,
  type SiteDesignFindingSeverity,
  type SiteEnvironment
} from "@selene-isru/engine";
import * as THREE from "three";
import { CustomAssetModel } from "../assets/CustomAssetModel";
import type { QualityProfile } from "../bindings";
import {
  disposeObject,
  makeTerrain,
  makeTerrainHeightSampler,
  type TerrainOpts
} from "./shared";
import type { Diorama } from "./types";

interface RuntimeAsset {
  root: THREE.Group;
  model: CustomAssetModel;
  footprint: THREE.Mesh;
}

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
      color: environment === "polar" ? 0x8addf5 : 0xffa55b,
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

function footprintMesh(
  kind: string,
  color: number,
  opacity: number
): THREE.Mesh | null {
  const definition = siteAssetDefinition(kind);
  if (definition === null) {
    return null;
  }
  const geometry = new THREE.BoxGeometry(
    definition.footprint.widthM,
    0.12,
    definition.footprint.depthM
  );
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.08;
  mesh.renderOrder = 8;
  return mesh;
}

export class CustomSiteDiorama implements Diorama {
  readonly group = new THREE.Group();
  readonly assets: Record<string, THREE.Object3D> = {};

  private readonly terrain: THREE.Mesh;
  private readonly grid: THREE.Group;
  private readonly sampleTerrain: (x: number, z: number) => number;
  private readonly instances = new Map<string, RuntimeAsset>();
  private readonly onReady: () => void;
  private placementPreview: THREE.Group | null = null;
  private placementPreviewKind: string | null = null;

  constructor(
    environment: SiteEnvironment,
    quality: QualityProfile,
    onReady: () => void = () => undefined
  ) {
    this.onReady = onReady;
    const terrainOpts: TerrainOpts = {
      noiseAmp: environment === "polar" ? 0.72 : 0.5,
      noiseScale: environment === "polar" ? 0.012 : 0.01,
      segments: quality.terrainSegments
    };
    this.sampleTerrain = makeTerrainHeightSampler(terrainOpts);
    this.terrain = makeTerrain(terrainOpts);
    const material = this.terrain.material as THREE.MeshStandardMaterial;
    material.color.setHex(environment === "polar" ? 0x747b82 : 0xb7afa4);
    material.emissive.setHex(environment === "polar" ? 0x18222a : 0x0d0b09);
    material.emissiveIntensity = environment === "polar" ? 0.42 : 0.08;
    this.grid = planningGrid(environment);
    this.group.add(this.terrain, this.grid);
  }

  syncDesign(design: SiteDesignDocument, selectedAssetId: string | null): void {
    const ids = new Set(design.assets.map((asset) => asset.id));
    for (const [id, runtime] of this.instances) {
      if (ids.has(id)) {
        continue;
      }
      this.group.remove(runtime.root);
      runtime.model.dispose();
      disposeObject(runtime.footprint);
      delete this.assets[id];
      this.instances.delete(id);
    }

    for (const asset of design.assets) {
      let runtime = this.instances.get(asset.id);
      if (runtime === undefined) {
        const root = new THREE.Group();
        root.name = asset.name;
        root.userData.assetId = asset.id;
        root.userData.assetKey = asset.id;
        const footprint = footprintMesh(asset.kind, 0x74d8ff, 0.12);
        if (footprint === null) {
          continue;
        }
        footprint.userData.assetId = asset.id;
        const model = new CustomAssetModel(asset.kind, this.onReady);
        model.group.userData.assetId = asset.id;
        root.add(footprint, model.group);
        runtime = { root, model, footprint };
        this.instances.set(asset.id, runtime);
        this.assets[asset.id] = root;
        this.group.add(root);
      }
      runtime.root.name = asset.name;
      runtime.root.position.set(
        asset.transform.xM,
        this.sampleTerrain(asset.transform.xM, asset.transform.zM) + 0.045,
        asset.transform.zM
      );
      runtime.root.rotation.y = THREE.MathUtils.degToRad(-asset.transform.headingDeg);
      runtime.model.setEnabled(asset.enabled);
      const footprintMaterial = runtime.footprint.material as THREE.MeshBasicMaterial;
      footprintMaterial.color.setHex(asset.enabled ? 0x74d8ff : 0x7a808b);
      footprintMaterial.opacity = selectedAssetId === asset.id ? 0.34 : 0.1;
    }
    this.onReady();
  }

  surfacePoint(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    return raycaster.intersectObject(this.terrain, false)[0]?.point.clone() ?? null;
  }

  pickAsset(raycaster: THREE.Raycaster): string | null {
    const roots = [...this.instances.values()].map((runtime) => runtime.root);
    const hit = raycaster.intersectObjects(roots, true)[0]?.object ?? null;
    let current: THREE.Object3D | null = hit;
    while (current !== null) {
      if (typeof current.userData.assetId === "string") {
        return current.userData.assetId;
      }
      current = current.parent;
    }
    return null;
  }

  previewAssetTransform(assetId: string, point: THREE.Vector3): void {
    const runtime = this.instances.get(assetId);
    if (runtime === undefined) {
      return;
    }
    runtime.root.position.set(
      point.x,
      this.sampleTerrain(point.x, point.z) + 0.045,
      point.z
    );
  }

  setPlacementPreview(
    kind: string,
    point: THREE.Vector3 | null,
    severity: SiteDesignFindingSeverity | "ok"
  ): void {
    if (point === null) {
      if (this.placementPreview !== null) {
        this.placementPreview.visible = false;
      }
      return;
    }
    if (this.placementPreview === null || this.placementPreviewKind !== kind) {
      this.clearPlacementPreview();
      const footprint = footprintMesh(kind, 0x4ade80, 0.34);
      if (footprint === null) {
        return;
      }
      const definition = siteAssetDefinition(kind);
      const height = Math.max(
        1,
        Math.min(
          5,
          Math.max(definition?.footprint.widthM ?? 2, definition?.footprint.depthM ?? 2) * 0.24
        )
      );
      const volume = new THREE.Mesh(
        new THREE.BoxGeometry(
          definition?.footprint.widthM ?? 2,
          height,
          definition?.footprint.depthM ?? 2
        ),
        new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          wireframe: true,
          transparent: true,
          opacity: 0.42,
          depthWrite: false
        })
      );
      volume.position.y = height / 2;
      this.placementPreview = new THREE.Group();
      this.placementPreview.add(footprint, volume);
      this.placementPreviewKind = kind;
      this.group.add(this.placementPreview);
    }
    const color = severity === "error"
      ? 0xff4d4d
      : severity === "caution" ? 0xffb347 : 0x4ade80;
    this.placementPreview.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      material?.color.setHex(color);
    });
    this.placementPreview.position.set(
      point.x,
      this.sampleTerrain(point.x, point.z) + 0.06,
      point.z
    );
    this.placementPreview.visible = true;
  }

  clearPlacementPreview(): void {
    if (this.placementPreview === null) {
      return;
    }
    this.group.remove(this.placementPreview);
    disposeObject(this.placementPreview);
    this.placementPreview = null;
    this.placementPreviewKind = null;
  }

  apply(): void {}

  applyTime(): void {}

  tick(): boolean {
    return false;
  }

  dispose(): void {
    this.clearPlacementPreview();
    for (const runtime of this.instances.values()) {
      runtime.model.dispose();
      disposeObject(runtime.footprint);
    }
    this.instances.clear();
    disposeObject(this.terrain);
    disposeObject(this.grid);
    this.group.clear();
  }
}
