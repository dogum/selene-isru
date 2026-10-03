import { useRef } from "react";
import { useDialog } from "../lib/a11y";
import { useStore, type ViewTab } from "../state/store";
import { EnergySankey } from "./panels/EnergySankey";
import { MassManifest } from "./panels/MassManifest";
import { PowerTrade } from "./panels/PowerTrade";
import { TradeStudyPanel } from "./panels/TradeStudyPanel";

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: "site", label: "SITE" },
  { id: "energy", label: "ENERGY" },
  { id: "mass", label: "MASS" },
  { id: "power", label: "POWER" },
  { id: "study", label: "TRADE STUDY" }
];

function ViewTabList({ docked = false }: { docked?: boolean }): React.JSX.Element {
  const view = useStore((s) => s.ui.view);
  const setUi = useStore((s) => s.setUi);
  // Docked in the panel header, SITE is the close button's job.
  const tabs = docked ? TABS.filter((t) => t.id !== "site") : TABS;
  return (
    <div className={`view-tabs${docked ? " view-tabs-docked" : ""}`} role="tablist" aria-label="View">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={view === t.id}
          className={`view-tab ${view === t.id ? "active" : ""}`}
          onClick={() => setUi({ view: t.id })}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Floating tabs over the site view. While a panel is open the tabs move into
 * its header: floating, they sat under the slide-over (which reaches 76vw on
 * narrower desktops) and the panels behind it could not be reached.
 */
export function ViewTabs(): React.JSX.Element | null {
  const view = useStore((s) => s.ui.view);
  return view === "site" ? <ViewTabList /> : null;
}

/** §4 — slide-over panel from the right; the viewport stays live behind it. */
export function SlideOver(): React.JSX.Element | null {
  const view = useStore((s) => s.ui.view);
  const setUi = useStore((s) => s.setUi);
  const panel = useRef<HTMLElement | null>(null);
  useDialog(panel, { open: view !== "site", onClose: () => setUi({ view: "site" }), initialFocus: '[role="tab"][aria-selected="true"]' });

  if (view === "site") {
    return null;
  }

  return (
    <aside ref={panel} tabIndex={-1} className="slideover" role="dialog" aria-label={`${view} panel`}>
      <div className="slideover-head">
        <ViewTabList docked />
        <button className="slideover-close" aria-label="Close panel" onClick={() => setUi({ view: "site" })}>
          ✕
        </button>
      </div>
      <div className="slideover-body">
        {view === "energy" && <EnergySankey />}
        {view === "mass" && <MassManifest />}
        {view === "power" && <PowerTrade />}
        {view === "study" && <TradeStudyPanel />}
      </div>
    </aside>
  );
}
