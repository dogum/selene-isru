import { sitePortConnectionCompatibility, siteConnectionLengthM } from "./connections";
import { canonicalSiteDesign } from "./schema";
import type {
  SiteDesignDocument,
  SiteDesignEvaluation,
  SiteDesignFinding,
  SitePowerInterpretation
} from "./types";
import { validateSiteDesign } from "./validate";

const SEVERITY_ORDER = {
  error: 0,
  caution: 1,
  info: 2
} as const;

function powerArchitectureForKind(
  kind: string
): "auto" | "solar" | "nuclear" | null {
  if (kind === "equatorial.power-hub") {
    return "auto";
  }
  if (kind === "polar.power-towers") {
    return "solar";
  }
  if (kind === "polar.nuclear-station") {
    return "nuclear";
  }
  return null;
}

function sortFindings(findings: SiteDesignFinding[]): SiteDesignFinding[] {
  return findings.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    a.id.localeCompare(b.id)
  );
}

export function compileSiteDesign(
  design: SiteDesignDocument
): Omit<SiteDesignEvaluation, "baseResult"> {
  const normalizedDesign = canonicalSiteDesign(design);
  const findings = validateSiteDesign(normalizedDesign);
  const assetsById = new Map(
    normalizedDesign.assets.map((asset) => [asset.id, asset])
  );
  const findingErrorEntities = new Set(
    findings
      .filter((finding) => finding.severity === "error")
      .flatMap((finding) => finding.entityIds)
  );
  const compatibleConnectionIds = new Set(
    normalizedDesign.connections
      .filter((connection) =>
        sitePortConnectionCompatibility(
          normalizedDesign,
          connection.from,
          connection.to,
          connection.id
        ).compatible &&
        !findingErrorEntities.has(connection.id)
      )
      .map((connection) => connection.id)
  );
  const activeConnectionIds = new Set(
    normalizedDesign.connections
      .filter((connection) =>
        compatibleConnectionIds.has(connection.id) &&
        assetsById.get(connection.from.assetId)?.enabled === true &&
        assetsById.get(connection.to.assetId)?.enabled === true
      )
      .map((connection) => connection.id)
  );
  const connectedAssetIds = new Set<string>();
  const connectedPowerArchitectures = new Set<"auto" | "solar" | "nuclear">();

  for (const connection of normalizedDesign.connections) {
    if (!activeConnectionIds.has(connection.id)) {
      continue;
    }
    connectedAssetIds.add(connection.from.assetId);
    connectedAssetIds.add(connection.to.assetId);
    if (connection.kind !== "power") {
      continue;
    }
    const source = normalizedDesign.assets.find((asset) =>
      asset.id === connection.from.assetId
    );
    const architecture = source === undefined
      ? null
      : powerArchitectureForKind(source.kind);
    if (architecture !== null) {
      connectedPowerArchitectures.add(architecture);
    }
  }

  let powerStrategy: SitePowerInterpretation = "unavailable";
  if (
    connectedPowerArchitectures.has("solar") &&
    connectedPowerArchitectures.has("nuclear")
  ) {
    powerStrategy = "conflict";
    findings.push({
      id: "evaluation.power-source-conflict",
      severity: "error",
      message:
        "Solar and nuclear sources both feed the active graph without an explicit hybrid or backup interpretation.",
      entityIds: normalizedDesign.connections
        .filter((connection) =>
          connection.kind === "power" &&
          activeConnectionIds.has(connection.id)
        )
        .map((connection) => connection.id),
      suggestedAction:
        "Keep one active source route until hybrid and backup dispatch are modeled."
    });
  } else if (connectedPowerArchitectures.has("solar")) {
    powerStrategy = "solar";
  } else if (connectedPowerArchitectures.has("nuclear")) {
    powerStrategy = "nuclear";
  } else if (connectedPowerArchitectures.has("auto")) {
    powerStrategy = "auto";
  }

  if (normalizedDesign.assets.length > 0) {
    findings.push({
      id: "evaluation.capacity-boundary",
      severity: "info",
      message:
        "Topology gates output, but equipment quantity and installed-capacity limits are not yet applied.",
      entityIds: [],
      suggestedAction:
        "Treat the current result as a continuously sized requirement until installed-capacity models are added."
    });
  }

  sortFindings(findings);
  const topologyValid = !findings.some((finding) => finding.severity === "error");
  const plannedTargetKgPerDay = Math.max(
    0,
    normalizedDesign.params.targetKgPerDay
  );
  const firstError = findings.find((finding) => finding.severity === "error");

  return {
    normalizedDesign,
    effectiveParams: {
      ...normalizedDesign.params,
      site: normalizedDesign.environment
    },
    plannedTargetKgPerDay,
    achievableOutputKgPerDay: topologyValid ? plannedTargetKgPerDay : 0,
    topologyValid,
    powerStrategy,
    bottleneck: firstError === undefined
      ? null
      : {
          kind: "topology",
          label: firstError.message,
          entityIds: [...firstError.entityIds]
        },
    assetEvaluations: normalizedDesign.assets.map((asset) => ({
      assetId: asset.id,
      connected: connectedAssetIds.has(asset.id),
      operational:
        topologyValid &&
        asset.enabled &&
        connectedAssetIds.has(asset.id),
      capacityStatus: "not-modeled"
    })),
    connectionEvaluations: normalizedDesign.connections.map((connection) => {
      const compatible = compatibleConnectionIds.has(connection.id);
      return {
        connectionId: connection.id,
        compatible,
        operational: topologyValid && activeConnectionIds.has(connection.id),
        lengthM: siteConnectionLengthM(normalizedDesign, connection)
      };
    }),
    findings
  };
}
