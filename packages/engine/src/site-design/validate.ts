import {
  REQUIRED_SITE_CONNECTIONS,
  siteAssetDefinition
} from "./catalog";
import type { RequiredSiteConnection } from "./catalog";
import type {
  SiteAssetDefinition,
  SiteAssetInstance,
  SiteConnection,
  SiteDesignDocument,
  SiteDesignFinding,
  SitePortDefinition
} from "./types";

function finding(
  id: string,
  severity: SiteDesignFinding["severity"],
  message: string,
  entityIds: string[] = [],
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

function endpoint(
  asset: SiteAssetInstance | undefined,
  portId: string
): { definition: SiteAssetDefinition; port: SitePortDefinition } | null {
  if (asset === undefined) {
    return null;
  }
  const definition = siteAssetDefinition(asset.kind);
  const port = definition?.ports.find((candidate) => candidate.id === portId);
  return definition === null || port === undefined ? null : { definition, port };
}

function directionsConnect(from: SitePortDefinition, to: SitePortDefinition): boolean {
  const canOutput = from.direction === "output" || from.direction === "bidirectional";
  const canInput = to.direction === "input" || to.direction === "bidirectional";
  return canOutput && canInput;
}

function streamsConnect(from: SitePortDefinition, to: SitePortDefinition): boolean {
  return from.streams.some((stream) => to.streams.includes(stream));
}

function duplicateIds(items: Array<{ id: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.add(item.id);
    }
    seen.add(item.id);
  }
  return [...duplicates].sort();
}

function validatesRequiredConnection(
  document: SiteDesignDocument,
  connection: SiteConnection,
  required: RequiredSiteConnection,
  assets: Map<string, SiteAssetInstance>
): boolean {
  if (connection.kind !== required.kind) {
    return false;
  }
  const from = assets.get(connection.from.assetId);
  const to = assets.get(connection.to.assetId);
  return (
    from?.enabled === true &&
    to?.enabled === true &&
    required.fromKinds.includes(from.kind) &&
    connection.from.portId === required.fromPortId &&
    required.toKinds.includes(to.kind) &&
    connection.to.portId === required.toPortId
  );
}

export function validateSiteDesign(document: SiteDesignDocument): SiteDesignFinding[] {
  const findings: SiteDesignFinding[] = [];
  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]));

  for (const id of duplicateIds(document.assets)) {
    findings.push(finding(
      `asset.duplicate-id.${id}`,
      "error",
      `More than one asset uses the id "${id}".`,
      [id],
      "Assign a unique stable id to every asset instance."
    ));
  }
  for (const id of duplicateIds(document.connections)) {
    findings.push(finding(
      `connection.duplicate-id.${id}`,
      "error",
      `More than one connection uses the id "${id}".`,
      [id],
      "Assign a unique stable id to every connection."
    ));
  }

  const enabledByKind = new Map<string, SiteAssetInstance[]>();
  for (const asset of document.assets) {
    const definition = siteAssetDefinition(asset.kind);
    if (definition === null) {
      findings.push(finding(
        `asset.unknown-kind.${asset.id}`,
        "error",
        `"${asset.name}" uses an equipment kind this app does not recognize.`,
        [asset.id],
        "Replace the unresolved asset or open the design in a compatible app version."
      ));
      continue;
    }
    if (!definition.compatibleEnvironments.includes(document.environment)) {
      findings.push(finding(
        `asset.environment.${asset.id}`,
        "error",
        `${definition.label} is not compatible with the ${document.environment} environment.`,
        [asset.id],
        "Use equipment from the active environment catalog."
      ));
    }
    if (asset.enabled) {
      const group = enabledByKind.get(asset.kind) ?? [];
      group.push(asset);
      enabledByKind.set(asset.kind, group);
    }
  }

  for (const [kind, instances] of enabledByKind) {
    const definition = siteAssetDefinition(kind);
    if (definition?.multiplicity === "single" && instances.length > 1) {
      findings.push(finding(
        `asset.multiplicity.${kind}`,
        "error",
        `${definition.label} is a single-site system, but ${instances.length} enabled instances are present.`,
        instances.map((asset) => asset.id),
        "Disable or remove the extra instances."
      ));
    }
  }

  const portUse = new Map<string, number>();
  const validConnectionIds = new Set<string>();
  for (const connection of document.connections) {
    const fromAsset = assetsById.get(connection.from.assetId);
    const toAsset = assetsById.get(connection.to.assetId);
    const from = endpoint(fromAsset, connection.from.portId);
    const to = endpoint(toAsset, connection.to.portId);
    if (from === null || to === null) {
      findings.push(finding(
        `connection.endpoint.${connection.id}`,
        "error",
        "A connection references a missing asset or port.",
        [connection.id, connection.from.assetId, connection.to.assetId],
        "Reconnect the route to ports that exist in the current catalog."
      ));
      continue;
    }
    if (fromAsset?.enabled !== true || toAsset?.enabled !== true) {
      findings.push(finding(
        `connection.disabled.${connection.id}`,
        "caution",
        "A connection terminates at disabled equipment and is inactive.",
        [connection.id, connection.from.assetId, connection.to.assetId]
      ));
      continue;
    }
    if (
      connection.kind !== from.port.kind ||
      connection.kind !== to.port.kind ||
      !directionsConnect(from.port, to.port) ||
      !streamsConnect(from.port, to.port)
    ) {
      findings.push(finding(
        `connection.incompatible.${connection.id}`,
        "error",
        "The selected ports do not have compatible kind, direction, and stream contracts.",
        [connection.id, connection.from.assetId, connection.to.assetId],
        "Connect an output port to a compatible input port."
      ));
      continue;
    }
    validConnectionIds.add(connection.id);
    for (const ref of [connection.from, connection.to]) {
      const key = `${ref.assetId}:${ref.portId}`;
      portUse.set(key, (portUse.get(key) ?? 0) + 1);
    }
  }

  for (const asset of document.assets) {
    const definition = siteAssetDefinition(asset.kind);
    if (definition === null) {
      continue;
    }
    for (const port of definition.ports) {
      const count = portUse.get(`${asset.id}:${port.id}`) ?? 0;
      if (port.maxConnections !== undefined && count > port.maxConnections) {
        findings.push(finding(
          `port.multiplicity.${asset.id}.${port.id}`,
          "error",
          `${asset.name} port "${port.label}" allows ${port.maxConnections} connection${port.maxConnections === 1 ? "" : "s"}, but ${count} are present.`,
          [asset.id],
          "Remove the extra connection or use another compatible equipment instance."
        ));
      }
    }
  }

  const validConnections = document.connections.filter((connection) =>
    validConnectionIds.has(connection.id)
  );
  for (const required of REQUIRED_SITE_CONNECTIONS[document.environment]) {
    if (!validConnections.some((connection) =>
      validatesRequiredConnection(document, connection, required, assetsById)
    )) {
      findings.push(finding(
        `topology.required.${required.id}`,
        "error",
        `Required process step is open: ${required.label}.`,
        [],
        "Place compatible equipment and connect the required ports."
      ));
    }
  }

  const connectedAssets = new Set<string>();
  for (const connection of validConnections) {
    connectedAssets.add(connection.from.assetId);
    connectedAssets.add(connection.to.assetId);
  }
  for (const asset of document.assets) {
    if (asset.enabled && !connectedAssets.has(asset.id)) {
      findings.push(finding(
        `asset.orphan.${asset.id}`,
        "info",
        `${asset.name} is enabled but not connected to the site graph.`,
        [asset.id],
        "Connect the asset or disable it until it participates in the design."
      ));
    }
  }

  if (document.assets.length === 0) {
    findings.push(finding(
      "design.blank",
      "info",
      "This is a blank planning surface. Add equipment to begin the site design."
    ));
  }

  const severityOrder = { error: 0, caution: 1, info: 2 } as const;
  return findings.sort((a, b) =>
    severityOrder[a.severity] - severityOrder[b.severity] || a.id.localeCompare(b.id)
  );
}
