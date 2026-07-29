import { useEffect, useRef } from "react";
import { useIsMobile } from "../lib/hooks";
import { useStore } from "../state/store";
import { Viewer } from "../viewer/Viewer";

type DemoVector3 = readonly [number, number, number];

interface SeleneDemoBridge {
  ready: () => boolean;
  setCameraPose: (position: DemoVector3, target: DemoVector3) => void;
  setTargetKgPerDay: (value: number) => void;
  snapshot: () => {
    site: string;
    targetKgPerDay: number;
    gridPowerW: number;
    secTotalKWhPerKg: number;
    massThroughputDays: number;
    leverageL: number;
    missions: number;
  };
}

declare global {
  interface Window {
    __SELENE_DEMO__?: SeleneDemoBridge;
  }
}

/**
 * Mounts the vanilla-Three Viewer (§3.1). React never touches Three objects;
 * it forwards store changes through viewer.apply()/flyTo()/focusAsset().
 */
export function Scene(): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const viewer = new Viewer(el, isMobile, {
      onSelectAsset: (assetKey) => {
        const state = useStore.getState();
        if (state.workspaceMode === "custom") {
          state.selectCustomAsset(assetKey);
        } else {
          state.setUi({ selectedAsset: assetKey });
        }
      },
      onPlaceCustomAsset: (kind, xM, zM) =>
        useStore.getState().placeCustomAsset(kind, xM, zM),
      onMoveCustomAsset: (assetId, xM, zM) =>
        useStore.getState().moveCustomAsset(assetId, xM, zM),
      onBeginCustomConnection: (source) =>
        useStore.getState().beginCustomConnection(source),
      onCompleteCustomConnection: (target) =>
        useStore.getState().completeCustomConnection(target),
      onSelectCustomConnection: (connectionId) =>
        useStore.getState().selectCustomConnection(connectionId)
    });
    const initial = useStore.getState();
    viewer.setWorkspaceState(
      initial.workspaceMode,
      initial.customSite.design.environment,
      initial.customSite.viewMode
    );
    viewer.setCustomDesign(
      initial.customSite.design,
      initial.customSite.editor.selectedAssetId,
      initial.customSite.editor.selectedConnectionId
    );
    viewer.setCustomEditorState(
      initial.customSite.editor.placementKind,
      initial.customSite.editor.connectionSource,
      initial.customSite.design.planner.gridSnapM
    );
    viewer.apply(initial.result, initial.params);
    viewer.applyTime(
      initial.timePoint,
      initial.params,
      initial.result,
      initial.timeseries.points.at(-1)?.tHours ?? 708
    );
    viewer.setLearningState(initial.ui.learningMode, initial.ui.processFlow);

    const demoEnabled = new URLSearchParams(window.location.search).get("demo") === "1";
    const demoBridge: SeleneDemoBridge | null = demoEnabled
      ? {
          ready: () => viewer.isReady(),
          setCameraPose: (position, target) => viewer.setCameraPose(position, target),
          setTargetKgPerDay: (value) => useStore.getState().setParam("targetKgPerDay", value),
          snapshot: () => {
            const state = useStore.getState();
            return {
              site: state.params.site,
              targetKgPerDay: state.params.targetKgPerDay,
              gridPowerW: state.result.energy.gridPowerW,
              secTotalKWhPerKg: state.result.energy.secTotal_kWhPerKg,
              massThroughputDays: state.result.logistics.plantMassThroughputDays,
              leverageL: state.result.logistics.leverageL,
              missions: state.result.logistics.nMissions
            };
          }
        }
      : null;
    if (demoBridge !== null) {
      window.__SELENE_DEMO__ = demoBridge;
      window.dispatchEvent(new Event("selene:demo-ready"));
    }

    const unsub = useStore.subscribe((state, prev) => {
      if (
        state.workspaceMode !== prev.workspaceMode ||
        state.customSite.design.environment !== prev.customSite.design.environment ||
        state.customSite.viewMode !== prev.customSite.viewMode
      ) {
        viewer.setWorkspaceState(
          state.workspaceMode,
          state.customSite.design.environment,
          state.customSite.viewMode
        );
      }
      if (
        state.customSite.design !== prev.customSite.design ||
        state.customSite.editor.selectedAssetId !== prev.customSite.editor.selectedAssetId ||
        state.customSite.editor.selectedConnectionId !==
          prev.customSite.editor.selectedConnectionId
      ) {
        viewer.setCustomDesign(
          state.customSite.design,
          state.customSite.editor.selectedAssetId,
          state.customSite.editor.selectedConnectionId
        );
      }
      if (
        state.customSite.editor.placementKind !== prev.customSite.editor.placementKind ||
        state.customSite.editor.connectionSource !== prev.customSite.editor.connectionSource ||
        state.customSite.design.planner.gridSnapM !== prev.customSite.design.planner.gridSnapM
      ) {
        viewer.setCustomEditorState(
          state.customSite.editor.placementKind,
          state.customSite.editor.connectionSource,
          state.customSite.design.planner.gridSnapM
        );
      }
      if (state.result !== prev.result) {
        viewer.apply(state.result, state.params);
      }
      if (state.timePoint !== prev.timePoint || state.result !== prev.result) {
        viewer.applyTime(
          state.timePoint,
          state.params,
          state.result,
          state.timeseries.points.at(-1)?.tHours ?? 708
        );
      }
      if (state.ui.flyRequest !== prev.ui.flyRequest && state.ui.flyRequest !== null) {
        viewer.flyTo(state.ui.flyRequest.target);
      }
      if (state.ui.pulseRequest !== prev.ui.pulseRequest && state.ui.pulseRequest !== null) {
        viewer.focusAsset(state.ui.pulseRequest.asset, state.ui.pulseRequest.severity);
      }
      if (
        state.workspaceMode === "authored" &&
        state.ui.selectedAsset !== prev.ui.selectedAsset
      ) {
        viewer.setSelectedAsset(state.ui.selectedAsset);
      }
      if (
        state.ui.learningMode !== prev.ui.learningMode ||
        state.ui.processFlow !== prev.ui.processFlow
      ) {
        viewer.setLearningState(state.ui.learningMode, state.ui.processFlow);
      }
    });

    return () => {
      unsub();
      if (demoBridge !== null && window.__SELENE_DEMO__ === demoBridge) {
        delete window.__SELENE_DEMO__;
      }
      viewer.dispose();
    };
  }, [isMobile]);

  return <div ref={ref} className="stage-canvas" aria-label="3D site diorama" />;
}
