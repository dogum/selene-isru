import {
  createBlankSiteDesign,
  siteAssetsForEnvironment,
  type SiteAssetInstance,
  type SiteConnection,
  type SiteDesignDocument,
  type SiteEnvironment
} from "@selene-isru/engine";

export const CUSTOM_SITE_DESKTOP_DETAIL_BUDGET = 72;
export const CUSTOM_SITE_MOBILE_DETAIL_BUDGET = 28;
export const CUSTOM_SITE_CAUTION_ASSET_COUNT = 120;
export const CUSTOM_SITE_CAUTION_CONNECTION_COUNT = 180;

export interface CustomSiteComplexity {
  assetCount: number;
  connectionCount: number;
  detailBudget: number;
  detailedAssetCount: number;
  simplifiedAssetCount: number;
  level: "normal" | "simplified" | "caution";
}

/** A stable, reader-facing summary of the renderer's large-document guardrails. */
export function customSiteComplexity(
  design: Pick<SiteDesignDocument, "assets" | "connections">,
  mobile: boolean
): CustomSiteComplexity {
  const detailBudget = mobile
    ? CUSTOM_SITE_MOBILE_DETAIL_BUDGET
    : CUSTOM_SITE_DESKTOP_DETAIL_BUDGET;
  const simplifiedAssetCount = Math.max(0, design.assets.length - detailBudget);
  return {
    assetCount: design.assets.length,
    connectionCount: design.connections.length,
    detailBudget,
    detailedAssetCount: Math.min(design.assets.length, detailBudget),
    simplifiedAssetCount,
    level:
      design.assets.length >= CUSTOM_SITE_CAUTION_ASSET_COUNT ||
      design.connections.length >= CUSTOM_SITE_CAUTION_CONNECTION_COUNT
        ? "caution"
        : simplifiedAssetCount > 0 ? "simplified" : "normal"
  };
}

/**
 * Deterministic, intentionally topology-incomplete fixture for renderer and
 * interaction-budget checks. It is kept in the app package so the simulation
 * engine's browser bundle does not pay for release-only stress data.
 */
export function createCustomSiteStressFixture(
  environment: SiteEnvironment = "equatorial",
  assetCount = 160
): SiteDesignDocument {
  const design = createBlankSiteDesign(environment, {
    id: `stress-${environment}-${assetCount}`,
    name: `${environment === "polar" ? "Polar" : "Equatorial"} render stress · ${assetCount} assets`,
    timestamp: "2026-07-29T00:00:00.000Z"
  });
  const definitions = siteAssetsForEnvironment(environment)
    .filter((definition) => definition.multiplicity === "multiple");
  const chainDefinition = definitions.find((definition) =>
    definition.ports.some((port) => port.direction !== "output") &&
    definition.ports.some((port) => port.direction !== "input")
  ) ?? definitions[0]!;
  const safeCount = Math.max(0, Math.min(500, Math.trunc(assetCount)));
  const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount * 1.6)));
  const spacing = 10;
  const rows = Math.ceil(safeCount / columns);

  design.assets = Array.from({ length: safeCount }, (_, index): SiteAssetInstance => {
    const definition = chainDefinition;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: `stress-asset-${String(index + 1).padStart(3, "0")}`,
      kind: definition.kind,
      name: `${definition.label} ${index + 1}`,
      transform: {
        xM: (column - (columns - 1) / 2) * spacing,
        zM: (row - (rows - 1) / 2) * spacing,
        headingDeg: (index % 4) * 90
      },
      enabled: true,
      configuration: {}
    };
  });
  const outputPort = chainDefinition.ports.find((port) =>
    port.direction === "output" || port.direction === "bidirectional"
  );
  const inputPort = chainDefinition.ports.find((port) =>
    port.direction === "input" || port.direction === "bidirectional"
  );
  design.connections = outputPort === undefined || inputPort === undefined
    ? []
    : design.assets.slice(1).map((asset, index): SiteConnection => {
        const previous = design.assets[index]!;
        return {
          id: `stress-route-${String(index + 1).padStart(3, "0")}`,
          kind: outputPort.kind,
          from: { assetId: previous.id, portId: outputPort.id },
          to: { assetId: asset.id, portId: inputPort.id },
          route: [
            {
              xM: (previous.transform.xM + asset.transform.xM) / 2,
              zM: (previous.transform.zM + asset.transform.zM) / 2
            }
          ],
          configuration: {}
        };
      });
  return design;
}
