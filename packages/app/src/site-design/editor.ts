import {
  siteAssetDefinition,
  snapSiteCoordinate,
  snapSiteHeading
} from "@selene-isru/engine";
import type {
  PlannerDocumentState,
  SiteAssetInstance,
  SiteDesignDocument,
  SiteEnvironment
} from "@selene-isru/engine";

export const CUSTOM_HISTORY_LIMIT = 50;

export interface CustomEditorSession {
  tool: "select" | "place";
  placementKind: string | null;
  selectedAssetId: string | null;
}

export interface CustomDesignHistory {
  past: SiteDesignDocument[];
  future: SiteDesignDocument[];
}

let assetNonce = 0;

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
