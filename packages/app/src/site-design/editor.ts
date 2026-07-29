import {
  orthogonalSiteConnectionRoute,
  siteAssetDefinition,
  siteConnectionLengthM,
  sitePortConnectionCompatibility,
  snapSiteCoordinate,
  snapSiteHeading
} from "@selene-isru/engine";
import type {
  PlannerDocumentState,
  SiteConfigurationValue,
  SiteAssetInstance,
  SiteConnection,
  SiteDesignDocument,
  SiteEnvironment,
  SitePortRef,
  SiteRoutePoint
} from "@selene-isru/engine";

export const CUSTOM_HISTORY_LIMIT = 50;

export interface CustomEditorSession {
  tool: "select" | "place" | "connect";
  placementKind: string | null;
  connectionSource: SitePortRef | null;
  selectedAssetId: string | null;
  selectedAssetIds: string[];
  selectedConnectionId: string | null;
}

export interface CustomDesignHistory {
  past: SiteDesignDocument[];
  future: SiteDesignDocument[];
}

export interface SiteLayoutSummary {
  minXM: number;
  maxXM: number;
  minZM: number;
  maxZM: number;
  widthM: number;
  depthM: number;
  occupiedAreaM2: number;
  clearanceAreaM2: number;
  totalRouteLengthM: number;
}

export interface SiteAlignmentGuide {
  axis: "x" | "z";
  valueM: number;
  fromM: number;
  toM: number;
  assetIds: string[];
}

let assetNonce = 0;
let connectionNonce = 0;

function timestamp(value?: string): string {
  return value ?? new Date().toISOString();
}

function nextAssetId(kind: string): string {
  assetNonce += 1;
  const stem = kind.split(".").at(-1)?.replace(/[^a-z0-9-]/gi, "-") ?? "asset";
  return `${stem}-${Date.now().toString(36)}-${assetNonce.toString(36)}`;
}

function nextAssetName(design: SiteDesignDocument, kind: string): string {
  const definition = siteAssetDefinition(kind);
  const count = design.assets.filter((asset) => asset.kind === kind).length + 1;
  return `${definition?.label ?? kind} ${String(count).padStart(2, "0")}`;
}

function nextConnectionId(kind: string): string {
  connectionNonce += 1;
  return `${kind}-route-${Date.now().toString(36)}-${connectionNonce.toString(36)}`;
}

function withAssets(
  design: SiteDesignDocument,
  assets: SiteAssetInstance[],
  updatedAt?: string
): SiteDesignDocument {
  return {
    ...design,
    assets,
    updatedAt: timestamp(updatedAt)
  };
}

export function placeSiteAsset(
  design: SiteDesignDocument,
  kind: string,
  xM: number,
  zM: number,
  options: { id?: string; updatedAt?: string } = {}
): SiteDesignDocument | null {
  const definition = siteAssetDefinition(kind);
  if (
    definition === null ||
    !definition.compatibleEnvironments.includes(design.environment) ||
    (
      definition.multiplicity === "single" &&
      design.assets.some((asset) => asset.kind === kind && asset.enabled)
    )
  ) {
    return null;
  }
  const asset: SiteAssetInstance = {
    id: options.id ?? nextAssetId(kind),
    kind,
    name: nextAssetName(design, kind),
    transform: {
      xM: snapSiteCoordinate(xM, design.planner.gridSnapM),
      zM: snapSiteCoordinate(zM, design.planner.gridSnapM),
      headingDeg: 0
    },
    enabled: true,
    configuration: {}
  };
  return withAssets(design, [...design.assets, asset], options.updatedAt);
}

export function updateSiteAsset(
  design: SiteDesignDocument,
  assetId: string,
  patch: {
    name?: string;
    xM?: number;
    zM?: number;
    headingDeg?: number;
    enabled?: boolean;
    configuration?: Record<string, SiteConfigurationValue>;
  },
  updatedAt?: string
): SiteDesignDocument {
  const assets = design.assets.map((asset) => {
    if (asset.id !== assetId) {
      return asset;
    }
    return {
      ...asset,
      ...(patch.name === undefined ? {} : { name: patch.name.trim().slice(0, 120) || asset.name }),
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
      ...(patch.configuration === undefined
        ? {}
        : {
            configuration: {
              ...asset.configuration,
              ...patch.configuration
            }
          }),
      transform: {
        xM: patch.xM === undefined
          ? asset.transform.xM
          : snapSiteCoordinate(patch.xM, design.planner.gridSnapM),
        zM: patch.zM === undefined
          ? asset.transform.zM
          : snapSiteCoordinate(patch.zM, design.planner.gridSnapM),
        headingDeg: patch.headingDeg === undefined
          ? asset.transform.headingDeg
          : snapSiteHeading(patch.headingDeg, design.planner.rotationSnapDeg)
      }
    };
  });
  return withAssets(design, assets, updatedAt);
}

export function duplicateSiteAsset(
  design: SiteDesignDocument,
  assetId: string,
  options: { id?: string; updatedAt?: string } = {}
): SiteDesignDocument | null {
  const source = design.assets.find((asset) => asset.id === assetId);
  const definition = source === undefined ? null : siteAssetDefinition(source.kind);
  if (
    source === undefined ||
    definition === null ||
    definition.multiplicity === "single"
  ) {
    return null;
  }
  const offset = design.planner.gridSnapM > 0 ? design.planner.gridSnapM * 2 : 5;
  const duplicate: SiteAssetInstance = {
    ...source,
    id: options.id ?? nextAssetId(source.kind),
    name: nextAssetName(design, source.kind),
    transform: {
      ...source.transform,
      xM: snapSiteCoordinate(source.transform.xM + offset, design.planner.gridSnapM),
      zM: snapSiteCoordinate(source.transform.zM + offset, design.planner.gridSnapM)
    },
    configuration: { ...source.configuration }
  };
  return withAssets(design, [...design.assets, duplicate], options.updatedAt);
}

export function removeSiteAsset(
  design: SiteDesignDocument,
  assetId: string,
  updatedAt?: string
): SiteDesignDocument {
  return {
    ...withAssets(
      design,
      design.assets.filter((asset) => asset.id !== assetId),
      updatedAt
    ),
    connections: design.connections.filter((connection) =>
      connection.from.assetId !== assetId && connection.to.assetId !== assetId
    )
  };
}

export function createSiteConnection(
  design: SiteDesignDocument,
  from: SitePortRef,
  to: SitePortRef,
  options: {
    id?: string;
    orientation?: "x-first" | "z-first";
    updatedAt?: string;
  } = {}
): SiteDesignDocument | null {
  const compatibility = sitePortConnectionCompatibility(design, from, to);
  if (!compatibility.compatible || compatibility.kind === null) {
    return null;
  }
  const connection: SiteConnection = {
    id: options.id ?? nextConnectionId(compatibility.kind),
    kind: compatibility.kind,
    from: { ...from },
    to: { ...to },
    route: orthogonalSiteConnectionRoute(
      design,
      from,
      to,
      options.orientation ?? "x-first"
    ),
    configuration: {}
  };
  return {
    ...design,
    connections: [...design.connections, connection],
    updatedAt: timestamp(options.updatedAt)
  };
}

export function updateSiteConnectionRoute(
  design: SiteDesignDocument,
  connectionId: string,
  route: SiteRoutePoint[],
  updatedAt?: string
): SiteDesignDocument {
  return {
    ...design,
    connections: design.connections.map((connection) =>
      connection.id === connectionId
        ? {
            ...connection,
            route: route
              .filter((point) => Number.isFinite(point.xM) && Number.isFinite(point.zM))
              .slice(0, 256)
              .map((point) => ({
                xM: snapSiteCoordinate(point.xM, design.planner.gridSnapM),
                zM: snapSiteCoordinate(point.zM, design.planner.gridSnapM)
              }))
          }
        : connection
    ),
    updatedAt: timestamp(updatedAt)
  };
}

function selectedAssets(
  design: SiteDesignDocument,
  assetIds: readonly string[]
): SiteAssetInstance[] {
  const ids = new Set(assetIds);
  return design.assets.filter((asset) => ids.has(asset.id));
}

function withTransformedAssets(
  design: SiteDesignDocument,
  transformed: Map<string, SiteAssetInstance["transform"]>,
  updatedAt?: string
): SiteDesignDocument {
  return withAssets(
    design,
    design.assets.map((asset) => {
      const transform = transformed.get(asset.id);
      return transform === undefined ? asset : { ...asset, transform };
    }),
    updatedAt
  );
}

export function moveSiteAssetGroup(
  design: SiteDesignDocument,
  assetIds: readonly string[],
  deltaXM: number,
  deltaZM: number,
  updatedAt?: string
): SiteDesignDocument {
  const transformed = new Map<string, SiteAssetInstance["transform"]>();
  for (const asset of selectedAssets(design, assetIds)) {
    transformed.set(asset.id, {
      ...asset.transform,
      xM: snapSiteCoordinate(asset.transform.xM + deltaXM, 0),
      zM: snapSiteCoordinate(asset.transform.zM + deltaZM, 0)
    });
  }
  return withTransformedAssets(design, transformed, updatedAt);
}

export function rotateSiteAssetGroup(
  design: SiteDesignDocument,
  assetIds: readonly string[],
  deltaDeg: number,
  updatedAt?: string
): SiteDesignDocument {
  const assets = selectedAssets(design, assetIds);
  if (assets.length === 0) {
    return design;
  }
  const centerX = assets.reduce(
    (total, asset) => total + asset.transform.xM,
    0
  ) / assets.length;
  const centerZ = assets.reduce(
    (total, asset) => total + asset.transform.zM,
    0
  ) / assets.length;
  const radians = deltaDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const transformed = new Map<string, SiteAssetInstance["transform"]>();
  for (const asset of assets) {
    const dx = asset.transform.xM - centerX;
    const dz = asset.transform.zM - centerZ;
    transformed.set(asset.id, {
      xM: Number(
        snapSiteCoordinate(centerX + dx * cos - dz * sin, 0).toFixed(6)
      ),
      zM: Number(
        snapSiteCoordinate(centerZ + dx * sin + dz * cos, 0).toFixed(6)
      ),
      headingDeg: snapSiteHeading(
        asset.transform.headingDeg + deltaDeg,
        design.planner.rotationSnapDeg
      )
    });
  }
  return withTransformedAssets(design, transformed, updatedAt);
}

export function distributeSiteAssets(
  design: SiteDesignDocument,
  assetIds: readonly string[],
  axis: "x" | "z",
  updatedAt?: string
): SiteDesignDocument {
  const coordinate = axis === "x" ? "xM" : "zM";
  const assets = selectedAssets(design, assetIds)
    .sort((a, b) => a.transform[coordinate] - b.transform[coordinate]);
  if (assets.length < 3) {
    return design;
  }
  const first = assets[0]!.transform[coordinate];
  const last = assets.at(-1)!.transform[coordinate];
  const spacing = (last - first) / (assets.length - 1);
  const transformed = new Map<string, SiteAssetInstance["transform"]>();
  for (const [index, asset] of assets.entries()) {
    transformed.set(asset.id, {
      ...asset.transform,
      [coordinate]: snapSiteCoordinate(
        first + spacing * index,
        design.planner.gridSnapM
      )
    });
  }
  return withTransformedAssets(design, transformed, updatedAt);
}

function rotatedHalfExtents(asset: SiteAssetInstance): {
  halfX: number;
  halfZ: number;
} {
  const definition = siteAssetDefinition(asset.kind);
  if (definition === null) {
    return { halfX: 0, halfZ: 0 };
  }
  const radians = asset.transform.headingDeg * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfWidth = definition.footprint.widthM / 2;
  const halfDepth = definition.footprint.depthM / 2;
  return {
    halfX: halfWidth * cos + halfDepth * sin,
    halfZ: halfWidth * sin + halfDepth * cos
  };
}

export function siteLayoutSummary(
  design: SiteDesignDocument
): SiteLayoutSummary {
  if (design.assets.length === 0) {
    return {
      minXM: 0,
      maxXM: 0,
      minZM: 0,
      maxZM: 0,
      widthM: 0,
      depthM: 0,
      occupiedAreaM2: 0,
      clearanceAreaM2: 0,
      totalRouteLengthM: design.connections.reduce(
        (total, connection) =>
          total + siteConnectionLengthM(design, connection),
        0
      )
    };
  }
  let minXM = Number.POSITIVE_INFINITY;
  let maxXM = Number.NEGATIVE_INFINITY;
  let minZM = Number.POSITIVE_INFINITY;
  let maxZM = Number.NEGATIVE_INFINITY;
  let occupiedAreaM2 = 0;
  let clearanceAreaM2 = 0;
  for (const asset of design.assets) {
    const definition = siteAssetDefinition(asset.kind);
    if (definition === null) {
      continue;
    }
    const { halfX, halfZ } = rotatedHalfExtents(asset);
    minXM = Math.min(minXM, asset.transform.xM - halfX);
    maxXM = Math.max(maxXM, asset.transform.xM + halfX);
    minZM = Math.min(minZM, asset.transform.zM - halfZ);
    maxZM = Math.max(maxZM, asset.transform.zM + halfZ);
    occupiedAreaM2 +=
      definition.footprint.widthM * definition.footprint.depthM;
    const clearance = definition.footprint.clearanceM ?? 0;
    clearanceAreaM2 +=
      (definition.footprint.widthM + clearance * 2) *
      (definition.footprint.depthM + clearance * 2);
  }
  if (!Number.isFinite(minXM)) {
    minXM = maxXM = minZM = maxZM = 0;
  }
  return {
    minXM,
    maxXM,
    minZM,
    maxZM,
    widthM: maxXM - minXM,
    depthM: maxZM - minZM,
    occupiedAreaM2,
    clearanceAreaM2,
    totalRouteLengthM: design.connections.reduce(
      (total, connection) =>
        total + siteConnectionLengthM(design, connection),
      0
    )
  };
}

export function siteAlignmentGuides(
  design: SiteDesignDocument,
  assetIds: readonly string[],
  toleranceM = 0.01
): SiteAlignmentGuide[] {
  const selected = selectedAssets(design, assetIds);
  const guides: SiteAlignmentGuide[] = [];
  for (const axis of ["x", "z"] as const) {
    const coordinate = axis === "x" ? "xM" : "zM";
    const spanCoordinate = axis === "x" ? "zM" : "xM";
    for (const asset of selected) {
      const aligned = design.assets.filter((candidate) =>
        candidate.id !== asset.id &&
        Math.abs(
          candidate.transform[coordinate] - asset.transform[coordinate]
        ) <= toleranceM
      );
      if (aligned.length === 0) {
        continue;
      }
      const group = [asset, ...aligned];
      const assetIds = [...new Set(group.map((item) => item.id))].sort();
      if (guides.some((guide) =>
        guide.axis === axis &&
        guide.assetIds.join("|") === assetIds.join("|")
      )) {
        continue;
      }
      const spans = group.map((item) => item.transform[spanCoordinate]);
      guides.push({
        axis,
        valueM: asset.transform[coordinate],
        fromM: Math.min(...spans),
        toM: Math.max(...spans),
        assetIds
      });
    }
  }
  return guides;
}

export function rerouteSiteConnection(
  design: SiteDesignDocument,
  connectionId: string,
  updatedAt?: string
): SiteDesignDocument {
  const connection = design.connections.find((item) => item.id === connectionId);
  if (connection === undefined) {
    return design;
  }
  const xFirst = orthogonalSiteConnectionRoute(
    design,
    connection.from,
    connection.to,
    "x-first"
  );
  const current = connection.route[0];
  const usesXFirst = current !== undefined &&
    xFirst[0] !== undefined &&
    Math.abs(current.xM - xFirst[0].xM) < 1e-6 &&
    Math.abs(current.zM - xFirst[0].zM) < 1e-6;
  return updateSiteConnectionRoute(
    design,
    connectionId,
    orthogonalSiteConnectionRoute(
      design,
      connection.from,
      connection.to,
      usesXFirst ? "z-first" : "x-first"
    ),
    updatedAt
  );
}

export function removeSiteConnection(
  design: SiteDesignDocument,
  connectionId: string,
  updatedAt?: string
): SiteDesignDocument {
  return {
    ...design,
    connections: design.connections.filter((connection) =>
      connection.id !== connectionId
    ),
    updatedAt: timestamp(updatedAt)
  };
}

export function updatePlannerSnaps(
  design: SiteDesignDocument,
  patch: Partial<Pick<PlannerDocumentState, "gridSnapM" | "rotationSnapDeg">>,
  updatedAt?: string
): SiteDesignDocument {
  return {
    ...design,
    planner: { ...design.planner, ...patch },
    updatedAt: timestamp(updatedAt)
  };
}

export function emptyCustomHistory(): CustomDesignHistory {
  return { past: [], future: [] };
}

export function pushCustomHistory(
  history: CustomDesignHistory,
  current: SiteDesignDocument
): CustomDesignHistory {
  return {
    past: [...history.past, current].slice(-CUSTOM_HISTORY_LIMIT),
    future: []
  };
}

export function undoCustomDesign(
  current: SiteDesignDocument,
  history: CustomDesignHistory
): { design: SiteDesignDocument; history: CustomDesignHistory } | null {
  const design = history.past.at(-1);
  if (design === undefined) {
    return null;
  }
  return {
    design,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, CUSTOM_HISTORY_LIMIT)
    }
  };
}

export function redoCustomDesign(
  current: SiteDesignDocument,
  history: CustomDesignHistory
): { design: SiteDesignDocument; history: CustomDesignHistory } | null {
  const design = history.future[0];
  if (design === undefined) {
    return null;
  }
  return {
    design,
    history: {
      past: [...history.past, current].slice(-CUSTOM_HISTORY_LIMIT),
      future: history.future.slice(1)
    }
  };
}

export function isKindAvailable(
  design: SiteDesignDocument,
  kind: string,
  environment: SiteEnvironment = design.environment
): boolean {
  const definition = siteAssetDefinition(kind);
  return (
    definition !== null &&
    definition.compatibleEnvironments.includes(environment) &&
    (
      definition.multiplicity === "multiple" ||
      !design.assets.some((asset) => asset.kind === kind && asset.enabled)
    )
  );
}
