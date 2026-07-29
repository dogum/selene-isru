import { siteAssetDefinition } from "./catalog";
import type {
  SiteAssetDefinition,
  SiteAssetInstance,
  SiteConnection,
  SiteConnectionKind,
  SiteDesignDocument,
  SitePortDefinition,
  SitePortRef,
  SiteRoutePoint
} from "./types";

export interface ResolvedSitePort {
  asset: SiteAssetInstance;
  definition: SiteAssetDefinition;
  port: SitePortDefinition;
}

export interface SiteConnectionCompatibility {
  compatible: boolean;
  kind: SiteConnectionKind | null;
  sharedStreams: string[];
  reasons: string[];
}

function sameRef(a: SitePortRef, b: SitePortRef): boolean {
  return a.assetId === b.assetId && a.portId === b.portId;
}

function portUseCount(
  document: SiteDesignDocument,
  ref: SitePortRef,
  excludeConnectionId?: string
): number {
  return document.connections.filter((connection) =>
    connection.id !== excludeConnectionId &&
    (sameRef(connection.from, ref) || sameRef(connection.to, ref))
  ).length;
}

function canOutput(port: SitePortDefinition): boolean {
  return port.direction === "output" || port.direction === "bidirectional";
}

function canInput(port: SitePortDefinition): boolean {
  return port.direction === "input" || port.direction === "bidirectional";
}

export function resolveSitePort(
  document: SiteDesignDocument,
  ref: SitePortRef
): ResolvedSitePort | null {
  const asset = document.assets.find((candidate) => candidate.id === ref.assetId);
  if (asset === undefined) {
    return null;
  }
  const definition = siteAssetDefinition(asset.kind);
  const port = definition?.ports.find((candidate) => candidate.id === ref.portId);
  return definition === null || port === undefined
    ? null
    : { asset, definition, port };
}

export function sitePortConnectionCompatibility(
  document: SiteDesignDocument,
  fromRef: SitePortRef,
  toRef: SitePortRef,
  excludeConnectionId?: string
): SiteConnectionCompatibility {
  const from = resolveSitePort(document, fromRef);
  const to = resolveSitePort(document, toRef);
  const reasons: string[] = [];
  if (from === null || to === null) {
    reasons.push("A selected asset or port does not exist.");
    return { compatible: false, kind: null, sharedStreams: [], reasons };
  }
  if (!from.asset.enabled || !to.asset.enabled) {
    reasons.push("Connections require enabled equipment.");
  }
  if (from.asset.id === to.asset.id) {
    reasons.push("A connection must join two different assets.");
  }
  if (!canOutput(from.port)) {
    reasons.push(`${from.port.label} is not an output port.`);
  }
  if (!canInput(to.port)) {
    reasons.push(`${to.port.label} is not an input port.`);
  }
  if (from.port.kind !== to.port.kind) {
    reasons.push("The selected ports use different connection kinds.");
  }
  const sharedStreams = from.port.streams.filter((stream) =>
    to.port.streams.includes(stream)
  );
  if (sharedStreams.length === 0) {
    reasons.push("The selected ports do not share a supported stream.");
  }
  for (const [resolved, ref] of [[from, fromRef], [to, toRef]] as const) {
    if (
      resolved.port.maxConnections !== undefined &&
      portUseCount(document, ref, excludeConnectionId) >= resolved.port.maxConnections
    ) {
      reasons.push(`${resolved.asset.name} · ${resolved.port.label} has no open connection slots.`);
    }
  }
  if (document.connections.some((connection) =>
    connection.id !== excludeConnectionId &&
    sameRef(connection.from, fromRef) &&
    sameRef(connection.to, toRef)
  )) {
    reasons.push("These ports are already connected.");
  }
  return {
    compatible: reasons.length === 0,
    kind: from.port.kind === to.port.kind ? from.port.kind : null,
    sharedStreams,
    reasons
  };
}

export function compatibleSitePortTargets(
  document: SiteDesignDocument,
  source: SitePortRef
): SitePortRef[] {
  const targets: SitePortRef[] = [];
  for (const asset of document.assets) {
    const definition = siteAssetDefinition(asset.kind);
    if (definition === null) {
      continue;
    }
    for (const port of definition.ports) {
      const ref = { assetId: asset.id, portId: port.id };
      if (sitePortConnectionCompatibility(document, source, ref).compatible) {
        targets.push(ref);
      }
    }
  }
  return targets.sort((a, b) =>
    a.assetId.localeCompare(b.assetId) || a.portId.localeCompare(b.portId)
  );
}

function distance(a: SiteRoutePoint, b: SiteRoutePoint): number {
  return Math.hypot(b.xM - a.xM, b.zM - a.zM);
}

function samePoint(a: SiteRoutePoint, b: SiteRoutePoint): boolean {
  return distance(a, b) < 1e-6;
}

export function siteConnectionRoutePoints(
  document: SiteDesignDocument,
  connection: SiteConnection
): SiteRoutePoint[] {
  const from = document.assets.find((asset) => asset.id === connection.from.assetId);
  const to = document.assets.find((asset) => asset.id === connection.to.assetId);
  if (from === undefined || to === undefined) {
    return [...connection.route];
  }
  const start = {
    xM: from.transform.xM,
    zM: from.transform.zM
  };
  const end = {
    xM: to.transform.xM,
    zM: to.transform.zM
  };
  let interior = [...connection.route];
  if (interior[0] !== undefined && samePoint(interior[0], start)) {
    interior = interior.slice(1);
  }
  if (interior.at(-1) !== undefined && samePoint(interior.at(-1)!, end)) {
    interior = interior.slice(0, -1);
  }
  return [start, ...interior, end].filter((point, index, points) =>
    index === 0 || !samePoint(point, points[index - 1]!)
  );
}

export function siteConnectionLengthM(
  document: SiteDesignDocument,
  connection: SiteConnection
): number {
  const points = siteConnectionRoutePoints(document, connection);
  let lengthM = 0;
  for (let index = 1; index < points.length; index += 1) {
    lengthM += distance(points[index - 1]!, points[index]!);
  }
  return lengthM;
}

export function orthogonalSiteConnectionRoute(
  document: SiteDesignDocument,
  fromRef: SitePortRef,
  toRef: SitePortRef,
  orientation: "x-first" | "z-first" = "x-first"
): SiteRoutePoint[] {
  const from = resolveSitePort(document, fromRef)?.asset;
  const to = resolveSitePort(document, toRef)?.asset;
  if (from === undefined || to === undefined) {
    return [];
  }
  return [{
    xM: orientation === "x-first" ? to.transform.xM : from.transform.xM,
    zM: orientation === "x-first" ? from.transform.zM : to.transform.zM
  }];
}
