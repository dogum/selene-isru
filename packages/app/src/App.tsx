import { lazy, Suspense } from "react";
import { AboutModal } from "./components/AboutModal";
import { AssetInspector } from "./components/AssetInspector";
import { ControlRail } from "./components/ControlRail";
import { KpiStrip } from "./components/KpiStrip";
import { KpiInspector } from "./components/KpiInspector";
import { LearningToolbar } from "./components/LearningToolbar";
import { MissionBrief } from "./components/MissionBrief";
import { PhotoModeExit } from "./components/PhotoModeExit";
import { Scene } from "./components/Scene";
import { CustomSiteWorkspace } from "./components/site-design/CustomSiteWorkspace";
import { SlideOver, ViewTabs } from "./components/SlideOver";
import { TimelineStrip } from "./components/TimelineStrip";
import { TopBar } from "./components/TopBar";
import { TourOverlay } from "./components/TourOverlay";
import { WarningsDock } from "./components/WarningsDock";
import { MobileOverlay } from "./components/mobile/MobileShell";
import { useIsMobile } from "./lib/hooks";
import { useStore } from "./state/store";

const CausalGraph = lazy(async () => ({ default: (await import("./components/CausalGraph")).CausalGraph }));
const ConservationInspector = lazy(async () => ({ default: (await import("./components/ConservationInspector")).ConservationInspector }));

export default function App(): React.JSX.Element {
  const isMobile = useIsMobile();
  const workspaceMode = useStore((state) => state.workspaceMode);
  const custom = workspaceMode === "custom";

  return (
    <>
      <div className={`app ${custom ? "custom-site-app" : ""}`}>
        <div className="app-topbar">
          <TopBar />
        </div>

        {!custom && !isMobile && <ControlRail />}

        <main className="app-stage">
          <Scene />
          {custom ? (
            <CustomSiteWorkspace />
          ) : (
            <>
              <AssetInspector />
              <TimelineStrip />
              <LearningToolbar />
              <TourOverlay />
              {!isMobile && (
                <>
                  <ViewTabs />
                  <SlideOver />
                  <WarningsDock />
                </>
              )}
              {isMobile && <MobileOverlay />}
            </>
          )}
        </main>

        {!custom && !isMobile && (
          <div className="app-kpi">
            <KpiStrip />
          </div>
        )}

        <AboutModal />
        {!custom && (
          <>
            <MissionBrief />
            <KpiInspector />
            <Suspense fallback={null}><CausalGraph /></Suspense>
            <Suspense fallback={null}><ConservationInspector /></Suspense>
          </>
        )}
      </div>
      <PhotoModeExit />
    </>
  );
}
