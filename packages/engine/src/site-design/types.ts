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
  kind: "topology";
  label: string;
  entityIds: string[];
}

export interface SiteAssetEvaluation {
  assetId: string;
  operational: boolean;
  connected: boolean;
  capacityStatus: "not-modeled";
}

export interface SiteConnectionEvaluation {
  connectionId: string;
  operational: boolean;
  compatible: boolean;
  lengthM: number;
}

export interface SiteDesignEvaluation {
  normalizedDesign: SiteDesignDocument;
  effectiveParams: SimParams;
  baseResult: SimResult;
  plannedTargetKgPerDay: number;
  achievableOutputKgPerDay: number;
  topologyValid: boolean;
  powerStrategy: SitePowerInterpretation;
  bottleneck: SiteBottleneck | null;
  assetEvaluations: SiteAssetEvaluation[];
  connectionEvaluations: SiteConnectionEvaluation[];
  findings: SiteDesignFinding[];
}

export interface SiteDesignFixtureOptions {
  id?: string;
  name?: string;
  timestamp?: string;
}
