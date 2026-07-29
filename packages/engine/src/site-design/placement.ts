import { siteAssetDefinition } from "./catalog";
import type {
  SiteAssetInstance,
  SiteDesignDocument,
  SiteDesignFinding
} from "./types";

export const SITE_PLANNING_BOUND_M = 92;

interface Footprint {
  centerX: number;
  centerZ: number;
  axisX: readonly [number, number];
  axisZ: readonly [number, number];
  halfWidth: number;
  halfDepth: number;
}

function finding(
  id: string,
  severity: SiteDesignFinding["severity"],
  message: string,
  entityIds: string[],
  suggestedAction?: string
): SiteDesignFinding {
  return {
    id,
    severity,
    message,
    entityIds,
    ...(suggestedAction === undefined ? {} : { suggestedAction })
  };
}

function footprint(asset: SiteAssetInstance, includeClearance: boolean): Footprint | null {
  const definition = siteAssetDefinition(asset.kind);
  if (definition === null) {
    return null;
  }
  const radians = asset.transform.headingDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const clearance = includeClearance ? definition.footprint.clearanceM ?? 0 : 0;
  return {
    centerX: asset.transform.xM,
    centerZ: asset.transform.zM,
    axisX: [cos, sin],
    axisZ: [-sin, cos],
    halfWidth: definition.footprint.widthM / 2 + clearance,
    halfDepth: definition.footprint.depthM / 2 + clearance
  };
}

function projectionRadius(
  item: Footprint,
  axis: readonly [number, number]
): number {
  const xProjection = Math.abs(item.axisX[0] * axis[0] + item.axisX[1] * axis[1]);
  const zProjection = Math.abs(item.axisZ[0] * axis[0] + item.axisZ[1] * axis[1]);
  return item.halfWidth * xProjection + item.halfDepth * zProjection;
}

function overlaps(a: Footprint, b: Footprint): boolean {
  const dx = b.centerX - a.centerX;
  const dz = b.centerZ - a.centerZ;
  for (const axis of [a.axisX, a.axisZ, b.axisX, b.axisZ]) {
    const distance = Math.abs(dx * axis[0] + dz * axis[1]);
    if (distance >= projectionRadius(a, axis) + projectionRadius(b, axis)) {
      return false;
    }
  }
  return true;
}

function exceedsPlanningBound(item: Footprint): boolean {
  for (const widthSign of [-1, 1]) {
    for (const depthSign of [-1, 1]) {
      const x =
        item.centerX +
        item.axisX[0] * item.halfWidth * widthSign +
        item.axisZ[0] * item.halfDepth * depthSign;
      const z =
        item.centerZ +
        item.axisX[1] * item.halfWidth * widthSign +
        item.axisZ[1] * item.halfDepth * depthSign;
      if (Math.hypot(x, z) > SITE_PLANNING_BOUND_M) {
        return true;
      }
    }
  }
  return false;
}

function pairId(a: SiteAssetInstance, b: SiteAssetInstance): string {
  return [a.id, b.id].sort().join(".");
}

function placementPairFindings(
  a: SiteAssetInstance,
  b: SiteAssetInstance
): SiteDesignFinding[] {
  const actualA = footprint(a, false);
  const actualB = footprint(b, false);
  const clearedA = footprint(a, true);
  const clearedB = footprint(b, true);
  if (actualA === null || actualB === null || clearedA === null || clearedB === null) {
    return [];
  }
  const id = pairId(a, b);
  const entityIds = [a.id, b.id].sort();
  if (overlaps(actualA, actualB)) {
    return [finding(
      `placement.collision.${id}`,
      "error",
      `${a.name} and ${b.name} have overlapping equipment footprints.`,
      entityIds,
      "Move or rotate one of the assets until their physical footprints no longer overlap."
    )];
  }
  if (overlaps(clearedA, clearedB)) {
    return [finding(
      `placement.clearance.${id}`,
      "caution",
      `${a.name} and ${b.name} intrude on their catalog planning clearances.`,
      entityIds,
      "Increase separation or document why reduced service clearance is acceptable."
    )];
  }
  return [];
}

export function snapSiteCoordinate(value: number, snapM: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return snapM > 0 ? Math.round(value / snapM) * snapM : value;
}

export function snapSiteHeading(value: number, snapDeg: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const snapped = snapDeg > 0 ? Math.round(value / snapDeg) * snapDeg : value;
  return ((snapped % 360) + 360) % 360;
}

export function validateSiteAssetPlacement(
  document: SiteDesignDocument,
  candidate: SiteAssetInstance
): SiteDesignFinding[] {
  const findings: SiteDesignFinding[] = [];
  const definition = siteAssetDefinition(candidate.kind);
  if (definition === null) {
    return [finding(
      `placement.unknown-kind.${candidate.id}`,
      "error",
      `${candidate.name} does not resolve to a catalog footprint.`,
      [candidate.id]
    )];
  }
  if (!definition.compatibleEnvironments.includes(document.environment)) {
    findings.push(finding(
      `placement.environment.${candidate.id}`,
      "error",
      `${definition.label} cannot be placed in the ${document.environment} environment.`,
      [candidate.id]
    ));
  }
  if (
    candidate.enabled &&
    definition.multiplicity === "single" &&
    document.assets.some((asset) =>
      asset.id !== candidate.id && asset.enabled && asset.kind === candidate.kind
    )
  ) {
    findings.push(finding(
      `placement.multiplicity.${candidate.kind}`,
      "error",
      `${definition.label} is limited to one enabled instance per site.`,
      [candidate.id]
    ));
  }
  const candidateFootprint = footprint(candidate, true);
  if (candidateFootprint !== null && exceedsPlanningBound(candidateFootprint)) {
    findings.push(finding(
      `placement.boundary.${candidate.id}`,
      "error",
      `${candidate.name} extends beyond the ${SITE_PLANNING_BOUND_M} m planning boundary.`,
      [candidate.id],
      "Move the complete footprint and its clearance inside the planning boundary."
    ));
  }
  if (candidate.enabled) {
    for (const asset of document.assets) {
      if (asset.id !== candidate.id && asset.enabled) {
        findings.push(...placementPairFindings(candidate, asset));
      }
    }
  }
  return findings.sort((a, b) => a.id.localeCompare(b.id));
}

export function validateSitePlacementLayout(
  document: SiteDesignDocument
): SiteDesignFinding[] {
  const findings: SiteDesignFinding[] = [];
  const enabled = document.assets.filter((asset) => asset.enabled);
  for (const asset of enabled) {
    const item = footprint(asset, true);
    if (item !== null && exceedsPlanningBound(item)) {
      findings.push(finding(
        `placement.boundary.${asset.id}`,
        "error",
        `${asset.name} extends beyond the ${SITE_PLANNING_BOUND_M} m planning boundary.`,
        [asset.id],
        "Move the complete footprint and its clearance inside the planning boundary."
      ));
    }
  }
  for (let i = 0; i < enabled.length; i += 1) {
    const a = enabled[i];
    if (a === undefined) {
      continue;
    }
    for (let j = i + 1; j < enabled.length; j += 1) {
      const b = enabled[j];
      if (b !== undefined) {
        findings.push(...placementPairFindings(a, b));
      }
    }
  }
  return findings.sort((a, b) => a.id.localeCompare(b.id));
}
