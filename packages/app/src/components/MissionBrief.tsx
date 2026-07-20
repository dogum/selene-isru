import { sampleUncertainty } from "@selene-isru/engine";
import type { SimParams, SimResult, UncertaintySpec } from "@selene-isru/engine";
import { useMemo, useState } from "react";
import { formatQtyText } from "../lib/format";
import { useStore } from "../state/store";

interface BriefGoal {
  id: string;
  title: string;
  prompt: string;
  patch: Partial<SimParams>;
  caveats: string[];
}

const GOALS: BriefGoal[] = [
  {
    id: "oxygen",
    title: "1 t/day oxygen",
    prompt: "Size a baseline equatorial oxygen and construction chain.",
    patch: { site: "equatorial", targetKgPerDay: 1000, missionYears: 5 },
    caveats: [
      "Aggregate oxygen recovery stands in for a full per-oxide Gibbs model.",
      "Logistics assumes the selected lander performance and payload model."
    ]
  },
  {
    id: "polar-water",
    title: "Polar water camp",
    prompt: "Establish an ice excavation, sublimation, and storage chain.",
    patch: { site: "polar", targetKgPerDay: 1000, enableSabatier: false },
    caveats: [
      "Ice fraction is the dominant site-assay uncertainty.",
      "The thermal model uses a cold-regime average heat capacity."
    ]
  },
  {
    id: "landed-mass",
    title: "Minimize landed mass",
    prompt: "Start with a small, long-lived outpost case.",
    patch: { site: "equatorial", targetKgPerDay: 100, missionYears: 10 },
    caveats: [
      "This is a low-throughput starting point, not an optimizer result.",
      "Crew, spares, and schedule-risk mass are outside the present manifest."
    ]
  },
  {
    id: "energy",
    title: "Minimize energy",
    prompt: "Explore a high-efficiency equatorial operating point.",
    patch: { site: "equatorial", targetKgPerDay: 1000, Vcell: 3.3, etaCurrent: 0.9 },
    caveats: [
      "High efficiency is an engineering target, not a guaranteed hardware state.",
      "Thermal losses and cryogenic assumptions still bound the system SEC."
    ]
  },
  {
    id: "crossover",
    title: "Solar / nuclear crossover",
    prompt: "Open a mid-scale case near the architecture trade.",
    patch: { site: "equatorial", targetKgPerDay: 5000, missionYears: 8 },
    caveats: [
      "Break-even uses specific-mass slopes and compounding degradation.",
      "Reliability, launch packaging, and operational redundancy are not monetized."
    ]
  }
];

interface Driver {
  label: string;
  value: number;
}

const DRIVER_LABELS: Record<string, string> = {
  product: "Product processing + conditioning",
  parasitic: "Parasitic systems",
  electrolysis: "Molten-regolith electrolysis",
  melt: "Regolith melt heating",
  sublimation: "Ice sublimation",
  cryo: "Cryogenic storage",
  excavation: "Excavation"
};

function energyDrivers(result: SimResult): Driver[] {
  const totals = new Map<string, number>();
  for (const flow of result.energy.flows) {
    totals.set(flow.to, (totals.get(flow.to) ?? 0) + flow.kWhPerKg);
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label: DRIVER_LABELS[label] ?? label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}

function statusFor(result: SimResult): { label: string; tone: string } {
  if (result.warnings.some((warning) => warning.severity === "alarm")) {
    return { label: "CONSTRAINED", tone: "alarm" };
  }
  if (result.warnings.some((warning) => warning.severity === "caution")) {
    return { label: "FEASIBLE · REVIEW CAUTIONS", tone: "caution" };
  }
  return { label: "FEASIBLE IN MODEL RANGE", tone: "nominal" };
}

export function MissionBrief(): React.JSX.Element | null {
  const open = useStore((s) => s.ui.missionBriefOpen);
  const params = useStore((s) => s.params);
  const result = useStore((s) => s.result);
  const applyPatch = useStore((s) => s.applyPatch);
  const setCompareFromCurrent = useStore((s) => s.setCompareFromCurrent);
  const setUi = useStore((s) => s.setUi);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeGoal = GOALS.find((goal) => goal.id === activeId) ?? null;

  const analysis = useMemo(() => {
    if (activeGoal === null) {
      return null;
    }
    const drivers = energyDrivers(result);
    const spec: UncertaintySpec[] = [
      { key: "targetKgPerDay", rel: 0.1 },
      params.site === "polar"
        ? { key: "chiIce", rel: 0.15 }
        : { key: "etaCurrent", rel: 0.08 }
    ];
    const bands = sampleUncertainty(params, spec, { n: 96, seed: 2026 });
    return {
      drivers,
      bottleneck: drivers[0],
      status: statusFor(result),
      bands,
      recommendation:
        `${params.site === "polar" ? "Polar ice" : "Equatorial MRE"} architecture · ` +
        `${result.power.architecture} power · ${formatQtyText(result.production.targetKgPerDay, "kg/day")}`
    };
  }, [activeGoal, params, result]);

  if (!open) {
    return null;
  }

  const close = (): void => setUi({ missionBriefOpen: false });

  return (
    <div className="modal-scrim" onClick={close}>
      <div
        className="modal mission-brief"
        role="dialog"
        aria-modal="true"
        aria-label="Mission brief"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="slideover-head">
          <span className="panel-header">MISSION BRIEF · OPTIONAL STARTING MODE</span>
          <button className="slideover-close" aria-label="Close mission brief" onClick={close}>
            ✕
          </button>
        </div>
        <div className="modal-body mission-brief-body">
          <div className="brief-intro">
            <span className="reactor-eyebrow">CHOOSE AN ENGINEERING QUESTION</span>
            <h2>What should this lunar system optimize for?</h2>
            <p>Selecting a question applies a transparent starting case. You can tune every input afterward.</p>
          </div>

          <div className="brief-goals">
            {GOALS.map((goal) => (
              <button
                key={goal.id}
                type="button"
                className={goal.id === activeId ? "active" : ""}
                onClick={() => {
                  setCompareFromCurrent();
                  applyPatch(goal.patch);
                  setUi({ currentScenarioName: goal.title });
                  setActiveId(goal.id);
                }}
              >
                <strong>{goal.title}</strong>
                <span>{goal.prompt}</span>
              </button>
            ))}
          </div>

          {analysis !== null && activeGoal !== null && (
            <section className="brief-analysis" aria-live="polite">
              <div className="brief-analysis-head">
                <div>
                  <span className="reactor-eyebrow">RECOMMENDED STARTING CASE</span>
                  <h3>{analysis.recommendation}</h3>
                </div>
                <span className={`brief-status ${analysis.status.tone}`}>{analysis.status.label}</span>
              </div>

              <div className="brief-summary-grid">
                <div>
                  <span>PRIMARY BOTTLENECK</span>
                  <strong>{analysis.bottleneck?.label.toUpperCase() ?? "—"}</strong>
                  <small>{formatQtyText(analysis.bottleneck?.value ?? 0, "kWh/kg")}</small>
                </div>
                <div>
                  <span>PAYBACK RANGE · P10–P90</span>
                  <strong>
                    {formatQtyText(analysis.bands.paybackDays.p10, "days")}–
                    {formatQtyText(analysis.bands.paybackDays.p90, "days")}
                  </strong>
                  <small>96 deterministic uncertainty samples</small>
                </div>
                <div>
                  <span>SEC RANGE · P10–P90</span>
                  <strong>
                    {formatQtyText(analysis.bands.secTotal.p10, "kWh/kg", 4)}–
                    {formatQtyText(analysis.bands.secTotal.p90, "kWh/kg", 4)}
                  </strong>
                  <small>Target plus dominant process uncertainty</small>
                </div>
              </div>

              <div className="brief-columns">
                <div>
                  <span className="reactor-section-title">THREE LARGEST ENERGY DRIVERS</span>
                  <ol>
                    {analysis.drivers.map((driver) => (
                      <li key={driver.label}>
                        <span>{driver.label}</span>
                        <strong className="num">{formatQtyText(driver.value, "kWh/kg")}</strong>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <span className="reactor-section-title">ENGINEERING CAVEATS</span>
                  <ul>
                    {activeGoal.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
                  </ul>
                </div>
              </div>

              <div className="brief-actions">
                <button
                  type="button"
                  className="topbar-btn"
                  onClick={() => {
                    setUi({
                      missionBriefOpen: false,
                      view: "study",
                      mobileTab: "study",
                      sheetDetent: "full",
                      studyTab: "scenarios"
                    });
                  }}
                >
                  OPEN TRADE STUDY
                </button>
                <button type="button" className="topbar-btn" onClick={close}>
                  CONTINUE IN SIMULATOR
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
