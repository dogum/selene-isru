import {
  createSeededSiteDesign,
  DEFAULTS,
  evaluateSiteDesign,
  normalizeParams,
  parseSiteDesign,
  siteAssetDefinition,
  siteConnectionRoutePoints,
  simulate,
  simulateSiteDesignTimeseries,
  simulateTimeseries,
  validateSiteAssetPlacement
} from "@selene-isru/engine";
import type {
  PlannerDocumentState,
  SimParams,
  SimResult,
  SiteDesignDocument,
  SiteDesignEvaluation,
  SiteDesignFinding,
  SiteEnvironment,
  SiteConfigurationValue,
  SitePortRef,
  SiteViewMode,
  TimeseriesPoint,
  TimeseriesResult,
  Warning,
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
  distributeSiteAssets,
  duplicateSiteAsset,
  emptyCustomHistory,
  isKindAvailable,
  moveSiteAssetGroup,
  placeSiteAsset,
  pushCustomHistory,
  redoCustomDesign,
  removeSiteConnection,
  removeSiteAsset,
  rerouteSiteConnection,
  rotateSiteAssetGroup,
  type CustomDesignHistory,
  type CustomEditorSession,
  undoCustomDesign,
  updateSiteConnectionRoute,
  updatePlannerSnaps,
  updateSiteAsset
} from "../site-design/editor";

export type ViewTab = "site" | "energy" | "mass" | "power" | "campaign" | "study";
export type SheetDetent = "peek" | "half" | "full";
export type MobileTab = "controls" | "energy" | "mass" | "power" | "campaign" | "study";
export type ParameterNameMode = "plain" | "code";
export type StudyTab = "scenarios" | "frontier" | "uncertainty" | "report";
export type KpiKey = "sec" | "power" | "missions" | "mass-throughput" | "leverage" | "output";

export interface StudyScenario {
  id: string;
  name: string;
  kind: "authored" | "custom";
  params: SimParams;
  design?: SiteDesignDocument;
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
  /** The authored case the tour interrupted, put back when it ends. */
  restore: AuthoredCaseEntry | null;
}

/** An authored case as it was on screen: what undo, redo, and tours restore. */
export interface AuthoredCaseEntry {
  params: SimParams;
  scenarioName: string;
}

export interface ParamHistory {
  past: AuthoredCaseEntry[];
  future: AuthoredCaseEntry[];
}

export interface CustomSiteState {
  design: SiteDesignDocument;
  evaluation: SiteDesignEvaluation;
  viewMode: SiteViewMode;
  findings: SiteDesignFinding[];
  editor: CustomEditorSession;
  history: CustomDesignHistory;
}

const SEC_HISTORY_LENGTH = 60;
const SCENARIO_STORAGE_KEY = "selene-isru.study-scenarios.v2";
export const MAX_STUDY_SCENARIOS = 8;
export const PARAM_HISTORY_LIMIT = 100;
/** Edits to one input closer together than this are one undo step: a slider drag. */
export const PARAM_EDIT_COALESCE_MS = 800;
let lastParamEdit: { key: string; at: number } | null = null;
export const MAX_PINNED_SCENARIOS = 4;

/** What an import actually did, so the UI never reports more than landed. */
export interface ScenarioImportSummary {
  /** New cases added to the library. */
  added: number;
  /** Existing cases overwritten because an incoming case had the same id. */
  replaced: number;
  /** Incoming cases dropped because the library was full. */
  skipped: number;
  /** Incoming pinned cases left unpinned by the pin limit. */
  unpinned: number;
}
let scenarioNonce = 0;

function customEditorSession(
  patch: Partial<CustomEditorSession> = {}
): CustomEditorSession {
  const selectedAssetIds = patch.selectedAssetIds ??
    (patch.selectedAssetId === undefined || patch.selectedAssetId === null
      ? []
      : [patch.selectedAssetId]);
  const selectedAssetId = patch.selectedAssetId === undefined
    ? selectedAssetIds.at(-1) ?? null
    : patch.selectedAssetId;
  return {
    tool: "select",
    placementKind: null,
    connectionSource: null,
    selectedAssetId,
    selectedAssetIds,
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
  /** authored cases to step back and forward through (session-local) */
  paramHistory: ParamHistory;
  /** local-only named study cases persisted in this browser */
  scenarioLibrary: StudyScenario[];
  ui: UiState;
  enterAuthoredSite: (site: SiteEnvironment) => void;
  enterCustomSite: () => void;
  setCustomEnvironment: (environment: SiteEnvironment) => void;
  setCustomViewMode: (viewMode: SiteViewMode) => void;
  setCustomDesignName: (name: string) => void;
  resetCustomDesign: () => void;
  seedCustomDesign: (environment: SiteEnvironment) => void;
  beginCustomPlacement: (kind: string) => void;
  cancelCustomPlacement: () => void;
  beginCustomConnection: (source: SitePortRef) => void;
  cancelCustomConnection: () => void;
  completeCustomConnection: (target: SitePortRef) => void;
  selectCustomAsset: (assetId: string | null, additive?: boolean) => void;
  selectCustomConnection: (connectionId: string | null) => void;
  placeCustomAsset: (kind: string, xM: number, zM: number) => void;
  moveCustomAsset: (assetId: string, xM: number, zM: number) => void;
  moveCustomAssetGroup: (deltaXM: number, deltaZM: number) => void;
  rotateCustomAssetGroup: (deltaDeg: number) => void;
  distributeCustomAssets: (axis: "x" | "z") => void;
  deleteCustomAssetGroup: () => void;
  updateCustomAsset: (
    assetId: string,
    patch: {
      name?: string;
      xM?: number;
      zM?: number;
      headingDeg?: number;
      enabled?: boolean;
      configuration?: Record<string, SiteConfigurationValue>;
    }
  ) => void;
  rotateCustomAsset: (assetId: string, deltaDeg: number) => void;
  duplicateCustomAsset: (assetId: string) => void;
  deleteCustomAsset: (assetId: string) => void;
  rerouteCustomConnection: (connectionId: string) => void;
  updateCustomConnectionRoute: (
    connectionId: string,
    route: Array<{ xM: number; zM: number }>
  ) => void;
  moveCustomConnectionRoutePoint: (
    connectionId: string,
    routePointIndex: number,
    xM: number,
    zM: number
  ) => void;
  deleteCustomConnection: (connectionId: string) => void;
  setCustomPlannerSnaps: (
    patch: Partial<Pick<PlannerDocumentState, "gridSnapM" | "rotationSnapDeg">>
  ) => void;
  undoCustomEdit: () => void;
  redoCustomEdit: () => void;
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  applyPatch: (patch: Partial<SimParams>) => void;
  undoParams: () => void;
  redoParams: () => void;
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
  importScenarios: (scenarios: StudyScenario[]) => ScenarioImportSummary;
  importCustomDesign: (design: SiteDesignDocument) => void;
  startTour: (id: string) => void;
  /** End the tour and put back the case it interrupted. */
  stopTour: () => void;
  /** End the tour and keep its case, one undo away from the one it interrupted. */
  keepTourCase: () => void;
  advanceTour: () => void;
  flyTo: (target: string) => void;
  pulseAsset: (asset: string, severity: string) => void;
}

/**
 * Normalize and simulate together, so two things hold at once:
 *
 * 1. `state.params` never holds a value the engine would clamp — otherwise the
 *    store, the URL serialized from it, and the displayed `SimResult`
 *    disagree (a hand-edited `?targetKgPerDay=999999` simulating at 20,000).
 * 2. The clamp stays visible. Normalizing first means `simulate()` sees
 *    in-range values and no longer raises `param-clamped` itself, so the
 *    warnings are carried onto the result here instead.
 *
 * Fixing (1) without (2) trades a silent inconsistency for a silent edit.
 */
function simulateStoreParams(input: Partial<SimParams>): {
  params: SimParams;
  result: SimResult;
} {
  const { params, warnings } = normalizeParams(input);
  const result = simulate(params);
  return {
    params,
    result:
      warnings.length > 0
        ? { ...result, warnings: [...warnings, ...result.warnings] }
        : result
  };
}

/** raw params from the URL, before normalization */
function initialParamInput(): Partial<SimParams> {
  return typeof window !== "undefined" ? parseParams(window.location.search) : {};
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

function evaluateCustomRuntime(design: SiteDesignDocument): {
  evaluation: SiteDesignEvaluation;
  result: SimResult;
  timeseries: TimeseriesResult;
} {
  const evaluation = evaluateSiteDesign(design);
  return {
    evaluation,
    result: evaluation.topologyValid
      ? evaluation.achievedResult
      : evaluation.baseResult,
    timeseries: simulateSiteDesignTimeseries(design, {
      cycles: 1,
      samplesPerCycle: 96
    })
  };
}

function sameParams(a: SimParams, b: SimParams): boolean {
  return (Object.keys(a) as Array<keyof SimParams>).every((key) => a[key] === b[key]);
}

function initialCompareParams(params: SimParams): SimParams {
  return { ...params, site: params.site === "polar" ? "equatorial" : "polar" };
}

function scenarioId(): string {
  scenarioNonce += 1;
  return `case-${Date.now().toString(36)}-${scenarioNonce.toString(36)}`;
}

function normalizeScenario(value: unknown): StudyScenario | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<StudyScenario>;
  const candidateKind = (value as { kind?: unknown }).kind;
  const baseValid = (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.params === "object" &&
    candidate.params !== null &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    typeof candidate.pinned === "boolean"
  );
  if (!baseValid) {
    return null;
  }
  if (
    candidateKind !== undefined &&
    candidateKind !== "authored" &&
    candidateKind !== "custom"
  ) {
    return null;
  }
  const parsedDesign = candidateKind === "custom"
    ? parseSiteDesign(candidate.design).document
    : null;
  if (candidateKind === "custom" && parsedDesign === null) {
    return null;
  }
  const kind = parsedDesign === null ? "authored" : "custom";
  return {
    id: candidate.id!,
    name: candidate.name!.slice(0, 80),
    kind,
    params: parsedDesign?.params ?? {
      ...DEFAULTS,
      ...candidate.params
    },
    ...(parsedDesign === null ? {} : { design: parsedDesign }),
    createdAt: candidate.createdAt!,
    updatedAt: candidate.updatedAt!,
    pinned: candidate.pinned!
  };
}


/** Site, and the equatorial process when it is not the default, for case names. */
function siteCaseName(params: Pick<SimParams, "site" | "equatorialProcess">): string {
  if (params.site === "polar") return "Polar";
  return params.equatorialProcess === "ilmenite" ? "Equatorial ilmenite" : "Equatorial";
}

function initialScenarioLibrary(params: SimParams, compareParams: SimParams): StudyScenario[] {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed
            .map(normalizeScenario)
            .filter((scenario): scenario is StudyScenario => scenario !== null)
            .slice(0, MAX_STUDY_SCENARIOS);
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
      name: `${siteCaseName(params)} baseline`,
      kind: "authored",
      params: { ...params },
      createdAt: now,
      updatedAt: now,
      pinned: true
    },
    {
      id: scenarioId(),
      name: `${siteCaseName(compareParams)} reference`,
      kind: "authored",
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
  const initial = simulateStoreParams(initialParamInput());
  const params = initial.params;
  const result = initial.result;
  const compareParams = initialCompareParams(params);
  const compareResult = simulate(compareParams);
  const timeseries = simulateTimeseries(params, { cycles: 1, samplesPerCycle: 96 });
  const time: TimeState = { tHours: 0, playing: false, rate: 48 };
  const timePoint = sampleTimeseries(timeseries, time.tHours);
  const scenarioLibrary = initialScenarioLibrary(params, compareParams);
  const customDesign = loadCustomSiteDraft() ?? createWorkingSiteDesign(params.site);
  const customRuntime = evaluateCustomRuntime(customDesign);
  const customSite: CustomSiteState = {
    design: customDesign,
    evaluation: customRuntime.evaluation,
    viewMode: "planner",
    findings: customRuntime.evaluation.findings,
    editor: customEditorSession(),
    history: emptyCustomHistory()
  };

  const commitCustomDesign = (
    design: SiteDesignDocument,
    selectedAssetId: string | null,
    selectedConnectionId: string | null = null,
    selectedAssetIds: string[] =
      selectedAssetId === null ? [] : [selectedAssetId],
    recordHistory = true,
    /**
     * Clamp warnings from normalizing the caller's input. The design handed to
     * `evaluateCustomRuntime` is already in range, so the engine cannot raise
     * `param-clamped` itself — without these the adjustment is invisible.
     */
    inputWarnings: Warning[] = []
  ): void => {
    const current = get().customSite;
    const runtime = evaluateCustomRuntime(design);
    const nextCustomSite: CustomSiteState = {
      ...current,
      design,
      evaluation: runtime.evaluation,
      findings: runtime.evaluation.findings,
      editor: customEditorSession({
        selectedAssetId,
        selectedAssetIds,
        selectedConnectionId
      }),
      history: recordHistory
        ? pushCustomHistory(current.history, current.design)
        : current.history
    };
    saveCustomSiteDraft(design);
    if (get().workspaceMode !== "custom") {
      set({ customSite: nextCustomSite });
      return;
    }
    const nextTime = {
      ...get().time,
      tHours: get().time.tHours % cycleHours(runtime.timeseries)
    };
    set({
      customSite: nextCustomSite,
      params: runtime.evaluation.effectiveParams,
      result:
        inputWarnings.length > 0
          ? { ...runtime.result, warnings: [...inputWarnings, ...runtime.result.warnings] }
          : runtime.result,
      timeseries: runtime.timeseries,
      time: nextTime,
      timePoint: sampleTimeseries(runtime.timeseries, nextTime.tHours),
      secHistory: pushHistory(
        get().secHistory,
        runtime.result.energy.secTotal_kWhPerKg
      )
    });
  };

  /**
   * Undo history covers the authored workspace only (Custom Site keeps its
   * own design history), never a tour's scripted beats, and nothing while a
   * caller has suppressed it.
   */
  let historySuppressed = 0;
  const withoutHistory = (change: () => void): void => {
    historySuppressed += 1;
    try {
      change();
    } finally {
      historySuppressed -= 1;
    }
  };
  const recordsAuthoredHistory = (): boolean =>
    historySuppressed === 0 && get().workspaceMode === "authored" && get().tour.activeId === null;

  /**
   * Push the case on screen onto the undo stack before it changes. Edits to
   * the same input in quick succession (one slider drag) are one step.
   */
  const rememberAuthoredCase = (coalesceKey: string | null = null): void => {
    const { params, ui, paramHistory } = get();
    const now = Date.now();
    const coalesce =
      coalesceKey !== null &&
      lastParamEdit !== null &&
      lastParamEdit.key === coalesceKey &&
      now - lastParamEdit.at < PARAM_EDIT_COALESCE_MS;
    lastParamEdit = coalesceKey === null ? null : { key: coalesceKey, at: now };
    set({
      paramHistory: {
        past: coalesce
          ? paramHistory.past
          : [...paramHistory.past, { params, scenarioName: ui.currentScenarioName }].slice(-PARAM_HISTORY_LIMIT),
        future: []
      }
    });
  };

  /** Simulate an authored case and show it, without touching the undo stack. */
  const showAuthoredCase = (input: Partial<SimParams>, scenarioName?: string): void => {
    const { params: nextParams, result: nextResult } = simulateStoreParams(input);
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
        currentScenarioName: scenarioName ?? `${nextParams.site === "polar" ? "Polar" : "Equatorial"} working case`
      }
    });
  };

  const activateCustomDesign = (
    source: SiteDesignDocument,
    resetHistory = false,
    scenarioName?: string
  ): void => {
    // Leaving the authored workspace: keep the case left behind one undo away
    // for when the user comes back.
    if (recordsAuthoredHistory()) {
      rememberAuthoredCase();
    }
    const runtime = evaluateCustomRuntime(source);
    const design = runtime.evaluation.normalizedDesign;
    const nextTime = {
      ...get().time,
      playing: false,
      tHours: get().time.tHours % cycleHours(runtime.timeseries)
    };
    saveCustomSiteDraft(design);
    set({
      workspaceMode: "custom",
      customSite: {
        ...get().customSite,
        design,
        evaluation: runtime.evaluation,
        findings: runtime.evaluation.findings,
        editor: resetHistory
          ? customEditorSession()
          : get().customSite.editor,
        history: resetHistory
          ? emptyCustomHistory()
          : get().customSite.history
      },
      params: runtime.evaluation.effectiveParams,
      result: runtime.result,
      timeseries: runtime.timeseries,
      time: nextTime,
      timePoint: sampleTimeseries(runtime.timeseries, nextTime.tHours),
      secHistory: pushHistory(
        get().secHistory,
        runtime.result.energy.secTotal_kWhPerKg
      ),
      ui: {
        ...get().ui,
        selectedAsset: null,
        learningMode: false,
        processFlow: false,
        ...(scenarioName === undefined
          ? {}
          : { currentScenarioName: scenarioName })
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
    tour: { activeId: null, beatIndex: 0, restore: null },
    secHistory: [result.energy.secTotal_kWhPerKg],
    paramHistory: { past: [], future: [] },
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
      // The custom design's params are not an authored case to undo back to;
      // the case left behind was remembered on the way out.
      const fromCustom = get().workspaceMode === "custom";
      set({ workspaceMode: "authored" });
      if (fromCustom) {
        withoutHistory(() => get().setParam("site", site));
      } else {
        get().setParam("site", site);
      }
    },

    enterCustomSite: () => {
      activateCustomDesign(
        get().customSite.design,
        false,
        get().customSite.design.name
      );
    },

    setCustomEnvironment: (environment) => {
      const current = get().customSite.design;
      const design: SiteDesignDocument = {
        ...current,
        environment,
        params: { ...current.params, site: environment },
        assets: [],
        connections: [],
        updatedAt: new Date().toISOString()
      };
      commitCustomDesign(design, null);
      set({
        customSite: {
          ...get().customSite,
          viewMode: "planner"
        },
        ui: { ...get().ui, selectedAsset: null }
      });
    },

    setCustomViewMode: (viewMode) => {
      const current = get().customSite;
      set({
        customSite: {
          ...current,
          viewMode,
          editor: viewMode === "explore"
            ? customEditorSession({
                selectedAssetId: current.editor.selectedAssetId,
                selectedAssetIds: current.editor.selectedAssetIds,
                selectedConnectionId: current.editor.selectedConnectionId
              })
            : current.editor
        }
      });
    },

    setCustomDesignName: (name) => {
      const current = get().customSite.design;
      const design = {
        ...current,
        name: name.slice(0, 120),
        updatedAt: new Date().toISOString()
      };
      commitCustomDesign(
        design,
        get().customSite.editor.selectedAssetId,
        get().customSite.editor.selectedConnectionId,
        get().customSite.editor.selectedAssetIds
      );
      if (get().workspaceMode === "custom") {
        set({
          ui: {
            ...get().ui,
            currentScenarioName: design.name
          }
        });
      }
    },

    resetCustomDesign: () => {
      const current = get().customSite.design;
      const design = createWorkingSiteDesign(current.environment);
      commitCustomDesign(design, null);
      set({
        customSite: {
          ...get().customSite,
          viewMode: "planner",
          editor: customEditorSession()
        }
      });
      if (get().workspaceMode === "custom") {
        set({
          ui: {
            ...get().ui,
            currentScenarioName: design.name
          }
        });
      }
    },

    seedCustomDesign: (environment) => {
      const identity = createWorkingSiteDesign(environment);
      const design = createSeededSiteDesign(environment, {
        id: identity.id,
        name: `${environment === "polar" ? "Polar" : "Equatorial"} reference copy`,
        timestamp: identity.createdAt
      });
      commitCustomDesign(design, null);
      set({
        customSite: {
          ...get().customSite,
          viewMode: "planner",
          editor: customEditorSession()
        },
        ui: {
          ...get().ui,
          selectedAsset: null,
          currentScenarioName: design.name
        }
      });
      if (get().workspaceMode !== "custom") {
        activateCustomDesign(design, false, design.name);
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
            selectedAssetIds: current.editor.selectedAssetIds,
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
            selectedAssetId: source.assetId,
            selectedAssetIds: [source.assetId]
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
              current.editor.selectedAssetId,
            selectedAssetIds: current.editor.connectionSource === null
              ? current.editor.selectedAssetIds
              : [current.editor.connectionSource.assetId]
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

    selectCustomAsset: (assetId, additive = false) => {
      const current = get().customSite;
      const selectedAssetId = assetId !== null &&
        current.design.assets.some((asset) => asset.id === assetId)
        ? assetId
        : null;
      const selectedAssetIds = selectedAssetId === null
        ? []
        : additive
          ? current.editor.selectedAssetIds.includes(selectedAssetId)
            ? current.editor.selectedAssetIds.filter((id) =>
                id !== selectedAssetId
              )
            : [...current.editor.selectedAssetIds, selectedAssetId]
          : [selectedAssetId];
      set({
        customSite: {
          ...current,
          editor: customEditorSession({
            selectedAssetId: selectedAssetIds.at(-1) ?? null,
            selectedAssetIds
          })
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
      const asset = current.design.assets.find((item) => item.id === assetId);
      if (asset === undefined) {
        return;
      }
      if (
        current.editor.selectedAssetIds.length > 1 &&
        current.editor.selectedAssetIds.includes(assetId)
      ) {
        commitCustomDesign(
          moveSiteAssetGroup(
            current.design,
            current.editor.selectedAssetIds,
            xM - asset.transform.xM,
            zM - asset.transform.zM
          ),
          assetId,
          null,
          current.editor.selectedAssetIds
        );
        return;
      }
      commitCustomDesign(
        updateSiteAsset(current.design, assetId, { xM, zM }),
        assetId
      );
    },

    moveCustomAssetGroup: (deltaXM, deltaZM) => {
      const current = get().customSite;
      const ids = current.editor.selectedAssetIds;
      if (ids.length === 0) {
        return;
      }
      commitCustomDesign(
        moveSiteAssetGroup(current.design, ids, deltaXM, deltaZM),
        ids.at(-1) ?? null,
        null,
        ids
      );
    },

    rotateCustomAssetGroup: (deltaDeg) => {
      const current = get().customSite;
      const ids = current.editor.selectedAssetIds;
      if (ids.length < 2) {
        return;
      }
      commitCustomDesign(
        rotateSiteAssetGroup(current.design, ids, deltaDeg),
        ids.at(-1) ?? null,
        null,
        ids
      );
    },

    distributeCustomAssets: (axis) => {
      const current = get().customSite;
      const ids = current.editor.selectedAssetIds;
      if (ids.length < 3) {
        return;
      }
      commitCustomDesign(
        distributeSiteAssets(current.design, ids, axis),
        ids.at(-1) ?? null,
        null,
        ids
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

    deleteCustomAssetGroup: () => {
      const current = get().customSite;
      if (current.editor.selectedAssetIds.length === 0) {
        return;
      }
      const design = current.editor.selectedAssetIds.reduce(
        (next, assetId) => removeSiteAsset(next, assetId),
        current.design
      );
      commitCustomDesign(design, null);
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

    updateCustomConnectionRoute: (connectionId, route) => {
      const current = get().customSite;
      if (!current.design.connections.some((connection) =>
        connection.id === connectionId
      )) {
        return;
      }
      commitCustomDesign(
        updateSiteConnectionRoute(current.design, connectionId, route),
        null,
        connectionId
      );
    },

    moveCustomConnectionRoutePoint: (
      connectionId,
      routePointIndex,
      xM,
      zM
    ) => {
      const current = get().customSite;
      const connection = current.design.connections.find((item) =>
        item.id === connectionId
      );
      if (connection === undefined) {
        return;
      }
      const route = siteConnectionRoutePoints(
        current.design,
        connection
      ).slice(1, -1);
      if (route[routePointIndex] === undefined) {
        return;
      }
      route[routePointIndex] = { xM, zM };
      commitCustomDesign(
        updateSiteConnectionRoute(current.design, connectionId, route),
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
        current.editor.selectedConnectionId,
        current.editor.selectedAssetIds
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
      const selectedAssetIds = current.editor.selectedAssetIds.filter((id) =>
        restored.design.assets.some((asset) => asset.id === id)
      );
      const selectedConnectionId = current.editor.selectedConnectionId !== null &&
        restored.design.connections.some((connection) =>
          connection.id === current.editor.selectedConnectionId)
        ? current.editor.selectedConnectionId
        : null;
      const runtime = evaluateCustomRuntime(restored.design);
      const nextCustomSite: CustomSiteState = {
        ...current,
        design: restored.design,
        evaluation: runtime.evaluation,
        findings: runtime.evaluation.findings,
        editor: customEditorSession({
          selectedAssetId: selectedAssetId ?? selectedAssetIds.at(-1) ?? null,
          selectedAssetIds,
          selectedConnectionId
        }),
        history: restored.history
      };
      saveCustomSiteDraft(restored.design);
      if (get().workspaceMode !== "custom") {
        set({ customSite: nextCustomSite });
        return;
      }
      const nextTime = {
        ...get().time,
        tHours: get().time.tHours % cycleHours(runtime.timeseries)
      };
      set({
        customSite: nextCustomSite,
        params: runtime.evaluation.effectiveParams,
        result: runtime.result,
        timeseries: runtime.timeseries,
        time: nextTime,
        timePoint: sampleTimeseries(runtime.timeseries, nextTime.tHours)
      });
    },

    redoCustomEdit: () => {
      const current = get().customSite;
      const restored = redoCustomDesign(current.design, current.history);
      if (restored === null) {
        return;
      }
      const selectedAssetId = current.editor.selectedAssetId !== null &&
        restored.design.assets.some((asset) =>
          asset.id === current.editor.selectedAssetId)
        ? current.editor.selectedAssetId
        : null;
      const selectedAssetIds = current.editor.selectedAssetIds.filter((id) =>
        restored.design.assets.some((asset) => asset.id === id)
      );
      const selectedConnectionId = current.editor.selectedConnectionId !== null &&
        restored.design.connections.some((connection) =>
          connection.id === current.editor.selectedConnectionId)
        ? current.editor.selectedConnectionId
        : null;
      const runtime = evaluateCustomRuntime(restored.design);
      const nextCustomSite: CustomSiteState = {
        ...current,
        design: restored.design,
        evaluation: runtime.evaluation,
        findings: runtime.evaluation.findings,
        editor: customEditorSession({
          selectedAssetId: selectedAssetId ?? selectedAssetIds.at(-1) ?? null,
          selectedAssetIds,
          selectedConnectionId
        }),
        history: restored.history
      };
      saveCustomSiteDraft(restored.design);
      if (get().workspaceMode !== "custom") {
        set({ customSite: nextCustomSite });
        return;
      }
      const nextTime = {
        ...get().time,
        tHours: get().time.tHours % cycleHours(runtime.timeseries)
      };
      set({
        customSite: nextCustomSite,
        params: runtime.evaluation.effectiveParams,
        result: runtime.result,
        timeseries: runtime.timeseries,
        time: nextTime,
        timePoint: sampleTimeseries(runtime.timeseries, nextTime.tHours)
      });
    },

    setParam: (key, value) => {
      if (get().workspaceMode === "custom" && key === "site") {
        get().setCustomEnvironment(value as SiteEnvironment);
        return;
      }
      const nextInput = { ...get().params, [key]: value };
      const { params: nextParams, warnings: inputWarnings } = normalizeParams(nextInput);
      if (get().workspaceMode === "custom") {
        const nextCustomDesign = {
          ...get().customSite.design,
          params: nextParams,
          updatedAt: new Date().toISOString()
        };
        commitCustomDesign(
          nextCustomDesign,
          get().customSite.editor.selectedAssetId,
          get().customSite.editor.selectedConnectionId,
          get().customSite.editor.selectedAssetIds,
          true,
          inputWarnings
        );
        return;
      }
      if (recordsAuthoredHistory() && !sameParams(nextParams, get().params)) {
        // A site switch is always its own step.
        rememberAuthoredCase(key === "site" ? null : String(key));
      }
      const nextResult = simulateStoreParams(nextInput).result;
      const nextTimeseries = simulateTimeseries(nextParams, { cycles: 1, samplesPerCycle: 96 });
      const nextTime = { ...get().time, tHours: get().time.tHours % cycleHours(nextTimeseries) };
      set({
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
      if (recordsAuthoredHistory() && !sameParams(normalizeParams(patch).params, get().params)) {
        rememberAuthoredCase();
      }
      showAuthoredCase(patch);
    },

    undoParams: () => {
      // During a tour, undo means "give me my case back".
      if (get().tour.activeId !== null) {
        get().stopTour();
        return;
      }
      const { paramHistory, params, ui, workspaceMode } = get();
      const previous = paramHistory.past.at(-1);
      if (workspaceMode !== "authored" || previous === undefined) {
        return;
      }
      lastParamEdit = null;
      set({
        paramHistory: {
          past: paramHistory.past.slice(0, -1),
          future: [{ params, scenarioName: ui.currentScenarioName }, ...paramHistory.future].slice(0, PARAM_HISTORY_LIMIT)
        }
      });
      showAuthoredCase(previous.params, previous.scenarioName);
    },

    redoParams: () => {
      if (get().tour.activeId !== null) {
        get().stopTour();
        return;
      }
      const { paramHistory, params, ui, workspaceMode } = get();
      const next = paramHistory.future[0];
      if (workspaceMode !== "authored" || next === undefined) {
        return;
      }
      lastParamEdit = null;
      set({
        paramHistory: {
          past: [...paramHistory.past, { params, scenarioName: ui.currentScenarioName }].slice(-PARAM_HISTORY_LIMIT),
          future: paramHistory.future.slice(1)
        }
      });
      showAuthoredCase(next.params, next.scenarioName);
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
      if (recordsAuthoredHistory()) {
        rememberAuthoredCase();
      }
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
      const {
        customSite,
        params,
        ui,
        workspaceMode,
        scenarioLibrary: current
      } = get();
      if (current.length >= MAX_STUDY_SCENARIOS) {
        return;
      }
      const now = Date.now();
      const scenarioName =
        name?.trim() ||
        (workspaceMode === "custom"
          ? customSite.design.name.trim()
          : ui.currentScenarioName.trim()) ||
        `Study case ${current.length + 1}`;
      const design = workspaceMode === "custom"
        ? structuredClone(customSite.evaluation.normalizedDesign)
        : undefined;
      const next: StudyScenario[] = [
        ...current,
        {
          id: scenarioId(),
          name: scenarioName,
          kind: workspaceMode,
          params: design?.params ?? { ...params },
          ...(design === undefined ? {} : { design }),
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
      if (scenario.kind === "custom" && scenario.design !== undefined) {
        activateCustomDesign(
          structuredClone(scenario.design),
          true,
          scenario.name
        );
        return;
      }
      const fromCustom = get().workspaceMode === "custom";
      set({ workspaceMode: "authored" });
      if (fromCustom) {
        withoutHistory(() => get().applyPatch(scenario.params));
      } else {
        get().applyPatch(scenario.params);
      }
      set({ ui: { ...get().ui, currentScenarioName: scenario.name } });
    },

    renameScenario: (id, name) => {
      const next = get().scenarioLibrary.map((scenario) =>
        scenario.id === id
          ? {
              ...scenario,
              name: name.slice(0, 80),
              ...(scenario.design === undefined
                ? {}
                : {
                    design: {
                      ...scenario.design,
                      name: name.slice(0, 120),
                      updatedAt: new Date().toISOString()
                    }
                  }),
              updatedAt: Date.now()
            }
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
      const duplicateName = `${scenario.name} copy`;
      const duplicatedDesign = scenario.design === undefined
        ? undefined
        : {
            ...structuredClone(scenario.design),
            id: `custom-${now.toString(36)}-${scenarioNonce.toString(36)}`,
            name: duplicateName,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString()
          };
      const next: StudyScenario[] = [
        ...current,
        {
          ...scenario,
          id: scenarioId(),
          name: duplicateName,
          params: { ...scenario.params },
          ...(duplicatedDesign === undefined
            ? {}
            : { design: duplicatedDesign }),
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
      const incoming = scenarios
        .map(normalizeScenario)
        .filter((scenario): scenario is StudyScenario => scenario !== null);
      const byId = new Map(get().scenarioLibrary.map((scenario) => [scenario.id, scenario]));
      const summary: ScenarioImportSummary = { added: 0, replaced: 0, skipped: 0, unpinned: 0 };
      for (const scenario of incoming) {
        if (byId.size >= MAX_STUDY_SCENARIOS && !byId.has(scenario.id)) {
          summary.skipped += 1;
          continue;
        }
        if (byId.has(scenario.id)) {
          summary.replaced += 1;
        } else {
          summary.added += 1;
        }
        byId.set(scenario.id, {
          ...scenario,
          // deliberately NOT normalized: the library stores what was imported,
          // and loading it goes through applyPatch, which clamps and reports
          // `param-clamped`. Normalizing here would silently drop that report.
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
        if (pinned <= MAX_PINNED_SCENARIOS) {
          return scenario;
        }
        summary.unpinned += 1;
        return { ...scenario, pinned: false };
      });
      persistScenarioLibrary(normalized);
      set({ scenarioLibrary: normalized });
      return summary;
    },

    importCustomDesign: (design) => {
      const parsed = parseSiteDesign(design);
      if (parsed.document === null) {
        return;
      }
      activateCustomDesign(parsed.document, true, parsed.document.name);
    },

    startTour: (id) => {
      const { tour, params, ui, workspaceMode } = get();
      // A tour started from inside another one still returns to the user's case.
      const restore = tour.restore ??
        (workspaceMode === "authored" ? { params, scenarioName: ui.currentScenarioName } : null);
      set({ tour: { activeId: id, beatIndex: 0, restore }, time: { ...get().time, playing: false } });
    },

    stopTour: () => {
      const { restore } = get().tour;
      set({ tour: { activeId: null, beatIndex: 0, restore: null } });
      if (restore === null) {
        return;
      }
      if (sameParams(restore.params, get().params)) {
        set({ ui: { ...get().ui, currentScenarioName: restore.scenarioName } });
        return;
      }
      showAuthoredCase(restore.params, restore.scenarioName);
    },

    keepTourCase: () => {
      const { restore } = get().tour;
      set({ tour: { activeId: null, beatIndex: 0, restore: null } });
      if (restore === null || sameParams(restore.params, get().params)) {
        return;
      }
      lastParamEdit = null;
      const { paramHistory } = get();
      set({ paramHistory: { past: [...paramHistory.past, restore].slice(-PARAM_HISTORY_LIMIT), future: [] } });
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
      // The page (or a test's DOM) can be gone by the time the throttle fires.
      if (typeof window === "undefined") return;
      const target = lastQuery !== null && lastQuery.length > 0 ? `?${lastQuery}` : window.location.pathname;
      window.history.replaceState(null, "", target);
    }, 500);
  });
}
