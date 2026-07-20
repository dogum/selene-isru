import { lazy, Suspense } from "react";
import { useStore, type StudyTab } from "../../state/store";
import { ComparePanel } from "./ComparePanel";

const FrontierExplorer = lazy(() =>
  import("./FrontierExplorer").then((module) => ({ default: module.FrontierExplorer }))
);
const UncertaintyPanel = lazy(() =>
  import("./UncertaintyPanel").then((module) => ({ default: module.UncertaintyPanel }))
);
const EngineeringReport = lazy(() =>
  import("./EngineeringReport").then((module) => ({ default: module.EngineeringReport }))
);

const TABS: Array<{ id: StudyTab; label: string; note: string }> = [
  { id: "scenarios", label: "SCENARIOS", note: "Name and compare two operating cases" },
  { id: "frontier", label: "PARETO", note: "Explore non-dominated design points" },
  { id: "uncertainty", label: "UNCERTAINTY", note: "Test sensitivity to uncertain inputs" },
  { id: "report", label: "REPORT", note: "Print or export a reproducible engineering snapshot" }
];

export function TradeStudyPanel(): React.JSX.Element {
  const active = useStore((s) => s.ui.studyTab);
  const setUi = useStore((s) => s.setUi);
  const selected = TABS.find((tab) => tab.id === active) ?? TABS[0]!;

  return (
    <div className="trade-study">
      <div className="trade-study-intro">
        <span className="reactor-eyebrow">ANALYSIS WORKSPACE</span>
        <h2>Trade Study</h2>
        <p>
          Compare named cases, search the Pareto frontier, and quantify uncertainty without
          leaving the live simulator.
        </p>
      </div>

      <div className="study-tabs" role="tablist" aria-label="Trade study workspace">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={active === tab.id ? "active" : ""}
            onClick={() => setUi({ studyTab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <p className="study-tab-note">{selected.note}</p>

      {active === "scenarios" && <ComparePanel />}
      <Suspense fallback={<div className="analysis-loading">LOADING ANALYSIS WORKSPACE…</div>}>
        {active === "frontier" && <FrontierExplorer />}
        {active === "uncertainty" && <UncertaintyPanel />}
        {active === "report" && <EngineeringReport />}
      </Suspense>
    </div>
  );
}
