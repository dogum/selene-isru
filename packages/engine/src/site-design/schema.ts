import { normalizeParams } from "../normalize";
import type { SimParams } from "../types";
import type {
  PlannerDocumentState,
  SiteAnnotation,
  SiteAssetInstance,
  SiteConfigurationValue,
  SiteConnection,
  SiteConnectionKind,
  SiteDesignDocument,
  SiteDesignFinding,
  SiteDesignParseResult,
  SiteEnvironment,
  SiteRoutePoint
} from "./types";

const FALLBACK_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const MAX_TEXT = 120;
const MAX_ENTITIES = 500;
const MAX_ROUTE_POINTS = 256;
const MAX_CONFIGURATION_KEYS = 64;
const SITE_BOUND_M = 500;
const CONNECTION_KINDS = new Set<SiteConnectionKind>([
  "material",
  "power",
  "construction",
  "logistics"
]);
const GRID_SNAPS = new Set([0, 1, 5, 10]);
const ROTATION_SNAPS = new Set([0, 5, 15, 45, 90]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, MAX_TEXT)
    : fallback;
}

function heading(value: unknown): number {
  if (!finite(value)) {
    return 0;
  }
  return ((value % 360) + 360) % 360;
}

function boundedCoordinate(value: unknown): number {
  if (!finite(value)) {
    return 0;
  }
  return Math.max(-SITE_BOUND_M, Math.min(SITE_BOUND_M, value));
}

function configuration(value: unknown): Record<string, SiteConfigurationValue> {
  if (!isRecord(value)) {
    return {};
  }
  const out: Record<string, SiteConfigurationValue> = {};
  for (const key of Object.keys(value).sort().slice(0, MAX_CONFIGURATION_KEYS)) {
    const item = value[key];
    if (
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      out[key] = typeof item === "string" ? item.slice(0, MAX_TEXT) : item;
    }
  }
  return out;
}

function finding(
  id: string,
  severity: SiteDesignFinding["severity"],
  message: string,
  entityIds: string[] = []
): SiteDesignFinding {
  return { id, severity, message, entityIds };
}

function parseAsset(value: unknown, index: number, findings: SiteDesignFinding[]): SiteAssetInstance | null {
  if (!isRecord(value)) {
    findings.push(finding(`schema.asset-${index}`, "error", "An asset entry is not an object."));
    return null;
  }
  const id = text(value.id, "");
  const kind = text(value.kind, "");
  if (id.length === 0 || kind.length === 0) {
    findings.push(finding(`schema.asset-${index}`, "error", "An asset requires a stable id and catalog kind."));
    return null;
  }
  const transform = isRecord(value.transform) ? value.transform : {};
  if (!finite(transform.xM) || !finite(transform.zM) || !finite(transform.headingDeg)) {
    findings.push(finding(
      `schema.asset-transform-${index}`,
      "error",
      "An asset transform requires finite X, Z, and heading values.",
      [id]
    ));
  } else if (
    Math.abs(transform.xM) > SITE_BOUND_M ||
    Math.abs(transform.zM) > SITE_BOUND_M
  ) {
    findings.push(finding(
      `schema.asset-bounds-${index}`,
      "caution",
      `Asset coordinates were clamped to the ${SITE_BOUND_M} m planning boundary.`,
      [id]
    ));
  }
  return {
    id,
    kind,
    name: text(value.name, kind),
    transform: {
      xM: boundedCoordinate(transform.xM),
      zM: boundedCoordinate(transform.zM),
      headingDeg: heading(transform.headingDeg)
    },
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    configuration: configuration(value.configuration)
  };
}

function parseRoute(
  value: unknown,
  connectionIndex: number,
  findings: SiteDesignFinding[]
): SiteRoutePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, MAX_ROUTE_POINTS).flatMap((point, pointIndex) => {
    if (!isRecord(point) || !finite(point.xM) || !finite(point.zM)) {
      findings.push(finding(
        `schema.connection-route-${connectionIndex}-${pointIndex}`,
        "error",
        "A connection route point requires finite X and Z values."
      ));
      return [];
    }
    if (Math.abs(point.xM) > SITE_BOUND_M || Math.abs(point.zM) > SITE_BOUND_M) {
      findings.push(finding(
        `schema.connection-route-bounds-${connectionIndex}-${pointIndex}`,
        "caution",
        `A connection route point was clamped to the ${SITE_BOUND_M} m planning boundary.`
      ));
    }
    return [{ xM: boundedCoordinate(point.xM), zM: boundedCoordinate(point.zM) }];
  });
}

function parseConnection(
  value: unknown,
  index: number,
  findings: SiteDesignFinding[]
): SiteConnection | null {
  if (!isRecord(value)) {
    findings.push(finding(`schema.connection-${index}`, "error", "A connection entry is not an object."));
    return null;
  }
  const id = text(value.id, "");
  const from = isRecord(value.from) ? value.from : {};
  const to = isRecord(value.to) ? value.to : {};
  const kind = value.kind;
  if (
    id.length === 0 ||
    !CONNECTION_KINDS.has(kind as SiteConnectionKind) ||
    typeof from.assetId !== "string" ||
    typeof from.portId !== "string" ||
    typeof to.assetId !== "string" ||
    typeof to.portId !== "string"
  ) {
    findings.push(finding(
      `schema.connection-${index}`,
      "error",
      "A connection requires an id, supported kind, and complete endpoint references."
    ));
    return null;
  }
  return {
    id,
    kind: kind as SiteConnectionKind,
    from: {
      assetId: text(from.assetId, ""),
      portId: text(from.portId, "")
    },
    to: {
      assetId: text(to.assetId, ""),
      portId: text(to.portId, "")
    },
    route: parseRoute(value.route, index, findings),
    configuration: configuration(value.configuration)
  };
}

function parseAnnotation(value: unknown, index: number): SiteAnnotation | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = text(value.id, `annotation-${index + 1}`);
  return {
    id,
    label: text(value.label, "Planning note"),
    xM: boundedCoordinate(value.xM),
    zM: boundedCoordinate(value.zM)
  };
}

function parsePlanner(value: unknown): PlannerDocumentState {
  const planner = isRecord(value) ? value : {};
  const gridSnap = finite(planner.gridSnapM) && GRID_SNAPS.has(planner.gridSnapM)
    ? planner.gridSnapM as PlannerDocumentState["gridSnapM"]
    : 5;
  const rotationSnap = finite(planner.rotationSnapDeg) && ROTATION_SNAPS.has(planner.rotationSnapDeg)
    ? planner.rotationSnapDeg as PlannerDocumentState["rotationSnapDeg"]
    : 15;
  const annotations = Array.isArray(planner.annotations)
    ? planner.annotations.slice(0, MAX_ENTITIES).flatMap((item, index) => {
        const parsed = parseAnnotation(item, index);
        return parsed === null ? [] : [parsed];
      })
    : [];
  return {
    gridSnapM: gridSnap,
    rotationSnapDeg: rotationSnap,
    northDeg: heading(planner.northDeg),
    annotations
  };
}

function params(value: unknown, environment: SiteEnvironment): SimParams {
  const patch = isRecord(value) ? value as Partial<SimParams> : {};
  return { ...normalizeParams(patch).params, site: environment };
}

export function parseSiteDesign(value: unknown): SiteDesignParseResult {
  const findings: SiteDesignFinding[] = [];
  if (!isRecord(value)) {
    return {
      document: null,
      findings: [finding("schema.document", "error", "The site design must be a JSON object.")]
    };
  }
  if (value.schema !== "selene-site-design") {
    return {
      document: null,
      findings: [finding("schema.identifier", "error", "This is not a SELENE site-design document.")]
    };
  }
  if (value.version !== 1) {
    return {
      document: null,
      findings: [finding("schema.version", "error", "The site-design version is not supported by this app.")]
    };
  }
  if (value.environment !== "equatorial" && value.environment !== "polar") {
    return {
      document: null,
      findings: [finding("schema.environment", "error", "The site environment must be equatorial or polar.")]
    };
  }
  const environment = value.environment;
  if (!Array.isArray(value.assets) || !Array.isArray(value.connections)) {
    return {
      document: null,
      findings: [finding("schema.entities", "error", "The site design requires asset and connection arrays.")]
    };
  }
  const assets = value.assets.slice(0, MAX_ENTITIES).flatMap((item, index) => {
    const parsed = parseAsset(item, index, findings);
    return parsed === null ? [] : [parsed];
  });
  const connections = value.connections.slice(0, MAX_ENTITIES).flatMap((item, index) => {
    const parsed = parseConnection(item, index, findings);
    return parsed === null ? [] : [parsed];
  });
  const id = text(value.id, "");
  if (id.length === 0) {
    findings.push(finding("schema.id", "error", "The site design requires a stable id."));
  }
  return {
    document: {
      schema: "selene-site-design",
      version: 1,
      id: id || "unresolved-site-design",
      name: text(value.name, "Untitled custom site"),
      environment,
      params: params(value.params, environment),
      assets,
      connections,
      planner: parsePlanner(value.planner),
      createdAt: text(value.createdAt, FALLBACK_TIMESTAMP),
      updatedAt: text(value.updatedAt, FALLBACK_TIMESTAMP),
      ...(typeof value.appVersion === "string"
        ? { appVersion: value.appVersion.slice(0, MAX_TEXT) }
        : {})
    },
    findings
  };
}

function sortedConfiguration(
  input: Record<string, SiteConfigurationValue>
): Record<string, SiteConfigurationValue> {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
}

export function canonicalSiteDesign(design: SiteDesignDocument): SiteDesignDocument {
  return {
    ...design,
    params: { ...design.params, site: design.environment },
    assets: design.assets
      .map((item) => ({
        ...item,
        transform: {
          xM: boundedCoordinate(item.transform.xM),
          zM: boundedCoordinate(item.transform.zM),
          headingDeg: heading(item.transform.headingDeg)
        },
        configuration: sortedConfiguration(item.configuration)
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    connections: design.connections
      .map((item) => ({
        ...item,
        route: item.route.map((point) => ({
          xM: boundedCoordinate(point.xM),
          zM: boundedCoordinate(point.zM)
        })),
        configuration: sortedConfiguration(item.configuration)
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    planner: {
      ...design.planner,
      northDeg: heading(design.planner.northDeg),
      annotations: [...design.planner.annotations].sort((a, b) => a.id.localeCompare(b.id))
    }
  };
}

export function serializeSiteDesign(design: SiteDesignDocument): string {
  return JSON.stringify(canonicalSiteDesign(design), null, 2);
}
