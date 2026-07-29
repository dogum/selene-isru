import { useEffect, useRef, useState } from "react";
import {
  createBlankSiteDesign,
  SEEDED_SITE_DESIGN_FIXTURES
} from "@selene-isru/engine";
import type { SiteDesignDocument, SiteViewMode } from "@selene-isru/engine";
import { useIsMobile } from "../lib/hooks";
import { useStore } from "../state/store";
import { Viewer } from "../viewer/Viewer";

type DemoVector3 = readonly [number, number, number];
type CustomDemoStage = 0 | 1 | 2 | 3;

interface SeleneDemoBridge {
  ready: () => boolean;
  setCameraPose: (position: DemoVector3, target: DemoVector3) => void;
  setTargetKgPerDay: (value: number) => void;
  setCustomStage: (stage: CustomDemoStage) => void;
  setCustomViewMode: (viewMode: SiteViewMode) => void;
  selectCustomAsset: (assetId: string | null) => void;
  selectCustomConnection: (connectionId: string | null) => void;
  snapshot: () => {
    site: string;
    targetKgPerDay: number;
    gridPowerW: number;
    secTotalKWhPerKg: number;
    massThroughputDays: number;
    leverageL: number;
    missions: number;
  };
  customSnapshot: () => {
    assets: number;
    connections: number;
    topologyValid: boolean;
    plannedTargetKgPerDay: number;
    achievableOutputKgPerDay: number;
    cableMassKg: number;
    routeLoadW: number;
  };
}

declare global {
  interface Window {
    __SELENE_DEMO__?: SeleneDemoBridge;
  }
}

const CUSTOM_DEMO_STAGE_ASSET_COUNTS: Record<CustomDemoStage, number> = {
  0: 0,
  1: 3,
  2: 6,
  3: 8
};

const CUSTOM_DEMO_STAGE_CONNECTION_IDS: Record<CustomDemoStage, string[]> = {
  0: [],
  1: ["eq-regolith-pickup", "eq-reactor-feed"],
  2: [
    "eq-regolith-pickup",
    "eq-reactor-feed",
    "eq-reactor-power",
    "eq-oxygen-storage",
    "eq-slag-casting"
  ],
  3: SEEDED_SITE_DESIGN_FIXTURES.equatorial.connections.map(
    (connection) => connection.id
  )
};

function customDemoDesign(stage: CustomDemoStage): SiteDesignDocument {
  if (stage === 0) {
    return createBlankSiteDesign("equatorial", {
      id: "demo-equatorial-first-camp",
      name: "Equatorial First Camp",
      timestamp: "2026-07-29T00:00:00.000Z"
    });
  }
  const fixture = SEEDED_SITE_DESIGN_FIXTURES.equatorial;
  const assets = fixture.assets
    .slice(0, CUSTOM_DEMO_STAGE_ASSET_COUNTS[stage])
    .map((asset) => ({
      ...asset,
      transform: { ...asset.transform },
      configuration: { ...asset.configuration }
    }));
  const assetIds = new Set(assets.map((asset) => asset.id));
  const connectionIds = new Set(CUSTOM_DEMO_STAGE_CONNECTION_IDS[stage]);
  return {
    ...fixture,
    id: "demo-equatorial-first-camp",
    name: "Equatorial First Camp",
    assets,
    connections: fixture.connections
      .filter((connection) =>
        connectionIds.has(connection.id) &&
        assetIds.has(connection.from.assetId) &&
        assetIds.has(connection.to.assetId)
      )
      .map((connection) => ({
        ...connection,
        from: { ...connection.from },
        to: { ...connection.to },
        route: connection.route.map((point) => ({ ...point })),
        configuration: { ...connection.configuration }
      })),
    planner: {
      ...fixture.planner,
      annotations: fixture.planner.annotations.map((annotation) => ({
        ...annotation
      }))
    },
    params: { ...fixture.params },
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z"
  };
}

/**
 * Mounts the vanilla-Three Viewer (§3.1). React never touches Three objects;
 * it forwards store changes through viewer.apply()/flyTo()/focusAsset().
 */
export function Scene(): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const [rendererStatus, setRendererStatus] = useState<
    "ready" | "lost" | "restoring" | "failed"
  >("ready");

  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    let viewer: Viewer;
    try {
      viewer = new Viewer(el, isMobile, {
        onSelectAsset: (assetKey, additive = false) => {
          const state = useStore.getState();
          if (state.workspaceMode === "custom") {
            state.selectCustomAsset(assetKey, additive);
          } else {
            state.setUi({ selectedAsset: assetKey });
          }
        },
        onPlaceCustomAsset: (kind, xM, zM) =>
          useStore.getState().placeCustomAsset(kind, xM, zM),
        onMoveCustomAsset: (assetId, xM, zM) =>
          useStore.getState().moveCustomAsset(assetId, xM, zM),
        onMoveCustomRoutePoint: (
          connectionId,
          routePointIndex,
          xM,
          zM
        ) => useStore.getState().moveCustomConnectionRoutePoint(
          connectionId,
          routePointIndex,
          xM,
          zM
        ),
        onBeginCustomConnection: (source) =>
          useStore.getState().beginCustomConnection(source),
        onCompleteCustomConnection: (target) =>
          useStore.getState().completeCustomConnection(target),
        onSelectCustomConnection: (connectionId) =>
          useStore.getState().selectCustomConnection(connectionId),
        onRendererStatus: setRendererStatus
      });
    } catch (error: unknown) {
      console.error("[selene] failed to initialize WebGL viewer", error);
      setRendererStatus("failed");
      return;
    }
    const initial = useStore.getState();
    viewer.setWorkspaceState(
      initial.workspaceMode,
      initial.customSite.design.environment,
      initial.customSite.viewMode
    );
    viewer.setCustomDesign(
      initial.customSite.design,
      initial.customSite.editor.selectedAssetId,
      initial.customSite.editor.selectedConnectionId,
      initial.customSite.evaluation,
      initial.customSite.editor.selectedAssetIds
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
          setCustomStage: (stage) => {
            const state = useStore.getState();
            state.importCustomDesign(customDemoDesign(stage));
            useStore.getState().setCustomViewMode("planner");
          },
          setCustomViewMode: (viewMode) =>
            useStore.getState().setCustomViewMode(viewMode),
          selectCustomAsset: (assetId) =>
            useStore.getState().selectCustomAsset(assetId),
          selectCustomConnection: (connectionId) =>
            useStore.getState().selectCustomConnection(connectionId),
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
          },
          customSnapshot: () => {
            const state = useStore.getState();
            const evaluation = state.customSite.evaluation;
            return {
              assets: state.customSite.design.assets.length,
              connections: state.customSite.design.connections.length,
              topologyValid: evaluation.topologyValid,
              plannedTargetKgPerDay: evaluation.plannedTargetKgPerDay,
              achievableOutputKgPerDay: evaluation.achievableOutputKgPerDay,
              cableMassKg: evaluation.spatial.cableMassKg,
              routeLoadW: evaluation.spatial.supplementalLoadW
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
        state.customSite.evaluation !== prev.customSite.evaluation ||
        state.customSite.editor.selectedAssetId !== prev.customSite.editor.selectedAssetId ||
        state.customSite.editor.selectedAssetIds !==
          prev.customSite.editor.selectedAssetIds ||
        state.customSite.editor.selectedConnectionId !==
          prev.customSite.editor.selectedConnectionId
      ) {
        viewer.setCustomDesign(
          state.customSite.design,
          state.customSite.editor.selectedAssetId,
          state.customSite.editor.selectedConnectionId,
          state.customSite.evaluation,
          state.customSite.editor.selectedAssetIds
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

  return (
    <div className="stage-scene">
      <div ref={ref} className="stage-canvas" aria-label="3D site diorama" />
      {rendererStatus !== "ready" && (
        <div
          className={`stage-renderer-status ${rendererStatus}`}
          role={rendererStatus === "failed" ? "alert" : "status"}
          aria-live="assertive"
        >
          <strong>
            {rendererStatus === "lost"
              ? "3D CONTEXT INTERRUPTED"
              : rendererStatus === "restoring"
                ? "RESTORING 3D SITE"
                : "3D VIEW UNAVAILABLE"}
          </strong>
          <span>
            {rendererStatus === "failed"
              ? "Your locally saved design is intact. Reload to retry the scene."
              : "The planning document is preserved while the scene rebuilds."}
          </span>
          {rendererStatus === "failed" && (
            <button onClick={() => window.location.reload()}>
              RELOAD VIEW
            </button>
          )}
        </div>
      )}
    </div>
  );
}
