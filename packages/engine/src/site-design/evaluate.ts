import { PHYSICAL_CONSTANTS } from "../constants";
import type {
  SimResult,
  SimulationOptions
} from "../types";
import {
  siteAssetDefinition,
  siteAssetsForEnvironment
} from "./catalog";
import {
  resolveSitePort,
  siteConnectionLengthM,
  sitePortConnectionCompatibility
} from "./connections";
import { canonicalSiteDesign } from "./schema";
import type {
  SiteAssetInstance,
  SiteAssetCapacityModel,
  SiteBottleneck,
  SiteCapacityGroupEvaluation,
  SiteConnection,
  SiteConnectionEvaluation,
  SiteConnectionModelStatus,
  SiteDesignDocument,
  SiteDesignEvaluation,
  SiteDesignFinding,
  SitePowerInterpretation,
  SiteSpatialEvaluation
} from "./types";
import { validateSiteDesign } from "./validate";

const SEVERITY_ORDER = {
  error: 0,
  caution: 1,
  info: 2
} as const;

const POWER_CABLE = {
  voltageV: 1_500,
  conductorAreaM2: 70e-6,
  resistivityOhmM: 2.82e-8,
  conductorDensityKgPerM3: 2_700,
  installedMassFactor: 1.25
} as const;

const GRANULAR_HAUL = {
  rollingResistanceCoefficient: 0.05,
  roundTripMassRatio: 9
} as const;

const POWER_CABLE_EQUATION =
  "R = 2ρL/A; P_loss = (P_load/V)²R; P_source = P_load + P_loss; m = 2LAρ_m × 1.25";
const POWER_CABLE_EVIDENCE =
  "Screening 1.5 kV DC aluminum feeder: 70 mm² conductors, 2.82e-8 Ω·m resistivity, 2,700 kg/m³ density, and 25% installed-mass allowance.";
const GRANULAR_HAUL_EQUATION =
  "E = m_feed × L × Crr × g_lunar × 9 / η_drive";
const GRANULAR_HAUL_EVIDENCE =
  "Screening rolling-resistance work model with Crr 0.05 and a loaded-plus-empty round-trip mass ratio of 9; grade, trafficability, and dispatch queues are excluded.";

export interface CompiledSiteDesign {
  normalizedDesign: SiteDesignDocument;
  effectiveParams: SiteDesignDocument["params"];
  plannedTargetKgPerDay: number;
  topologyValid: boolean;
  powerStrategy: SitePowerInterpretation;
  topologyBottleneck: SiteBottleneck | null;
  connectedAssetIds: Set<string>;
  capacityReadyAssetIds: Set<string>;
  compatibleConnectionIds: Set<string>;
  activeConnectionIds: Set<string>;
  findings: SiteDesignFinding[];
}

export interface SiteDesignEvaluationPlan {
  evaluation: Omit<SiteDesignEvaluation, "baseResult" | "achievedResult">;
  achievedSimulationOptions: SimulationOptions;
}

interface PowerRoute {
  connectionId: string;
  ratingShareW: number;
  deliveredCapacityW: number;
  resistanceOhm: number;
  cableMassKg: number;
}

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

function connectionTouchesPort(
  connection: SiteConnection,
  assetId: string,
  portId: string
): boolean {
  return (
    connection.from.assetId === assetId &&
    connection.from.portId === portId
  ) || (
    connection.to.assetId === assetId &&
    connection.to.portId === portId
  );
}

function capacityPortsReady(
  document: SiteDesignDocument,
  asset: SiteAssetInstance,
  activeConnectionIds: Set<string>
): boolean {
  const model = siteAssetDefinition(asset.kind)?.capacityModel;
  return (
    asset.enabled &&
    model !== undefined &&
    model.requiredPortIds.every((portId) =>
      document.connections.some((connection) =>
        activeConnectionIds.has(connection.id) &&
        connectionTouchesPort(connection, asset.id, portId)
      )
    )
  );
}

function capacityQuantity(
  asset: SiteAssetInstance,
  model: SiteAssetCapacityModel
): number {
  if (model.quantityMode === "instances" || model.quantityKey === undefined) {
    return 1;
  }
  const configured = asset.configuration[model.quantityKey];
  const quantity = typeof configured === "number" && Number.isFinite(configured)
    ? Math.trunc(configured)
    : 1;
  return Math.max(1, Math.min(model.maxQuantity ?? 8, quantity));
}

function cableResistanceOhm(lengthM: number): number {
  return (
    2 *
    POWER_CABLE.resistivityOhmM *
    lengthM /
    POWER_CABLE.conductorAreaM2
  );
}

function cableMassKg(lengthM: number): number {
  return (
    2 *
    lengthM *
    POWER_CABLE.conductorAreaM2 *
    POWER_CABLE.conductorDensityKgPerM3 *
    POWER_CABLE.installedMassFactor
  );
}

function deliveredPowerW(nameplateW: number, resistanceOhm: number): number {
  const coefficient = resistanceOhm / POWER_CABLE.voltageV ** 2;
  if (coefficient <= 1e-15) {
    return nameplateW;
  }
  return (
    Math.sqrt(1 + 4 * coefficient * nameplateW) - 1
  ) / (2 * coefficient);
}

function granularHaulRoute(
  document: SiteDesignDocument,
  connection: SiteConnection
): boolean {
  const from = resolveSitePort(document, connection.from);
  const to = resolveSitePort(document, connection.to);
  if (from === null || to === null || connection.kind !== "material") {
    return false;
  }
  const sharedStreams = from.port.streams.filter((stream) =>
    to.port.streams.includes(stream)
  );
  return (
    to.asset.kind === "equatorial.mre-reactor" &&
    sharedStreams.includes("regolith")
  ) || (
    to.asset.kind === "polar.sublimation-camp" &&
    sharedStreams.includes("icy-regolith")
  );
}

function connectionModelStatus(
  document: SiteDesignDocument,
  connection: SiteConnection
): SiteConnectionModelStatus {
  if (connection.kind === "power") {
    return "power-cable";
  }
  return granularHaulRoute(document, connection)
    ? "granular-haul"
    : "measured-only";
}

function connectionAssumption(status: SiteConnectionModelStatus): string {
  if (status === "power-cable") {
    return "X/Z route length; level two-conductor DC feeder; terrain-following length and switchgear are excluded.";
  }
  if (status === "granular-haul") {
    return "X/Z one-way route length with a loaded outbound and empty return traversal.";
  }
  return "Length is measured from the persisted X/Z route, but this connection kind has no engineering penalty model yet.";
}

function connectionEvidence(status: SiteConnectionModelStatus): string {
  if (status === "power-cable") {
    return POWER_CABLE_EVIDENCE;
  }
  if (status === "granular-haul") {
    return GRANULAR_HAUL_EVIDENCE;
  }
  return "Model boundary: measured geometry only.";
}

function connectionEquation(
  status: SiteConnectionModelStatus
): string | null {
  if (status === "power-cable") {
    return POWER_CABLE_EQUATION;
  }
  if (status === "granular-haul") {
    return GRANULAR_HAUL_EQUATION;
  }
  return null;
}

function actualPowerRouteState(
  routes: PowerRoute[],
  deliveredDemandW: number
): Map<string, { lossW: number; utilization: number }> {
  const totalCapacityW = routes.reduce(
    (total, route) => total + route.deliveredCapacityW,
    0
  );
  const servedW = Math.min(deliveredDemandW, totalCapacityW);
  return new Map(routes.map((route) => {
    const loadW = totalCapacityW > 0
      ? servedW * route.deliveredCapacityW / totalCapacityW
      : 0;
    const currentA = loadW / POWER_CABLE.voltageV;
    const lossW = currentA ** 2 * route.resistanceOhm;
    return [
      route.connectionId,
      {
        lossW,
        utilization: route.ratingShareW > 0
          ? (loadW + lossW) / route.ratingShareW
          : 0
      }
    ];
  }));
}

export function compileSiteDesign(
  design: SiteDesignDocument
): CompiledSiteDesign {
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
    const source = assetsById.get(connection.from.assetId);
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

  sortFindings(findings);
  const topologyValid = !findings.some((finding) =>
    finding.severity === "error"
  );
  const firstError = findings.find((finding) =>
    finding.severity === "error"
  );
  const capacityReadyAssetIds = new Set(
    normalizedDesign.assets
      .filter((asset) =>
        capacityPortsReady(normalizedDesign, asset, activeConnectionIds)
      )
      .map((asset) => asset.id)
  );

  return {
    normalizedDesign,
    effectiveParams: {
      ...normalizedDesign.params,
      site: normalizedDesign.environment
    },
    plannedTargetKgPerDay: Math.max(
      0,
      normalizedDesign.params.targetKgPerDay
    ),
    topologyValid,
    powerStrategy,
    topologyBottleneck: firstError === undefined
      ? null
      : {
          kind: "topology",
          label: firstError.message,
          entityIds: [...firstError.entityIds]
        },
    connectedAssetIds,
    capacityReadyAssetIds,
    compatibleConnectionIds,
    activeConnectionIds,
    findings
  };
}

export function evaluateSiteInstallation(
  compiled: CompiledSiteDesign,
  requiredResult: SimResult
): SiteDesignEvaluationPlan {
  const {
    normalizedDesign,
    plannedTargetKgPerDay,
    topologyValid
  } = compiled;
  const findings = [...compiled.findings];
  const powerConnectionsBySource = new Map<string, number>();
  for (const connection of normalizedDesign.connections) {
    if (
      compiled.activeConnectionIds.has(connection.id) &&
      connection.kind === "power"
    ) {
      powerConnectionsBySource.set(
        connection.from.assetId,
        (powerConnectionsBySource.get(connection.from.assetId) ?? 0) + 1
      );
    }
  }

  const powerRoutes: PowerRoute[] = [];
  for (const connection of normalizedDesign.connections) {
    if (
      !compiled.activeConnectionIds.has(connection.id) ||
      connection.kind !== "power"
    ) {
      continue;
    }
    const source = normalizedDesign.assets.find((asset) =>
      asset.id === connection.from.assetId
    );
    const model = source === undefined
      ? undefined
      : siteAssetDefinition(source.kind)?.capacityModel;
    if (
      source === undefined ||
      model?.metric !== "electrical-output" ||
      !compiled.capacityReadyAssetIds.has(source.id)
    ) {
      continue;
    }
    const routeCount = powerConnectionsBySource.get(source.id) ?? 1;
    const ratingShareW =
      model.rating * capacityQuantity(source, model) / routeCount;
    const lengthM = siteConnectionLengthM(normalizedDesign, connection);
    const resistanceOhm = cableResistanceOhm(lengthM);
    powerRoutes.push({
      connectionId: connection.id,
      ratingShareW,
      deliveredCapacityW: deliveredPowerW(ratingShareW, resistanceOhm),
      resistanceOhm,
      cableMassKg: cableMassKg(lengthM)
    });
  }

  const activeHaulConnections = normalizedDesign.connections.filter(
    (connection) =>
      compiled.activeConnectionIds.has(connection.id) &&
      granularHaulRoute(normalizedDesign, connection)
  );
  const feedPerRouteKgPerDay = activeHaulConnections.length > 0
    ? requiredResult.production.regolithKgPerDay /
      activeHaulConnections.length
    : 0;
  const haulEnergyJPerKgM =
    GRANULAR_HAUL.rollingResistanceCoefficient *
    PHYSICAL_CONSTANTS.gL.value *
    GRANULAR_HAUL.roundTripMassRatio /
    Math.max(1e-9, compiled.effectiveParams.etaDrive);
  const plannedTransportPower = new Map(
    activeHaulConnections.map((connection) => [
      connection.id,
      feedPerRouteKgPerDay *
        siteConnectionLengthM(normalizedDesign, connection) *
        haulEnergyJPerKgM /
        86_400
    ])
  );
  const plannedTransportPowerW = [...plannedTransportPower.values()].reduce(
    (total, powerW) => total + powerW,
    0
  );
  const requiredGridPowerW =
    requiredResult.energy.gridPowerW + plannedTransportPowerW;
  const installedPowerW = [...compiled.capacityReadyAssetIds].reduce(
    (total, assetId) => {
      const asset = normalizedDesign.assets.find((item) =>
        item.id === assetId
      );
      if (asset === undefined) {
        return total;
      }
      const model = siteAssetDefinition(asset.kind)?.capacityModel;
      return total + (
        model?.metric === "electrical-output"
          ? model.rating * capacityQuantity(asset, model)
          : 0
      );
    },
    0
  );
  const deliveredPowerCapacityW = powerRoutes.reduce(
    (total, route) => total + route.deliveredCapacityW,
    0
  );

  const groupModels = new Map(
    siteAssetsForEnvironment(normalizedDesign.environment)
      .flatMap((definition) =>
        definition.capacityModel === undefined
          ? []
          : [[definition.capacityModel.groupId, definition.capacityModel] as const]
      )
  );
  const capacityGroups: SiteCapacityGroupEvaluation[] = [...groupModels.values()]
    .map((model) => {
      const assetIds = normalizedDesign.assets
        .filter((asset) =>
          siteAssetDefinition(asset.kind)?.capacityModel?.groupId ===
            model.groupId
        )
        .map((asset) => asset.id);
      const installed = assetIds.reduce((total, assetId) => {
        if (!compiled.capacityReadyAssetIds.has(assetId)) {
          return total;
        }
        const asset = normalizedDesign.assets.find((item) =>
          item.id === assetId
        );
        if (asset === undefined) {
          return total;
        }
        const assetModel = siteAssetDefinition(asset.kind)?.capacityModel;
        return total + (
          assetModel === undefined
            ? 0
            : assetModel.rating * capacityQuantity(asset, assetModel)
        );
      }, 0);
      const required = model.metric === "electrical-output"
        ? requiredGridPowerW
        : plannedTargetKgPerDay;
      const available = model.metric === "electrical-output"
        ? deliveredPowerCapacityW
        : installed;
      return {
        id: model.groupId,
        label: model.groupLabel,
        metric: model.metric,
        unit: model.unit,
        required,
        installed,
        available,
        margin: available - required,
        utilization: available > 0
          ? required / available
          : required > 0 ? Number.POSITIVE_INFINITY : 0,
        assetIds,
        modelMaturity: model.modelMaturity,
        basis: model.basis,
        evidence: model.evidence
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const throughputGroups = capacityGroups.filter((group) =>
    group.metric === "product-throughput"
  );
  const installedThroughputKgPerDay = throughputGroups.length > 0
    ? Math.min(...throughputGroups.map((group) => group.available))
    : plannedTargetKgPerDay;
  const powerPerProductW = plannedTargetKgPerDay > 0
    ? requiredGridPowerW / plannedTargetKgPerDay
    : 0;
  const powerLimitedOutputKgPerDay = powerPerProductW > 0
    ? deliveredPowerCapacityW / powerPerProductW
    : plannedTargetKgPerDay;
  const achievableOutputKgPerDay = topologyValid
    ? Math.max(
        0,
        Math.min(
          plannedTargetKgPerDay,
          installedThroughputKgPerDay,
          powerLimitedOutputKgPerDay
        )
      )
    : 0;

  if (topologyValid) {
    for (const group of capacityGroups) {
      if (group.margin >= -1e-6) {
        continue;
      }
      findings.push({
        id: `capacity.shortfall.${group.id}`,
        severity: "caution",
        message:
          `${group.label} provides ${group.available.toFixed(1)} ${group.unit} ` +
          `against ${group.required.toFixed(1)} ${group.unit} required; achievable output is capacity-limited.`,
        entityIds: group.assetIds,
        suggestedAction:
          "Add and fully connect another rated instance, reduce the planned target, or replace the screening rating with project hardware data.",
        modelMaturity: group.modelMaturity,
        evidence: group.evidence
      });
    }
  }

  const unmodeledAssetIds = normalizedDesign.assets
    .filter((asset) =>
      asset.enabled &&
      compiled.connectedAssetIds.has(asset.id) &&
      siteAssetDefinition(asset.kind)?.capacityModel === undefined
    )
    .map((asset) => asset.id);
  if (unmodeledAssetIds.length > 0) {
    findings.push({
      id: "capacity.unmodeled-assets",
      severity: "info",
      message:
        "Some connected equipment satisfies topology but has no quantity scaling or installed-capacity model.",
      entityIds: unmodeledAssetIds,
      suggestedAction:
        "Treat those assets as functional placeholders until a supported rating is added.",
      modelMaturity: "DESIGN ASSUMPTION",
      evidence: "Explicit model boundary; no rating is applied."
    });
  }

  if (powerRoutes.length > 0) {
    findings.push({
      id: "spatial.power-cable-model",
      severity: "info",
      message:
        `Power-route mass and loss use ${POWER_CABLE_EQUATION}.`,
      entityIds: powerRoutes.map((route) => route.connectionId),
      suggestedAction:
        "Replace voltage, conductor, and installation assumptions with project values before detailed electrical design.",
      modelMaturity: "DESIGN ASSUMPTION",
      evidence: POWER_CABLE_EVIDENCE
    });
  }
  if (activeHaulConnections.length > 0) {
    findings.push({
      id: "spatial.granular-haul-model",
      severity: "info",
      message:
        `Granular-feed route energy uses ${GRANULAR_HAUL_EQUATION}.`,
      entityIds: activeHaulConnections.map((connection) => connection.id),
      suggestedAction:
        "Use a terrain and dispatch model when slopes, trafficability, or fleet scheduling are known.",
      modelMaturity: "DESIGN ASSUMPTION",
      evidence: GRANULAR_HAUL_EVIDENCE
    });
  }
  const measuredOnlyConnectionIds = normalizedDesign.connections
    .filter((connection) =>
      compiled.activeConnectionIds.has(connection.id) &&
      connectionModelStatus(normalizedDesign, connection) === "measured-only"
    )
    .map((connection) => connection.id);
  if (measuredOnlyConnectionIds.length > 0) {
    findings.push({
      id: "spatial.measured-only-routes",
      severity: "info",
      message:
        "Some active routes report persisted X/Z length without applying a mass, loss, or transport penalty.",
      entityIds: measuredOnlyConnectionIds,
      suggestedAction:
        "Use the measured length for layout review only until a route-specific duty model is supported.",
      evidence: "Explicit model boundary: persisted geometry only."
    });
  }

  const capacityCandidates = capacityGroups.map((group) => ({
    group,
    outputKgPerDay: group.metric === "electrical-output"
      ? powerLimitedOutputKgPerDay
      : group.available
  }));
  const limitingCandidate = capacityCandidates.sort((a, b) =>
    a.outputKgPerDay - b.outputKgPerDay ||
    a.group.id.localeCompare(b.group.id)
  )[0];
  const capacityBottleneck = topologyValid &&
    limitingCandidate !== undefined &&
    limitingCandidate.outputKgPerDay < plannedTargetKgPerDay - 1e-6
    ? {
        kind: "capacity" as const,
        label:
          `${limitingCandidate.group.label} limits achievable output to ` +
          `${achievableOutputKgPerDay.toFixed(1)} kg/day.`,
        entityIds: limitingCandidate.group.assetIds,
        required: limitingCandidate.group.required,
        installed: limitingCandidate.group.available,
        unit: limitingCandidate.group.unit
      }
    : null;

  const achievedRatio = plannedTargetKgPerDay > 0
    ? achievableOutputKgPerDay / plannedTargetKgPerDay
    : 0;
  const achievedTransportPower = new Map(
    [...plannedTransportPower].map(([id, powerW]) => [
      id,
      powerW * achievedRatio
    ])
  );
  const achievedTransportPowerW = [...achievedTransportPower.values()].reduce(
    (total, powerW) => total + powerW,
    0
  );
  const achievedProcessLoadW =
    requiredResult.energy.gridPowerW * achievedRatio;
  const powerRouteState = actualPowerRouteState(
    powerRoutes,
    achievedProcessLoadW + achievedTransportPowerW
  );
  const cableLossW = [...powerRouteState.values()].reduce(
    (total, state) => total + state.lossW,
    0
  );
  const totalCableMassKg = powerRoutes.reduce(
    (total, route) => total + route.cableMassKg,
    0
  );
  const spatial: SiteSpatialEvaluation = {
    cableMassKg: totalCableMassKg,
    cableLossW,
    transportPowerW: achievedTransportPowerW,
    supplementalLoadW: cableLossW + achievedTransportPowerW
  };

  const powerRoutesById = new Map(powerRoutes.map((route) => [
    route.connectionId,
    route
  ]));
  const capacityGroupsById = new Map(capacityGroups.map((group) => [
    group.id,
    group
  ]));
  const connectionEvaluations: SiteConnectionEvaluation[] =
    normalizedDesign.connections.map((connection) => {
      const modelStatus = connectionModelStatus(
        normalizedDesign,
        connection
      );
      const route = powerRoutesById.get(connection.id);
      const routeState = powerRouteState.get(connection.id);
      const toAsset = normalizedDesign.assets.find((asset) =>
        asset.id === connection.to.assetId
      );
      const fromAsset = normalizedDesign.assets.find((asset) =>
        asset.id === connection.from.assetId
      );
      const endpointGroupId =
        (toAsset === undefined
          ? undefined
          : siteAssetDefinition(toAsset.kind)?.capacityModel?.groupId) ??
        (fromAsset === undefined
          ? undefined
          : siteAssetDefinition(fromAsset.kind)?.capacityModel?.groupId);
      const endpointUtilization = endpointGroupId === undefined
        ? null
        : capacityGroupsById.get(endpointGroupId)?.utilization ?? null;
      const compatible = compiled.compatibleConnectionIds.has(connection.id);
      return {
        connectionId: connection.id,
        compatible,
        operational:
          topologyValid &&
          compiled.activeConnectionIds.has(connection.id),
        lengthM: siteConnectionLengthM(normalizedDesign, connection),
        modelStatus,
        cableMassKg: route?.cableMassKg ?? 0,
        powerLossW: routeState?.lossW ?? 0,
        transportPowerW: achievedTransportPower.get(connection.id) ?? 0,
        utilization: routeState?.utilization ?? endpointUtilization,
        equation: connectionEquation(modelStatus),
        assumption: connectionAssumption(modelStatus),
        evidence: connectionEvidence(modelStatus)
      };
    });

  const assetEvaluations = normalizedDesign.assets.map((asset) => {
    const model = siteAssetDefinition(asset.kind)?.capacityModel;
    const group = model === undefined
      ? undefined
      : capacityGroupsById.get(model.groupId);
    const ready = compiled.capacityReadyAssetIds.has(asset.id);
    return {
      assetId: asset.id,
      connected: compiled.connectedAssetIds.has(asset.id),
      operational: topologyValid && ready,
      capacityStatus: model === undefined
        ? "not-modeled" as const
        : "modeled" as const,
      capacityGroupId: model?.groupId ?? null,
      rating: model?.rating ?? null,
      quantity: model === undefined ? 1 : capacityQuantity(asset, model),
      installedCapacity: model === undefined
        ? null
        : model.rating * capacityQuantity(asset, model),
      unit: model?.unit ?? null,
      requiredDuty: group?.required ?? null,
      installedGroupCapacity: group?.installed ?? null,
      margin: group?.margin ?? null,
      utilization: group?.utilization ?? null,
      modelMaturity: model?.modelMaturity ?? null,
      basis: model?.basis ?? null,
      evidence: model?.evidence ?? null
    };
  });

  sortFindings(findings);
  const achievedSimulationOptions: SimulationOptions = {
    powerStrategy:
      compiled.powerStrategy === "solar" ||
      compiled.powerStrategy === "nuclear"
        ? compiled.powerStrategy
        : "auto",
    supplementalLoads: [
      ...(achievedTransportPowerW > 0
        ? [{
            id: "route-transport",
            label: "Granular route transport",
            powerW: achievedTransportPowerW,
            disposition: "useful" as const
          }]
        : []),
      ...(cableLossW > 0
        ? [{
            id: "power-distribution-loss",
            label: "Site power distribution loss",
            powerW: cableLossW,
            disposition: "loss" as const
          }]
        : [])
    ],
    supplementalMasses: totalCableMassKg > 0
      ? [{
          subsystem: "site power cabling",
          massKg: totalCableMassKg
        }]
      : []
  };

  return {
    evaluation: {
      normalizedDesign,
      effectiveParams: compiled.effectiveParams,
      plannedTargetKgPerDay,
      achievableOutputKgPerDay,
      topologyValid,
      powerStrategy: compiled.powerStrategy,
      bottleneck: compiled.topologyBottleneck ?? capacityBottleneck,
      capacityGroups,
      installedThroughputKgPerDay,
      requiredGridPowerW,
      installedPowerW,
      deliveredPowerW: deliveredPowerCapacityW,
      spatial,
      assetEvaluations,
      connectionEvaluations,
      findings
    },
    achievedSimulationOptions
  };
}
