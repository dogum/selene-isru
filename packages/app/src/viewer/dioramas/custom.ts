import {
  compatibleSitePortTargets,
  siteAssetDefinition,
  siteConnectionRoutePoints,
  validateSiteDesign,
  type SiteConnection,
  type SiteConnectionKind,
  type SiteDesignDocument,
  type SiteDesignEvaluation,
  type SiteDesignFindingSeverity,
  type SiteEnvironment,
  type SitePortDefinition,
  type SitePortRef
} from "@selene-isru/engine";
import * as THREE from "three";
import { CustomAssetModel } from "../assets/CustomAssetModel";
import {
  siteAlignmentGuides,
  siteLayoutSummary
} from "../../site-design/editor";
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
  clearance: THREE.Mesh;
  ports: THREE.Group;
}

interface RuntimeConnection {
  root: THREE.Group;
  line: THREE.Line;
  handles: THREE.Group;
}

export interface PickedRouteHandle {
  connectionId: string;
  routePointIndex: number;
}

const CONNECTION_COLORS: Record<SiteConnectionKind, number> = {
  material: 0x74d8ff,
  power: 0xffd166,
  construction: 0xff8a3d,
  logistics: 0xb8c0cc
};

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

function clearanceMesh(kind: string): THREE.Mesh | null {
  const definition = siteAssetDefinition(kind);
  if (definition === null) {
    return null;
  }
  const clearance = definition.footprint.clearanceM ?? 0;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      definition.footprint.widthM + clearance * 2,
      0.08,
      definition.footprint.depthM + clearance * 2
    ),
    new THREE.MeshBasicMaterial({
      color: 0x74d8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    })
  );
  mesh.position.y = 0.04;
  mesh.renderOrder = 7;
  return mesh;
}

function portColor(port: SitePortDefinition): number {
  return CONNECTION_COLORS[port.kind];
}

function portLocalPosition(
  definition: NonNullable<ReturnType<typeof siteAssetDefinition>>,
  port: SitePortDefinition
): THREE.Vector3 {
  const peers = definition.ports.filter((candidate) =>
    candidate.direction === port.direction
  );
  const index = Math.max(0, peers.findIndex((candidate) => candidate.id === port.id));
  const spacing = Math.min(2.4, definition.footprint.depthM / (peers.length + 1));
  const z = (index - (peers.length - 1) / 2) * spacing;
  if (port.direction === "input") {
    return new THREE.Vector3(-definition.footprint.widthM / 2 - 0.75, 0.58, z);
  }
  if (port.direction === "output") {
    return new THREE.Vector3(definition.footprint.widthM / 2 + 0.75, 0.58, z);
  }
  return new THREE.Vector3(0, 0.58, definition.footprint.depthM / 2 + 0.75);
}

function portRefKey(ref: SitePortRef): string {
  return `${ref.assetId}:${ref.portId}`;
}

export class CustomSiteDiorama implements Diorama {
  readonly group = new THREE.Group();
  readonly assets: Record<string, THREE.Object3D> = {};

  private readonly terrain: THREE.Mesh;
  private readonly grid: THREE.Group;
  private readonly sampleTerrain: (x: number, z: number) => number;
  private readonly instances = new Map<string, RuntimeAsset>();
  private readonly connections = new Map<string, RuntimeConnection>();
  private readonly planningAids = new THREE.Group();
  private readonly onReady: () => void;
  private plannerMode = true;
  private currentDesign: SiteDesignDocument | null = null;
  private connectionSource: SitePortRef | null = null;
  private selectedAssetIds: string[] = [];
  private compatiblePorts = new Set<string>();
  private placementPreview: THREE.Group | null = null;
  private placementPreviewKind: string | null = null;
  private connectionPreview: THREE.Line | null = null;

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
    this.group.add(this.terrain, this.grid, this.planningAids);
  }

  syncDesign(
    design: SiteDesignDocument,
    selectedAssetId: string | null,
    selectedConnectionId: string | null = null,
    evaluation: SiteDesignEvaluation | null = null,
    selectedAssetIds: readonly string[] = selectedAssetId === null
      ? []
      : [selectedAssetId]
  ): void {
    this.currentDesign = design;
    this.selectedAssetIds = [...selectedAssetIds];
    const clearanceCautions = new Set(
      (evaluation?.findings ?? [])
        .filter((finding) => finding.id.startsWith("placement.clearance."))
        .flatMap((finding) => finding.entityIds)
    );
    const placementErrors = new Set(
      (evaluation?.findings ?? [])
        .filter((finding) =>
          finding.severity === "error" &&
          finding.id.startsWith("placement.")
        )
        .flatMap((finding) => finding.entityIds)
    );
    const ids = new Set(design.assets.map((asset) => asset.id));
    for (const [id, runtime] of this.instances) {
      if (ids.has(id)) {
        continue;
      }
      this.group.remove(runtime.root);
      runtime.model.dispose();
      disposeObject(runtime.footprint);
      disposeObject(runtime.clearance);
      disposeObject(runtime.ports);
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
        const clearance = clearanceMesh(asset.kind);
        if (footprint === null || clearance === null) {
          continue;
        }
        footprint.userData.assetId = asset.id;
        const model = new CustomAssetModel(asset.kind, this.onReady);
        model.group.userData.assetId = asset.id;
        const ports = new THREE.Group();
        ports.name = `${asset.name} ports`;
        const definition = siteAssetDefinition(asset.kind);
        for (const port of definition?.ports ?? []) {
          const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 10),
            new THREE.MeshBasicMaterial({
              color: portColor(port),
              transparent: true,
              opacity: 0.86,
              depthTest: false,
              depthWrite: false
            })
          );
          marker.position.copy(portLocalPosition(definition!, port));
          marker.renderOrder = 26;
          marker.userData.portAssetId = asset.id;
          marker.userData.portId = port.id;
          marker.userData.assetId = asset.id;
          marker.name = `${asset.name} · ${port.label}`;
          ports.add(marker);
        }
        root.add(clearance, footprint, model.group, ports);
        runtime = { root, model, footprint, clearance, ports };
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
      const assetEvaluation = evaluation?.assetEvaluations.find((item) =>
        item.assetId === asset.id
      );
      const footprintMaterial = runtime.footprint.material as THREE.MeshBasicMaterial;
      footprintMaterial.color.setHex(
        !asset.enabled
          ? 0x7a808b
          : (assetEvaluation?.utilization ?? 0) > 1
            ? 0xffb347
            : assetEvaluation?.operational ? 0x4ade80 : 0x74d8ff
      );
      footprintMaterial.opacity = selectedAssetId === asset.id ? 0.34 : 0.1;
      const clearanceMaterial =
        runtime.clearance.material as THREE.MeshBasicMaterial;
      clearanceMaterial.color.setHex(
        placementErrors.has(asset.id)
          ? 0xff4d4d
          : clearanceCautions.has(asset.id) ||
            (assetEvaluation?.utilization ?? 0) > 1
          ? 0xffb347
          : 0x74d8ff
      );
      clearanceMaterial.opacity = selectedAssetIds.includes(asset.id)
        ? 0.3
        : 0.1;
      runtime.clearance.visible = this.plannerMode && asset.enabled;
      runtime.ports.visible = this.plannerMode && asset.enabled;
    }
    this.rebuildConnections(design, selectedConnectionId, evaluation);
    this.applyPortState(design);
    this.updatePlanningAids(design, selectedAssetIds);
    this.onReady();
  }

  setPlannerMode(plannerMode: boolean): void {
    this.plannerMode = plannerMode;
    if (this.currentDesign !== null) {
      this.applyPortState(this.currentDesign);
    } else {
      for (const runtime of this.instances.values()) {
        runtime.ports.visible = plannerMode;
      }
    }
    for (const [id, runtime] of this.instances) {
      const enabled = this.currentDesign?.assets.find((asset) =>
        asset.id === id
      )?.enabled ?? true;
      runtime.clearance.visible = plannerMode && enabled;
    }
    for (const runtime of this.connections.values()) {
      runtime.handles.visible = plannerMode;
    }
    if (this.currentDesign !== null) {
      this.updatePlanningAids(this.currentDesign, this.selectedAssetIds);
    }
    this.onReady();
  }

  setConnectionState(
    design: SiteDesignDocument,
    source: SitePortRef | null
  ): void {
    this.connectionSource = source;
    this.compatiblePorts = new Set(
      source === null
        ? []
        : compatibleSitePortTargets(design, source).map(portRefKey)
    );
    this.applyPortState(design);
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

  pickPort(raycaster: THREE.Raycaster): SitePortRef | null {
    if (!this.plannerMode) {
      return null;
    }
    const roots = [...this.instances.values()].map((runtime) => runtime.ports);
    const hit = raycaster.intersectObjects(roots, true)[0]?.object;
    return hit !== undefined &&
      typeof hit.userData.portAssetId === "string" &&
      typeof hit.userData.portId === "string"
      ? {
          assetId: hit.userData.portAssetId,
          portId: hit.userData.portId
        }
      : null;
  }

  pickConnection(raycaster: THREE.Raycaster): string | null {
    const roots = [...this.connections.values()].map((connection) =>
      connection.root
    );
    const hit = raycaster.intersectObjects(roots, true)[0]?.object;
    return hit !== undefined && typeof hit.userData.connectionId === "string"
      ? hit.userData.connectionId
      : null;
  }

  pickRouteHandle(raycaster: THREE.Raycaster): PickedRouteHandle | null {
    if (!this.plannerMode) {
      return null;
    }
    const handles = [...this.connections.values()].map((connection) =>
      connection.handles
    );
    const hit = raycaster.intersectObjects(handles, true)[0]?.object;
    return hit !== undefined &&
      typeof hit.userData.connectionId === "string" &&
      typeof hit.userData.routePointIndex === "number"
      ? {
          connectionId: hit.userData.connectionId,
          routePointIndex: hit.userData.routePointIndex
        }
      : null;
  }

  previewRouteHandle(
    picked: PickedRouteHandle,
    point: THREE.Vector3
  ): void {
    const runtime = this.connections.get(picked.connectionId);
    const handle = runtime?.handles.children[picked.routePointIndex];
    const positions = runtime?.line.geometry.getAttribute("position");
    if (
      runtime === undefined ||
      handle === undefined ||
      positions === undefined ||
      picked.routePointIndex + 1 >= positions.count
    ) {
      return;
    }
    const y = this.sampleTerrain(point.x, point.z) + 0.7;
    handle.position.set(point.x, y, point.z);
    positions.setXYZ(picked.routePointIndex + 1, point.x, y, point.z);
    positions.needsUpdate = true;
    runtime.line.geometry.computeBoundingSphere();
    this.onReady();
  }

  portWorldPoint(ref: SitePortRef): THREE.Vector3 | null {
    const runtime = this.instances.get(ref.assetId);
    const marker = runtime?.ports.children.find((child) =>
      child.userData.portId === ref.portId
    );
    return marker?.getWorldPosition(new THREE.Vector3()) ?? null;
  }

  connectionWorldPoint(connectionId: string): THREE.Vector3 | null {
    const runtime = this.connections.get(connectionId);
    if (runtime === undefined) {
      return null;
    }
    return new THREE.Box3()
      .setFromObject(runtime.root)
      .getCenter(new THREE.Vector3());
  }

  previewAssetTransform(
    assetId: string,
    point: THREE.Vector3,
    selectedAssetIds: readonly string[] = []
  ): void {
    const anchor = this.instances.get(assetId);
    if (anchor === undefined) {
      return;
    }
    const ids = selectedAssetIds.length > 1 &&
      selectedAssetIds.includes(assetId)
      ? selectedAssetIds
      : [assetId];
    const deltaX = point.x - anchor.root.position.x;
    const deltaZ = point.z - anchor.root.position.z;
    for (const id of ids) {
      const runtime = this.instances.get(id);
      if (runtime === undefined) {
        continue;
      }
      const x = runtime.root.position.x + deltaX;
      const z = runtime.root.position.z + deltaZ;
      runtime.root.position.set(
        x,
        this.sampleTerrain(x, z) + 0.045,
        z
      );
    }
  }

  setConnectionPreview(
    source: SitePortRef,
    target: THREE.Vector3 | null,
    compatible: boolean
  ): void {
    this.clearConnectionPreview();
    const start = this.portWorldPoint(source);
    if (start === null || target === null) {
      return;
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([
      start,
      new THREE.Vector3(target.x, target.y + 0.5, target.z)
    ]);
    const material = new THREE.LineDashedMaterial({
      color: compatible ? 0x4ade80 : 0xffb347,
      transparent: true,
      opacity: 0.8,
      dashSize: 1.5,
      gapSize: 0.9,
      depthTest: false,
      depthWrite: false
    });
    this.connectionPreview = new THREE.Line(geometry, material);
    this.connectionPreview.computeLineDistances();
    this.connectionPreview.renderOrder = 24;
    this.group.add(this.connectionPreview);
    this.onReady();
  }

  clearConnectionPreview(): void {
    if (this.connectionPreview === null) {
      return;
    }
    this.group.remove(this.connectionPreview);
    disposeObject(this.connectionPreview);
    this.connectionPreview = null;
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
    this.clearConnectionPreview();
    for (const runtime of this.instances.values()) {
      runtime.model.dispose();
      disposeObject(runtime.footprint);
      disposeObject(runtime.clearance);
      disposeObject(runtime.ports);
    }
    this.instances.clear();
    this.clearConnections();
    disposeObject(this.planningAids);
    disposeObject(this.terrain);
    disposeObject(this.grid);
    this.group.clear();
  }

  private applyPortState(design: SiteDesignDocument): void {
    for (const asset of design.assets) {
      const runtime = this.instances.get(asset.id);
      if (runtime === undefined) {
        continue;
      }
      runtime.ports.visible = this.plannerMode && asset.enabled;
      for (const child of runtime.ports.children) {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const ref = {
          assetId: asset.id,
          portId: String(child.userData.portId)
        };
        const key = portRefKey(ref);
        const source = this.connectionSource !== null &&
          portRefKey(this.connectionSource) === key;
        const compatible = this.compatiblePorts.has(key);
        material.color.setHex(source ? 0xffffff : compatible ? 0x4ade80 : (() => {
          const definition = siteAssetDefinition(asset.kind);
          const port = definition?.ports.find((candidate) => candidate.id === ref.portId);
          return port === undefined ? 0x7a808b : portColor(port);
        })());
        material.opacity = this.connectionSource === null || source || compatible ? 0.9 : 0.18;
        child.scale.setScalar(source || compatible ? 1.35 : 1);
      }
    }
  }

  private rebuildConnections(
    design: SiteDesignDocument,
    selectedConnectionId: string | null,
    evaluation: SiteDesignEvaluation | null
  ): void {
    this.clearConnections();
    const invalidIds = new Set(
      validateSiteDesign(design)
        .filter((finding) => finding.severity === "error")
        .flatMap((finding) => finding.entityIds)
        .filter((id) => design.connections.some((connection) => connection.id === id))
    );
    for (const connection of design.connections) {
      const connectionEvaluation = evaluation?.connectionEvaluations.find((item) =>
        item.connectionId === connection.id
      );
      const runtime = this.makeConnection(
        design,
        connection,
        connection.id === selectedConnectionId,
        invalidIds.has(connection.id),
        connectionEvaluation?.operational ??
          (evaluation?.topologyValid ?? invalidIds.size === 0),
        connectionEvaluation?.utilization ?? null
      );
      if (runtime === null) {
        continue;
      }
      this.connections.set(connection.id, runtime);
      this.group.add(runtime.root);
    }
  }

  private makeConnection(
    design: SiteDesignDocument,
    connection: SiteConnection,
    selected: boolean,
    invalid: boolean,
    operational: boolean,
    utilization: number | null
  ): RuntimeConnection | null {
    const route = siteConnectionRoutePoints(design, connection);
    if (route.length < 2) {
      return null;
    }
    const start = this.portWorldPoint(connection.from);
    const end = this.portWorldPoint(connection.to);
    if (start === null || end === null) {
      return null;
    }
    const points = route.map((point, index) =>
      index === 0
        ? start
        : index === route.length - 1
          ? end
          : new THREE.Vector3(
              point.xM,
              this.sampleTerrain(point.xM, point.zM) +
                0.45 +
                (
                  connection.kind === "power"
                    ? 0.24
                    : connection.kind === "construction"
                      ? 0.16
                      : connection.kind === "logistics" ? 0.08 : 0
                ),
              point.zM
            )
    );
    const material = invalid || !operational
      ? new THREE.LineDashedMaterial({
          color: invalid ? 0xff4d4d : 0xffb347,
          dashSize: 1.2,
          gapSize: 0.8,
          transparent: true,
          opacity: selected ? 1 : 0.84,
          depthTest: false,
          depthWrite: false
        })
      : new THREE.LineBasicMaterial({
          color: utilization !== null && utilization > 1
            ? 0xffb347
            : CONNECTION_COLORS[connection.kind],
          transparent: true,
          opacity: selected ? 1 : 0.72,
          depthTest: false,
          depthWrite: false
        });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      material
    );
    if (invalid || !operational) {
      line.computeLineDistances();
    }
    line.userData.connectionId = connection.id;
    line.name = connection.id;
    line.renderOrder = selected ? 23 : 21;
    const handles = new THREE.Group();
    handles.visible = this.plannerMode && selected;
    for (const [index, point] of points.slice(1, -1).entries()) {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(0.75, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false
        })
      );
      handle.position.copy(point);
      handle.userData.connectionId = connection.id;
      handle.userData.routePointIndex = index;
      handle.renderOrder = 25;
      handles.add(handle);
    }
    const root = new THREE.Group();
    root.userData.connectionId = connection.id;
    root.add(line, handles);
    return { root, line, handles };
  }

  private updatePlanningAids(
    design: SiteDesignDocument,
    selectedAssetIds: readonly string[]
  ): void {
    disposeObject(this.planningAids);
    this.planningAids.clear();
    if (!this.plannerMode || selectedAssetIds.length === 0) {
      return;
    }
    const guideMaterial = new THREE.LineDashedMaterial({
      color: 0x74d8ff,
      dashSize: 1.2,
      gapSize: 0.8,
      transparent: true,
      opacity: 0.74,
      depthTest: false,
      depthWrite: false
    });
    for (const guide of siteAlignmentGuides(design, selectedAssetIds)) {
      const from = guide.axis === "x"
        ? new THREE.Vector3(guide.valueM, 0.9, guide.fromM)
        : new THREE.Vector3(guide.fromM, 0.9, guide.valueM);
      const to = guide.axis === "x"
        ? new THREE.Vector3(guide.valueM, 0.9, guide.toM)
        : new THREE.Vector3(guide.toM, 0.9, guide.valueM);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        guideMaterial.clone()
      );
      line.computeLineDistances();
      line.renderOrder = 24;
      this.planningAids.add(line);
    }
    guideMaterial.dispose();

    const selected = design.assets.filter((asset) =>
      selectedAssetIds.includes(asset.id)
    );
    const bounds = siteLayoutSummary({
      ...design,
      assets: selected,
      connections: []
    });
    if (selected.length > 1) {
      const rectangle = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(bounds.minXM, 0.82, bounds.minZM),
          new THREE.Vector3(bounds.maxXM, 0.82, bounds.minZM),
          new THREE.Vector3(bounds.maxXM, 0.82, bounds.maxZM),
          new THREE.Vector3(bounds.minXM, 0.82, bounds.maxZM)
        ]),
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.62,
          depthTest: false,
          depthWrite: false
        })
      );
      rectangle.renderOrder = 23;
      this.planningAids.add(rectangle);
    }
  }

  private clearConnections(): void {
    for (const runtime of this.connections.values()) {
      this.group.remove(runtime.root);
      disposeObject(runtime.root);
    }
    this.connections.clear();
  }
}
