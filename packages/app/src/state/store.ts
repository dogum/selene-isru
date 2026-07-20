import { DEFAULTS, simulate, simulateTimeseries } from "@selene-isru/engine";
import type { SimParams, SimResult, TimeseriesPoint, TimeseriesResult } from "@selene-isru/engine";
import { create } from "zustand";
import { parseParams, serializeParams } from "../lib/url";

export type ViewTab = "site" | "energy" | "mass" | "power" | "compare";
export type SheetDetent = "peek" | "half" | "full";
export type MobileTab = "controls" | "energy" | "mass" | "power" | "compare";

export interface UiState {
  view: ViewTab;
  aboutOpen: boolean;
  dockOpen: boolean;
  presetsOpen: boolean;
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

const SEC_HISTORY_LENGTH = 60;

interface Store {
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
  ui: UiState;
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
      netProductionKgPerDay: 0
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
    netProductionKgPerDay: lerp(a.netProductionKgPerDay, b.netProductionKgPerDay)
  };
}

function cycleHours(timeseries: TimeseriesResult): number {
  return Math.max(1, timeseries.points.at(-1)?.tHours ?? 1);
}

function initialCompareParams(params: SimParams): SimParams {
  return { ...params, site: params.site === "polar" ? "equatorial" : "polar" };
}

export const useStore = create<Store>((set, get) => {
  const params = initialParams();
  const result = simulate(params);
  const compareParams = initialCompareParams(params);
  const compareResult = simulate(compareParams);
  const timeseries = simulateTimeseries(params, { cycles: 1, samplesPerCycle: 96 });
  const time: TimeState = { tHours: 0, playing: false, rate: 48 };
  const timePoint = sampleTimeseries(timeseries, time.tHours);

  return {
    params,
    result,
    compareParams,
    compareResult,
    timeseries,
    time,
    timePoint,
    tour: { activeId: null, beatIndex: 0 },
    secHistory: [result.energy.secTotal_kWhPerKg],
    ui: {
      view: "site",
      aboutOpen: false,
      dockOpen: false,
      presetsOpen: false,
      flyRequest: null,
      pulseRequest: null,
      sheetDetent: "peek",
      mobileTab: "controls"
    },

    setParam: (key, value) => {
      const nextParams = { ...get().params, [key]: value };
      const nextResult = simulate(nextParams);
      const nextTimeseries = simulateTimeseries(nextParams, { cycles: 1, samplesPerCycle: 96 });
      const nextTime = { ...get().time, tHours: get().time.tHours % cycleHours(nextTimeseries) };
      set({
        params: nextParams,
        result: nextResult,
        timeseries: nextTimeseries,
        time: nextTime,
        timePoint: sampleTimeseries(nextTimeseries, nextTime.tHours),
        secHistory: pushHistory(get().secHistory, nextResult.energy.secTotal_kWhPerKg)
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
        secHistory: pushHistory(get().secHistory, nextResult.energy.secTotal_kWhPerKg)
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
      set({ compareParams: { ...params }, compareResult: result });
    },

    swapCompare: () => {
      const { params, result, compareParams, compareResult, time } = get();
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
        secHistory: pushHistory(get().secHistory, compareResult.energy.secTotal_kWhPerKg)
      });
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
