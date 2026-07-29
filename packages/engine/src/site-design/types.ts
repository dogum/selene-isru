import type {
  PowerStrategy,
  SimParams,
  SimResult,
  SiteMode
} from "../types";

export type WorkspaceMode = "authored" | "custom";
export type SiteEnvironment = SiteMode;
export type SiteViewMode = "planner" | "explore";
export type SiteConnectionKind = "material" | "power" | "construction" | "logistics";
export type SitePortDirection = "input" | "output" | "bidirectional";
export type SiteAssetMultiplicity = "single" | "multiple";
export type SiteAssetModelMaturity =
  | "REFERENCE DATA"
  | "LITERATURE-DERIVED"
  | "SIMPLIFIED CORRELATION"
  | "DESIGN ASSUMPTION";
export type SiteDesignFindingSeverity = "error" | "caution" | "info";
export type SiteConfigurationValue = number | string | boolean;

export interface SiteFootprintDefinition {
  widthM: number;
  depthM: number;
  clearanceM?: number;
}

export interface SitePortDefinition {
  id: string;
  label: string;
  kind: SiteConnectionKind;
  direction: SitePortDirection;
  streams: readonly string[];
  maxConnections?: number;
}

export type SiteCapacityMetric =
  | "product-throughput"
  | "electrical-output";

export interface SiteAssetCapacityModel {
  groupId: string;
  groupLabel: string;
  metric: SiteCapacityMetric;
  rating: number;
  unit: "kg/day" | "W";
  requiredPortIds: readonly string[];
  quantityMode: "instances" | "bank";
  quantityKey?: string;
  maxQuantity?: number;
  modelMaturity: SiteAssetModelMaturity;
  basis: string;
  evidence: string;
}

export interface SiteAssetDefinition {
  kind: string;
  label: string;
  category: string;
  purpose: string;
  modelMaturity: SiteAssetModelMaturity;
  compatibleEnvironments: readonly SiteEnvironment[];
  footprint: SiteFootprintDefinition;
  multiplicity: SiteAssetMultiplicity;
  ports: readonly SitePortDefinition[];
  capacityModel?: SiteAssetCapacityModel;
}

export interface SiteAssetInstance {
  id: string;
  kind: string;
  name: string;
  transform: {
    xM: number;
    zM: number;
    headingDeg: number;
  };
  enabled: boolean;
  configuration: Record<string, SiteConfigurationValue>;
}

export interface SitePortRef {
  assetId: string;
  portId: string;
}

export interface SiteRoutePoint {
  xM: number;
  zM: number;
}

export interface SiteConnection {
  id: string;
  kind: SiteConnectionKind;
  from: SitePortRef;
  to: SitePortRef;
  route: SiteRoutePoint[];
  configuration: Record<string, SiteConfigurationValue>;
}

export interface SiteAnnotation {
  id: string;
  label: string;
  xM: number;
  zM: number;
}

export interface PlannerDocumentState {
  gridSnapM: 0 | 1 | 5 | 10;
  rotationSnapDeg: 0 | 5 | 15 | 45 | 90;
  northDeg: number;
  annotations: SiteAnnotation[];
}

export interface SiteDesignDocument {
  schema: "selene-site-design";
  version: 1;
  id: string;
  name: string;
  environment: SiteEnvironment;
  params: SimParams;
  assets: SiteAssetInstance[];
  connections: SiteConnection[];
  planner: PlannerDocumentState;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
}

export interface SiteDesignFinding {
  id: string;
  severity: SiteDesignFindingSeverity;
  message: string;
  entityIds: string[];
  suggestedAction?: string;
  modelMaturity?: SiteAssetModelMaturity;
  evidence?: string;
}

export interface SiteDesignParseResult {
  document: SiteDesignDocument | null;
  findings: SiteDesignFinding[];
}

export type SitePowerInterpretation =
  | PowerStrategy
  | "conflict"
  | "unavailable";

export interface SiteBottleneck {
  kind: "topology" | "capacity";
  label: string;
  entityIds: string[];
  required?: number;
  installed?: number;
  unit?: "kg/day" | "W";
}

export interface SiteCapacityGroupEvaluation {
  id: string;
  label: string;
  metric: SiteCapacityMetric;
  unit: "kg/day" | "W";
  required: number;
  installed: number;
  available: number;
  margin: number;
  utilization: number;
  assetIds: string[];
  modelMaturity: SiteAssetModelMaturity;
  basis: string;
  evidence: string;
}

export interface SiteAssetEvaluation {
  assetId: string;
  operational: boolean;
  connected: boolean;
  capacityStatus: "modeled" | "not-modeled";
  capacityGroupId: string | null;
  rating: number | null;
  quantity: number;
  installedCapacity: number | null;
  unit: "kg/day" | "W" | null;
  requiredDuty: number | null;
  installedGroupCapacity: number | null;
  margin: number | null;
  utilization: number | null;
  modelMaturity: SiteAssetModelMaturity | null;
  basis: string | null;
  evidence: string | null;
}

export type SiteConnectionModelStatus =
  | "power-cable"
  | "granular-haul"
  | "measured-only";

export interface SiteConnectionEvaluation {
  connectionId: string;
  operational: boolean;
  compatible: boolean;
  lengthM: number;
  modelStatus: SiteConnectionModelStatus;
  cableMassKg: number;
  powerLossW: number;
  transportPowerW: number;
  utilization: number | null;
  equation: string | null;
  assumption: string;
  evidence: string;
}

export interface SiteSpatialEvaluation {
  cableMassKg: number;
  cableLossW: number;
  transportPowerW: number;
  supplementalLoadW: number;
}

export interface SiteDesignEvaluation {
  normalizedDesign: SiteDesignDocument;
  effectiveParams: SimParams;
  baseResult: SimResult;
  achievedResult: SimResult;
  plannedTargetKgPerDay: number;
  achievableOutputKgPerDay: number;
  topologyValid: boolean;
  powerStrategy: SitePowerInterpretation;
  bottleneck: SiteBottleneck | null;
  capacityGroups: SiteCapacityGroupEvaluation[];
  installedThroughputKgPerDay: number;
  requiredGridPowerW: number;
  installedPowerW: number;
  deliveredPowerW: number;
  spatial: SiteSpatialEvaluation;
  assetEvaluations: SiteAssetEvaluation[];
  connectionEvaluations: SiteConnectionEvaluation[];
  findings: SiteDesignFinding[];
}

export interface SiteDesignFixtureOptions {
  id?: string;
  name?: string;
  timestamp?: string;
}
