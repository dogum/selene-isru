import { groupsForSite } from "../../controls/manifest";
import { GROUP_CAMERA } from "../../viewer/bindings";
import { useStore, type MobileTab } from "../../state/store";
import { ControlGroups } from "../ControlRail";
import { KpiCells } from "../KpiStrip";
import { WarningsDock } from "../WarningsDock";
import { EnergySankey } from "../panels/EnergySankey";
import { MassManifest } from "../panels/MassManifest";
import { PowerTrade } from "../panels/PowerTrade";
import { ComparePanel } from "../panels/ComparePanel";
import { BottomSheet } from "./BottomSheet";

/** §2.1 — subsystem chips floating over the viewport: camera bookmarks. */
export function SubsystemChips(): React.JSX.Element {
  const site = useStore((s) => s.params.site);
  const warnings = useStore((s) => s.result.warnings);
  const flyTo = useStore((s) => s.flyTo);
  const setUi = useStore((s) => s.setUi);
  const groups = groupsForSite(site);
  const real = warnings.filter((w) => w.id !== "param-clamped");
  const anyAlarm = real.some((w) => w.severity === "alarm");

  return (
    <div className="chips" role="toolbar" aria-label="Subsystem camera bookmarks">
      {real.length > 0 && (
        <button
          className={`chip warn ${anyAlarm ? "alarm" : "caution"}`}
          onClick={() => setUi({ sheetDetent: "half", mobileTab: "controls", dockOpen: true })}
        >
          ⚠ {real.length}
        </button>
      )}
      {groups.map((g) => {
        const key = GROUP_CAMERA[site][g.id];
        if (key === undefined) {
          return null;
        }
        return (
          <button key={g.id} className="chip" onClick={() => flyTo(key)}>
            {g.label.toUpperCase().replace(/ — .*/, "")}
          </button>
        );
      })}
    </div>
  );
}

const TABS: Array<{ id: MobileTab; label: string }> = [
  { id: "controls", label: "CONTROLS" },
  { id: "energy", label: "ENERGY" },
  { id: "mass", label: "MASS" },
  { id: "power", label: "POWER" },
  { id: "compare", label: "COMPARE" }
];

export function MobileSheetContent(): React.JSX.Element {
  const detent = useStore((s) => s.ui.sheetDetent);
  const tab = useStore((s) => s.ui.mobileTab);
  const dockOpen = useStore((s) => s.ui.dockOpen);
  const setUi = useStore((s) => s.setUi);

  return (
    <>
      <div className="sheet-kpis" onClick={() => detent === "peek" && setUi({ sheetDetent: "half" })}>
        <KpiCells compact />
      </div>
      {detent !== "peek" && (
        <>
          <div className="sheet-tabs" role="tablist" aria-label="Sheet content">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`view-tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setUi({ mobileTab: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="sheet-content">
            {tab === "controls" && (
              <>
                {dockOpen && <WarningsDock asSheetSection />}
                <ControlGroups exclusive />
              </>
            )}
            {tab === "energy" && <EnergySankey vertical />}
            {tab === "mass" && <MassManifest />}
            {tab === "power" && <PowerTrade />}
            {tab === "compare" && <ComparePanel />}
          </div>
        </>
      )}
    </>
  );
}

export function MobileOverlay(): React.JSX.Element {
  const detent = useStore((s) => s.ui.sheetDetent);
  return (
    <>
      {detent === "peek" && <SubsystemChips />}
      <BottomSheet>
        <MobileSheetContent />
      </BottomSheet>
    </>
  );
}
