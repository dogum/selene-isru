import { AboutModal } from "./components/AboutModal";
import { ControlRail } from "./components/ControlRail";
import { KpiStrip } from "./components/KpiStrip";
import { Scene } from "./components/Scene";
import { SlideOver, ViewTabs } from "./components/SlideOver";
import { TimelineStrip } from "./components/TimelineStrip";
import { TopBar } from "./components/TopBar";
import { TourOverlay } from "./components/TourOverlay";
import { WarningsDock } from "./components/WarningsDock";
import { MobileOverlay } from "./components/mobile/MobileShell";
import { useIsMobile } from "./lib/hooks";

export default function App(): React.JSX.Element {
  const isMobile = useIsMobile();

  return (
    <div className="app">
      <div className="app-topbar">
        <TopBar />
      </div>

      {!isMobile && <ControlRail />}

      <main className="app-stage">
        <Scene />
        <TimelineStrip />
        <TourOverlay />
        {!isMobile && (
          <>
            <ViewTabs />
            <SlideOver />
            <WarningsDock />
          </>
        )}
        {isMobile && <MobileOverlay />}
      </main>

      {!isMobile && (
        <div className="app-kpi">
          <KpiStrip />
        </div>
      )}

      <AboutModal />
    </div>
  );
}
