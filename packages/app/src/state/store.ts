import {
  DEFAULTS,
  siteAssetDefinition,
  simulate,
  simulateTimeseries,
  validateSiteAssetPlacement,
  validateSiteDesign
} from "@selene-isru/engine";
import type {
  PlannerDocumentState,
  SimParams,
  SimResult,
  SiteDesignDocument,
  SiteDesignFinding,
  SiteEnvironment,
  SitePortRef,
  SiteViewMode,
  TimeseriesPoint,
  TimeseriesResult,
  WorkspaceMode
} from "@selene-isru/engine";
import { create } from "zustand";
import { parseParams, serializeParams } from "../lib/url";
import {
  createWorkingSiteDesign,
  loadCustomSiteDraft,
  saveCustomSiteDraft
} from "../site-design/draft";
import {
  createSiteConnection,
  duplicateSiteAsset,
  emptyCustomHistory,
  isKindAvailable,
  placeSiteAsset,
  pushCustomHistory,
  redoCustomDesign,
  removeSiteConnection,
  removeSiteAsset,
  rerouteSiteConnection,
  type CustomDesignHistory,
  type CustomEditorSession,
  undoCustomDesign,
  updatePlannerSnaps,
  updateSiteAsset
} from "../site-design/editor";

export type ViewTab = "site" | "energy" | "mass" | "power" | "study";
export type SheetDetent = "peek" | "half" | "full";
export type MobileTab = "controls" | "energy" | "mass" | "power" | "study";
export type ParameterNameMode = "plain" | "code";
export type StudyTab = "scenarios" | "frontier" | "uncertainty" | "report";
export type KpiKey = "sec" | "power" | "missions" | "mass-throughput" | "leverage" | "output";

export interface StudyScenario {
  id: string;
  name: string;
  params: SimParams;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
}

export interface UiState {
  view: ViewTab;
  aboutOpen: boolean;
  dockOpen: boolean;
  presetsOpen: boolean;
  /** opt-in explanatory layer for the 3D scene */
  learningMode: boolean;
  /** draw material / energy paths between labeled equipment */
  processFlow: boolean;
  /** reader-facing input names vs. engine variable names */
  parameterNames: ParameterNameMode;
  /** optional goal-first briefing dialog */
  missionBriefOpen: boolean;
  /** active workspace inside Trade Study */
  studyTab: StudyTab;
  currentScenarioName: string;
  compareScenarioName: string;
  /** currently inspected scene asset */
  selectedAsset: string | null;
  /** headline metric selected for equation/provenance inspection */
  selectedKpi: KpiKey | null;
  /** input selected for runtime differential dependency tracing */
  causalParam: keyof SimParams | null;
  /** conservation and inventory inspector */
  conservationOpen: boolean;
  /** camera bookmark request — consumed by the Scene component */
  flyRequest: { target: string; nonce: number } | null;
  /** warning pulse request — asset key + severity */
  pulseRequest: { asset: string; severity: string; nonce: number } | null;
  sheetDetent: SheetDetent;
  mobileTab: MobileTab;
}

export interface TimeState {
  tHours: number;
  playing: boolean;
  rate: number;
}

export interface TourState {
  activeId: string | null;
  beatIndex: number;
}

export interface CustomSiteState {
  design: SiteDesignDocument;
  viewMode: SiteViewMode;
  findings: SiteDesignFinding[];
  editor: CustomEditorSession;
  history: CustomDesignHistory;
}

const SEC_HISTORY_LENGTH = 60;
const SCENARIO_STORAGE_KEY = "selene-isru.study-scenarios.v2";
export const MAX_STUDY_SCENARIOS = 8;
export const MAX_PINNED_SCENARIOS = 4;
let scenarioNonce = 0;

function customEditorSession(
  patch: Partial<CustomEditorSession> = {}
): CustomEditorSession {
  return {
    tool: "select",
    placementKind: null,
    connectionSource: null,
    selectedAssetId: null,
    selectedConnectionId: null,
    ...patch
  };
}

interface Store {
  workspaceMode: WorkspaceMode;
  customSite: CustomSiteState;
  params: SimParams;
  result: SimResult;
  compareParams: SimParams;
  compareResult: SimResult;
  timeseries: TimeseriesResult;
  time: TimeState;
  timePoint: TimeseriesPoint;
  tour: TourState;
  /** last N secTotal values for the Sankey header sparkline (session-local) */
  secHistory: number[];
  /** local-only named study cases persisted in this browser */
  scenarioLibrary: StudyScenario[];
  ui: UiState;
  enterAuthoredSite: (site: SiteEnvironment) => void;
  enterCustomSite: () => void;
  setCustomEnvironment: (environment: SiteEnvironment) => void;
  setCustomViewMode: (viewMode: SiteViewMode) => void;
  setCustomDesignName: (name: string) => void;
  resetCustomDesign: () => void;
  beginCustomPlacement: (kind: string) => void;
  cancelCustomPlacement: () => void;
  beginCustomConnection: (source: SitePortRef) => void;
  cancelCustomConnection: () => void;
  completeCustomConnection: (target: SitePortRef) => void;
  selectCustomAsset: (assetId: string | null) => void;
  selectCustomConnection: (connectionId: string | null) => void;
  placeCustomAsset: (kind: string, xM: number, zM: number) => void;
  moveCustomAsset: (assetId: string, xM: number, zM: number) => void;
  updateCustomAsset: (
    assetId: string,
    patch: {
      name?: string;
      xM?: number;
      zM?: number;
      headingDeg?: number;
      enabled?: boolean;
    }
  ) => void;
  rotateCustomAsset: (assetId: string, deltaDeg: number) => void;
  duplicateCustomAsset: (assetId: string) => void;
  deleteCustomAsset: (assetId: string) => void;
  rerouteCustomConnection: (connectionId: string) => void;
  deleteCustomConnection: (connectionId: string) => void;
  setCustomPlannerSnaps: (
    patch: Partial<Pick<PlannerDocumentState, "gridSnapM" | "rotationSnapDeg">>
  ) => void;
  undoCustomEdit: () => void;
  redoCustomEdit: () => void;
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  applyPatch: (patch: Partial<SimParams>) => void;
  resetParam: (key: keyof SimParams) => void;
  setUi: (patch: Partial<UiState>) => void;
  setTimeHours: (tHours: number) => void;
  setPlaying: (playing: boolean) => void;
  setTimeRate: (rate: number) => void;
  advanceTime: (dtSeconds: number) => void;
  setCompareFromCurrent: () => void;
  swapCompare: () => void;
  saveCurrentScenario: (name?: string) => void;
  loadScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  duplicateScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  toggleScenarioPin: (id: string) => void;
  importScenarios: (scenarios: StudyScenario[]) => void;
  startTour: (id: string) => void;
  stopTour: () => void;
  advanceTour: () => void;
  flyTo: (target: string) => void;
  pulseAsset: (asset: string, severity: string) => void;
}

function initialParams(): SimParams {
  const fromUrl =
    typeof window !== "undefined" ? parseParams(window.location.search) : {};
  return { ...DEFAULTS, ...fromUrl };
}

function pushHistory(history: number[], value: number): number[] {
  const next = history.length >= SEC_HISTORY_LENGTH ? history.slice(1) : history.slice();
  next.push(value);
  return next;
}

function sampleTimeseries(timeseries: TimeseriesResult, tHours: number): TimeseriesPoint {
  const points = timeseries.points;
  if (points.length === 0) {
    return {
      tHours: 0,
      daylight: true,
      solarOutputW: 0,
      loadW: 0,
      batterySoC: 1,
      tankFillKg: 0,
      boiloffKgPerDay: 0,
      netProductionKgPerDay: 0,
      illumination: 1,
      receiverVisibility: 1,
      surfaceTemperatureK: 300
    };
  }
  const last = points[points.length - 1]!;
  const cycleHours = Math.max(1, last.tHours);
  const t = ((tHours % cycleHours) + cycleHours) % cycleHours;
  let i = 0;
  while (i < points.length - 2 && points[i + 1]!.tHours < t) {
    i += 1;
  }
  const a = points[i]!;
  const b = points[i + 1] ?? a;
  const span = Math.max(1e-9, b.tHours - a.tHours);
  const u = Math.min(1, Math.max(0, (t - a.tHours) / span));
  const lerp = (x: number, y: number): number => x + (y - x) * u;
  return {
    tHours: t,
    daylight: a.daylight,
    solarOutputW: lerp(a.solarOutputW, b.solarOutputW),
    loadW: lerp(a.loadW, b.loadW),
    batterySoC: lerp(a.batterySoC, b.batterySoC),
    tankFillKg: lerp(a.tankFillKg, b.tankFillKg),
    boiloffKgPerDay: lerp(a.boiloffKgPerDay, b.boiloffKgPerDay),
    netProductionKgPerDay: lerp(a.netProductionKgPerDay, b.netProductionKgPerDay),
    illumination: lerp(a.illumination, b.illumination),
    receiverVisibility: lerp(a.receiverVisibility, b.receiverVisibility),
    surfaceTemperatureK: lerp(a.surfaceTemperatureK, b.surfaceTemperatureK)
  };
}

function cycleHours(timeseries: TimeseriesResult): number {
  return Math.max(1, timeseries.points.at(-1)?.tHours ?? 1);
}

function initialCompareParams(params: SimParams): SimParams {
  return { ...params, site: params.site === "polar" ? "equatorial" : "polar" };
}

function scenarioId(): string {
  scenarioNonce += 1;
  return `case-${Date.now().toString(36)}-${scenarioNonce.toString(36)}`;
}

function validScenario(value: unknown): value is StudyScenario {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<StudyScenario>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.params === "object" &&
    candidate.params !== null &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    typeof candidate.pinned === "boolean"
  );
}

function initialScenarioLibrary(params: SimParams, compareParams: SimParams): StudyScenario[] {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(validScenario).slice(0, MAX_STUDY_SCENARIOS);
          if (valid.length > 0) {
            return valid;
          }
        }
      }
    } catch {
      // Corrupt or unavailable local storage falls back to reproducible starter cases.
    }
  }
  const now = Date.now();
  return [
    {
      id: scenarioId(),
      name: `${params.site === "polar" ? "Polar" : "Equatorial"} baseline`,
      params: { ...params },
      createdAt: now,
      updatedAt: now,
      pinned: true
    },
    {
      id: scenarioId(),
      name: `${compareParams.site === "polar" ? "Polar" : "Equatorial"} reference`,
      params: { ...compareParams },
      createdAt: now,
      updatedAt: now,
      pinned: true
    }
  ];
}

function persistScenarioLibrary(scenarios: StudyScenario[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    // The in-memory study remains usable when browser storage is unavailable.
  }
}

export const useStore = create<Store>((set, get) => {
  const params = initialParams();
  const result = simulate(params);
  const compareParams = initialCompareParams(params);
  const compareResult = simulate(compareParams);
  const timeseries = simulateTimeseries(params, { cycles: 1, samplesPerCycle: 96 });
  const time: TimeState = { tHours: 0, playing: false, rate: 48 };
  const timePoint = sampleTimeseries(timeseries, time.tHours);
  const scenarioLibrary = initialScenarioLibrary(params, compareParams);
  const customDesign = loadCustomSiteDraft() ?? createWorkingSiteDesign(params.site);
  const customSite: CustomSiteState = {
    design: customDesign,
    viewMode: "planner",
    findings: validateSiteDesign(customDesign),
    editor: customEditorSession(),
    history: emptyCustomHistory()
  };

  const commitCustomDesign = (
    design: SiteDesignDocument,
    selectedAssetId: string | null,
    selectedConnectionId: string | null = null,
    recordHistory = true
  ): void => {
    const current = get().customSite;
    saveCustomSiteDraft(design);
    set({
      customSite: {
        ...current,
        design,
        findings: validateSiteDesign(design),
        editor: customEditorSession({ selectedAssetId, selectedConnectionId }),
        history: recordHistory
          ? pushCustomHistory(current.history, current.design)
          : current.history
      }
    });
  };

  return {
    workspaceMode: "authored",
    customSite,
    params,
    result,
    compareParams,
    compareResult,
    timeseries,
    time,
    timePoint,
    tour: { activeId: null, beatIndex: 0 },
    secHistory: [result.energy.secTotal_kWhPerKg],
    scenarioLibrary,
    ui: {
      view: "site",
      aboutOpen: false,
      dockOpen: false,
      presetsOpen: false,
      learningMode: false,
      processFlow: false,
      parameterNames: "plain",
      missionBriefOpen: false,
      studyTab: "scenarios",
      currentScenarioName: `${params.site === "polar" ? "Polar" : "Equatorial"} working case`,
      compareScenarioName: `${compareParams.site === "polar" ? "Polar" : "Equatorial"} reference`,
      selectedAsset: null,
      selectedKpi: null,
      causalParam: null,
      conservationOpen: false,
      flyRequest: null,
      pulseRequest: null,
      sheetDetent: "peek",
      mobileTab: "controls"
    },

    enterAuthoredSite: (site) => {
      set({ workspaceMode: "authored" });
      get().setParam("site", site);
    },

    enterCustomSite: () => {
      const design = get().customSite.design;
      const nextResult = simulate(design.params);
      const nextTimeseries = simulateTimeseries(design.params, {
        cycles: 1,
        samplesPerCycle: 96
      });
      const nextTime = {
        ...get().time,
        playing: false,
        tHours: get().time.tHours % cycleHours(nextTimeseries)
      };
      set({
        workspaceMode: "custom",
        params: design.params,
        result: nextResult,
        timeseries: nextTimeseries,
        time: nextTime,
        timePoint: sampleTimeseries(nextTimeseries, nextTime.tHours),
        secHistory: pushHistory(get().secHistory, nextResult.energy.secTotal_kWhPerKg),
        ui: {
          ...get().ui,
          selectedAsset: null,
          learningMode: false,
          processFlow: false
        }
      });
    },

    setCustomEnvironment: (environment) => {
      const current = get().customSite.design;
      const timestamp = new Date().toISOString();
      const design: SiteDesignDocument = {
        ...current,
        environment,
        params: { ...current.params, site: environment },
        assets: [],
        connections: [],
        updatedAt: timestamp
      };
      const findings = validateSiteDesign(design);
      saveCustomSiteDraft(design);
      const nextResult = simulate(design.params);
      const nextTimeseries = simulateTimeseries(design.params, {
        cycles: 1,
        samplesPerCycle: 96
      });
      const nextTime = {
        ...get().time,
        playing: false,
        tHours: get().time.tHours % cycleHours(nextTimeseries)
      };
      set({
        customSite: {
          ...get().customSite,
          design,
          findings,
          editor: customEditorSession(),
          history: emptyCustomHistory()
        },
        params: design.params,
        result: nextResult,
        timeseries: nextTimeseries,
        time: nextTime,
        timePoint: sampleTimeseries(nextTimeseries, nextTime.tHours),
        secHistory: pushHistory(get().secHistory, nextResult.energy.secTotal_kWhPerKg),
        ui: { ...get().ui, selectedAsset: null }
      });
    },

    setCustomViewMode: (viewMode) => {
      set({ customSite: { ...get().customSite, viewMode } });
    },

    setCustomDesignName: (name) => {
      const current = get().customSite.design;
      const design = {
        ...current,
        name: name.slice(0, 120),
        updatedAt: new Date().toISOString()
      };
      saveCustomSiteDraft(design);
      set({
        customSite: {
          ...get().customSite,
          design,
          findings: validateSiteDesign(design)
        }
      });
    },

    resetCustomDesign: () => {
      const current = get().customSite.design;
      const design = createWorkingSiteDesign(current.environment);
      saveCustomSiteDraft(design);
      set({
        customSite: {
          design,
          viewMode: "planner",
          findings: validateSiteDesign(design),
          editor: customEditorSession(),
          history: emptyCustomHistory()
        }
      });
      if (get().workspaceMode === "custom") {
        get().enterCustomSite();
      }
    },

    beginCustomPlacement: (kind) => {
      const current = get().customSite;
      if (!isKindAvailable(current.design, kind)) {
        return;
      }
      set({
        customSite: {
          ...current,
          editor: customEditorSession({
            tool: "place",
            placementKind: kind
          })
        }
      });
    },

    cancelCustomPlacement: () => {
      const current = get().customSite;
      set({
        customSite: {
          ...current,
          editor: customEditorSession({
            selectedAssetId: current.editor.selectedAssetId,
            selectedConnectionId: current.editor.selectedConnectionId
          })
        }
      });
    },

    beginCustomConnection: (source) => {
      const current = get().customSite;
      const asset = current.design.assets.find((item) => item.id === source.assetId);
      const definition = asset === undefined ? null : siteAssetDefinition(asset.kind);
      const port = definition?.ports.find((item) => item.id === source.portId);
      const usage = current.design.connections.filter((connection) =>
        (
          connection.from.assetId === source.assetId &&
          connection.from.portId === source.portId
        ) || (
          connection.to.assetId === source.assetId &&
          connection.to.portId === source.portId
        )
      ).length;
      if (
        asset?.enabled !== true ||
        port === undefined ||
        (port.direction !== "output" && port.direction !== "bidirectional") ||
        (port.maxConnections !== undefined && usage >= port.maxConnections)
      ) {
        return;
      }
      set({
        customSite: {
          ...current,
          editor: customEditorSession({
            tool: "connect",
            connectionSource: { ...source },
            selectedAssetId: source.assetId
          })
        }
      });
    },

    cancelCustomConnection: () => {
      const current = get().customSite;
      set({
        customSite: {
          ...current,
          editor: customEditorSession({
            selectedAssetId: current.editor.connectionSource?.assetId ??
              current.editor.selectedAssetId
          })
        }
      });
    },

    completeCustomConnection: (target) => {
      const current = get().customSite;
      const source = current.editor.connectionSource;
      if (source === null) {
        return;
      }
      const design = createSiteConnection(current.design, source, target);
      const connection = design?.connections.at(-1);
      if (design === null || connection === undefined) {
        return;
      }
      commitCustomDesign(design, null, connection.id);
    },

    selectCustomAsset: (assetId) => {
      const current = get().customSite;
      const selectedAssetId = assetId !== null &&
        current.design.assets.some((asset) => asset.id === assetId)
        ? assetId
        : null;
      set({
        customSite: {
          ...current,
          editor: customEditorSession({ selectedAssetId })
        }
      });
    },

    selectCustomConnection: (connectionId) => {
      const current = get().customSite;
      const selectedConnectionId = connectionId !== null &&
        current.design.connections.some((connection) => connection.id === connectionId)
        ? connectionId
        : null;
      set({
        customSite: {
          ...current,
          editor: customEditorSession({ selectedConnectionId })
        }
      });
    },

    placeCustomAsset: (kind, xM, zM) => {
      const current = get().customSite;
      const design = placeSiteAsset(current.design, kind, xM, zM);
      const asset = design?.assets.at(-1);
      if (
        design === null ||
        asset === undefined ||
        validateSiteAssetPlacement(current.design, asset)
          .some((finding) => finding.severity === "error")
      ) {
        return;
      }
      commitCustomDesign(design, asset.id);
    },

    moveCustomAsset: (assetId, xM, zM) => {
      const current = get().customSite;
      if (!current.design.assets.some((asset) => asset.id === assetId)) {
        return;
      }
      commitCustomDesign(
        updateSiteAsset(current.design, assetId, { xM, zM }),
        assetId
      );
    },

    updateCustomAsset: (assetId, patch) => {
      const current = get().customSite;
      if (!current.design.assets.some((asset) => asset.id === assetId)) {
        return;
      }
      commitCustomDesign(updateSiteAsset(current.design, assetId, patch), assetId);
    },

    rotateCustomAsset: (assetId, deltaDeg) => {
      const current = get().customSite;
      const asset = current.design.assets.find((item) => item.id === assetId);
      if (asset === undefined) {
        return;
      }
      commitCustomDesign(
        updateSiteAsset(current.design, assetId, {
          headingDeg: asset.transform.headingDeg + deltaDeg
        }),
        assetId
      );
    },

    duplicateCustomAsset: (assetId) => {
      const current = get().customSite;
      let design = duplicateSiteAsset(current.design, assetId);
      if (design === null) {
        return;
      }
      let duplicate = design.assets.at(-1);
      for (let attempt = 2; duplicate !== undefined && attempt <= 5; attempt += 1) {
        const blocked = validateSiteAssetPlacement(current.design, duplicate)
          .some((finding) => finding.severity === "error");
        if (!blocked) {
          break;
        }
        const source = current.design.assets.find((asset) => asset.id === assetId);
        const offset = Math.max(5, current.design.planner.gridSnapM) * attempt;
        if (source !== undefined) {
          design = updateSiteAsset(design, duplicate.id, {
            xM: source.transform.xM + offset,
            zM: source.transform.zM + offset
          });
          duplicate = design.assets.at(-1);
        }
      }
      if (
        duplicate === undefined ||
        validateSiteAssetPlacement(current.design, duplicate)
          .some((finding) => finding.severity === "error")
      ) {
        return;
      }
      commitCustomDesign(design, duplicate.id);
    },

    deleteCustomAsset: (assetId) => {
      const current = get().customSite;
      if (!current.design.assets.some((asset) => asset.id === assetId)) {
        return;
      }
      commitCustomDesign(removeSiteAsset(current.design, assetId), null);
    },

    rerouteCustomConnection: (connectionId) => {
      const current = get().customSite;
      if (!current.design.connections.some((connection) => connection.id === connectionId)) {
        return;
      }
      commitCustomDesign(
        rerouteSiteConnection(current.design, connectionId),
        null,
        connectionId
      );
    },

    deleteCustomConnection: (connectionId) => {
      const current = get().customSite;
      if (!current.design.connections.some((connection) => connection.id === connectionId)) {
        return;
      }
      commitCustomDesign(
        removeSiteConnection(current.design, connectionId),
        null
      );
    },

    setCustomPlannerSnaps: (patch) => {
      const current = get().customSite;
      commitCustomDesign(
        updatePlannerSnaps(current.design, patch),
        current.editor.selectedAssetId,
        current.editor.selectedConnectionId
      );
    },

    undoCustomEdit: () => {
      const current = get().customSite;
      const restored = undoCustomDesign(current.design, current.history);
      if (restored === null) {
        return;
      }
      const selectedAssetId = current.editor.selectedAssetId !== null &&
        restored.design.assets.some((asset) => asset.id === current.editor.selectedAssetId)
        ? current.editor.selectedAssetId
        : null;
      const selectedConnectionId = current.editor.selectedConnectionId !== null &&
        restored.design.connections.some((connection) =>
          connection.id === current.editor.selectedConnectionId)
        ? current.editor.selectedConnectionId
        : null;
      saveCustomSiteDraft(restored.design);
      set({
        customSite: {
          ...current,
          design: restored.design,
          findings: validateSiteDesign(restored.design),
          editor: customEditorSession({
            selectedAssetId,
            selectedConnectionId
          }),
          history: restored.history
        }
      });
    },

    redoCustomEdit: () => {
      const current = get().customSite;
      const restored = redoCustomDesign(current.design, current.history);
      if (restored === null) {
        return;
      }
      saveCustomSiteDraft(restored.design);
      set({
        customSite: {
          ...current,
          design: restored.design,
          findings: validateSiteDesign(restored.design),
          editor: customEditorSession({
            selectedAssetId: current.editor.selectedAssetId,
            selectedConnectionId: current.editor.selectedConnectionId
          }),
          history: restored.history
        }
      });
    },

    setParam: (key, value) => {
      if (get().workspaceMode === "custom" && key === "site") {
        get().setCustomEnvironment(value as SiteEnvironment);
        return;
      }
      const nextParams = { ...get().params, [key]: value };
      const nextResult = simulate(nextParams);
      const nextTimeseries = simulateTimeseries(nextParams, { cycles: 1, samplesPerCycle: 96 });
      const nextTime = { ...get().time, tHours: get().time.tHours % cycleHours(nextTimeseries) };
      const customDesign = get().customSite.design;
      const nextCustomDesign = get().workspaceMode === "custom"
        ? {
            ...customDesign,
            params: nextParams,
            updatedAt: new Date().toISOString()
          }
        : customDesign;
      if (get().workspaceMode === "custom") {
        saveCustomSiteDraft(nextCustomDesign);
      }
      set({
        ...(get().workspaceMode === "custom"
          ? {
              customSite: {
                ...get().customSite,
                design: nextCustomDesign,
                findings: validateSiteDesign(nextCustomDesign)
              }
            }
          : {}),
        params: nextParams,
        result: nextResult,
        timeseries: nextTimeseries,
        time: nextTime,
        timePoint: sampleTimeseries(nextTimeseries, nextTime.tHours),
        secHistory: pushHistory(get().secHistory, nextResult.energy.secTotal_kWhPerKg),
        ...(key === "site"
          ? {
              ui: {
                ...get().ui,
                selectedAsset: null,
                currentScenarioName: `${nextParams.site === "polar" ? "Polar" : "Equatorial"} working case`
              }
            }
          : {})
      });
    },

    applyPatch: (patch) => {
      const nextParams = { ...DEFAULTS, ...patch };
      const nextResult = simulate(nextParams);
      const nextTimeseries = simulateTimeseries(nextParams, { cycles: 1, samplesPerCycle: 96 });
      const nextTime = { ...get().time, tHours: get().time.tHours % cycleHours(nextTimeseries) };
      set({
        params: nextParams,
        result: nextResult,
        timeseries: nextTimeseries,
        time: nextTime,
        timePoint: sampleTimeseries(nextTimeseries, nextTime.tHours),
        secHistory: pushHistory(get().secHistory, nextResult.energy.secTotal_kWhPerKg),
        ui: {
          ...get().ui,
          selectedAsset: null,
          currentScenarioName: `${nextParams.site === "polar" ? "Polar" : "Equatorial"} working case`
        }
      });
    },

    resetParam: (key) => {
      get().setParam(key, DEFAULTS[key]);
    },

    setUi: (patch) => {
      set({ ui: { ...get().ui, ...patch } });
    },

    setTimeHours: (tHours) => {
      const { timeseries, time } = get();
      const nextTime = { ...time, tHours: ((tHours % cycleHours(timeseries)) + cycleHours(timeseries)) % cycleHours(timeseries) };
      set({ time: nextTime, timePoint: sampleTimeseries(timeseries, nextTime.tHours) });
    },

    setPlaying: (playing) => {
      set({ time: { ...get().time, playing } });
    },

    setTimeRate: (rate) => {
      set({ time: { ...get().time, rate } });
    },

    advanceTime: (dtSeconds) => {
      const { timeseries, time } = get();
      if (!time.playing) {
        return;
      }
      const c = cycleHours(timeseries);
      const tHours = ((time.tHours + dtSeconds * time.rate) % c + c) % c;
      const nextTime = { ...time, tHours };
      set({ time: nextTime, timePoint: sampleTimeseries(timeseries, tHours) });
    },

    setCompareFromCurrent: () => {
      const { params, result } = get();
      set({
        compareParams: { ...params },
        compareResult: result,
        ui: {
          ...get().ui,
          compareScenarioName: `${get().ui.currentScenarioName} snapshot`
        }
      });
    },

    swapCompare: () => {
      const { params, result, compareParams, compareResult, time, ui } = get();
      const nextTimeseries = simulateTimeseries(compareParams, { cycles: 1, samplesPerCycle: 96 });
      const nextTime = { ...time, tHours: time.tHours % cycleHours(nextTimeseries) };
      set({
        params: compareParams,
        result: compareResult,
        compareParams: params,
        compareResult: result,
        timeseries: nextTimeseries,
        time: nextTime,
        timePoint: sampleTimeseries(nextTimeseries, nextTime.tHours),
        secHistory: pushHistory(get().secHistory, compareResult.energy.secTotal_kWhPerKg),
        ui: {
          ...ui,
          selectedAsset: null,
          currentScenarioName: ui.compareScenarioName,
          compareScenarioName: ui.currentScenarioName
        }
      });
    },

    saveCurrentScenario: (name) => {
      const { params, ui, scenarioLibrary: current } = get();
      if (current.length >= MAX_STUDY_SCENARIOS) {
        return;
      }
      const now = Date.now();
      const next: StudyScenario[] = [
        ...current,
        {
          id: scenarioId(),
          name: name?.trim() || ui.currentScenarioName.trim() || `Study case ${current.length + 1}`,
          params: { ...params },
          createdAt: now,
          updatedAt: now,
          pinned: current.filter((scenario) => scenario.pinned).length < 2
        }
      ];
      persistScenarioLibrary(next);
      set({ scenarioLibrary: next });
    },

    loadScenario: (id) => {
      const scenario = get().scenarioLibrary.find((item) => item.id === id);
      if (scenario === undefined) {
        return;
      }
      get().applyPatch(scenario.params);
      set({ ui: { ...get().ui, currentScenarioName: scenario.name } });
    },

    renameScenario: (id, name) => {
      const next = get().scenarioLibrary.map((scenario) =>
        scenario.id === id
          ? { ...scenario, name: name.slice(0, 80), updatedAt: Date.now() }
          : scenario
      );
      persistScenarioLibrary(next);
      set({ scenarioLibrary: next });
    },

    duplicateScenario: (id) => {
      const current = get().scenarioLibrary;
      const scenario = current.find((item) => item.id === id);
      if (scenario === undefined || current.length >= MAX_STUDY_SCENARIOS) {
        return;
      }
      const now = Date.now();
      const next: StudyScenario[] = [
        ...current,
        {
          ...scenario,
          id: scenarioId(),
          name: `${scenario.name} copy`,
          params: { ...scenario.params },
          createdAt: now,
          updatedAt: now,
          pinned: false
        }
      ];
      persistScenarioLibrary(next);
      set({ scenarioLibrary: next });
    },

    deleteScenario: (id) => {
      const next = get().scenarioLibrary.filter((scenario) => scenario.id !== id);
      persistScenarioLibrary(next);
      set({ scenarioLibrary: next });
    },

    toggleScenarioPin: (id) => {
      const current = get().scenarioLibrary;
      const target = current.find((scenario) => scenario.id === id);
      if (
        target === undefined ||
        (!target.pinned &&
          current.filter((scenario) => scenario.pinned).length >= MAX_PINNED_SCENARIOS)
      ) {
        return;
      }
      const next = current.map((scenario) =>
        scenario.id === id
          ? { ...scenario, pinned: !scenario.pinned, updatedAt: Date.now() }
          : scenario
      );
      persistScenarioLibrary(next);
      set({ scenarioLibrary: next });
    },

    importScenarios: (scenarios) => {
      const incoming = scenarios.filter(validScenario);
      const byId = new Map(get().scenarioLibrary.map((scenario) => [scenario.id, scenario]));
      for (const scenario of incoming) {
        if (byId.size >= MAX_STUDY_SCENARIOS && !byId.has(scenario.id)) {
          break;
        }
        byId.set(scenario.id, {
          ...scenario,
          params: { ...DEFAULTS, ...scenario.params },
          name: scenario.name.slice(0, 80)
        });
      }
      const next = [...byId.values()].slice(0, MAX_STUDY_SCENARIOS);
      let pinned = 0;
      const normalized = next.map((scenario) => {
        if (!scenario.pinned) {
          return scenario;
        }
        pinned += 1;
        return pinned <= MAX_PINNED_SCENARIOS ? scenario : { ...scenario, pinned: false };
      });
      persistScenarioLibrary(normalized);
      set({ scenarioLibrary: normalized });
    },

    startTour: (id) => {
      set({ tour: { activeId: id, beatIndex: 0 }, time: { ...get().time, playing: false } });
    },

    stopTour: () => {
      set({ tour: { activeId: null, beatIndex: 0 } });
    },

    advanceTour: () => {
      const { tour } = get();
      if (tour.activeId === null) {
        return;
      }
      set({ tour: { ...tour, beatIndex: tour.beatIndex + 1 } });
    },

    flyTo: (target) => {
      const { ui } = get();
      set({
        ui: {
          ...ui,
          flyRequest: { target, nonce: (ui.flyRequest?.nonce ?? 0) + 1 }
        }
      });
    },

    pulseAsset: (asset, severity) => {
      const { ui } = get();
      set({
        ui: {
          ...ui,
          pulseRequest: { asset, severity, nonce: (ui.pulseRequest?.nonce ?? 0) + 1 }
        }
      });
    }
  };
});

/* ---------- URL sync: replaceState throttled to 500ms (§5) ---------- */

let urlTimer: ReturnType<typeof setTimeout> | null = null;
let lastQuery: string | null = null;

if (typeof window !== "undefined") {
  useStore.subscribe((state) => {
    const query = serializeParams(state.params);
    if (query === lastQuery) {
      return;
    }
    lastQuery = query;
    if (urlTimer !== null) {
      return;
    }
    urlTimer = setTimeout(() => {
      urlTimer = null;
      const target = lastQuery !== null && lastQuery.length > 0 ? `?${lastQuery}` : window.location.pathname;
      window.history.replaceState(null, "", target);
    }, 500);
  });
}
