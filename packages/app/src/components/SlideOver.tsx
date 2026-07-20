import { useStore, type ViewTab } from "../state/store";
import { EnergySankey } from "./panels/EnergySankey";
import { MassManifest } from "./panels/MassManifest";
import { PowerTrade } from "./panels/PowerTrade";
import { ComparePanel } from "./panels/ComparePanel";

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: "site", label: "SITE" },
  { id: "energy", label: "ENERGY" },
  { id: "mass", label: "MASS" },
  { id: "power", label: "POWER" },
  { id: "compare", label: "COMPARE" }
];

export function ViewTabs(): React.JSX.Element {
  const view = useStore((s) => s.ui.view);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="view-tabs" role="tablist" aria-label="View">
      {TABS.map((t) => (
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

/** §4 — slide-over panel from the right; the viewport stays live behind it. */
export function SlideOver(): React.JSX.Element | null {
  const view = useStore((s) => s.ui.view);
  const setUi = useStore((s) => s.setUi);

  if (view === "site") {
    return null;
  }

  return (
    <aside className="slideover" role="dialog" aria-label={`${view} panel`}>
      <div className="slideover-head">
        <span className="panel-header">{view.toUpperCase()}</span>
        <button className="slideover-close" aria-label="Close panel" onClick={() => setUi({ view: "site" })}>
          ✕
        </button>
      </div>
      <div className="slideover-body">
        {view === "energy" && <EnergySankey />}
        {view === "mass" && <MassManifest />}
        {view === "power" && <PowerTrade />}
        {view === "compare" && <ComparePanel />}
      </div>
    </aside>
  );
}
