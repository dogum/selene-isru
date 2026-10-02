import { useEffect, useState } from "react";
import { useIsMobile } from "../lib/hooks";
import { useStore } from "../state/store";

/** Versioned flag: bump the suffix if the intro changes enough to show again. */
export const INTRO_DISMISSED_KEY = "selene-isru.intro-dismissed.v1";
const INTRO_TOUR = "energy-ledger";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INTRO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(INTRO_DISMISSED_KEY, "1");
  } catch {
    // Private mode or blocked storage: the card simply returns next visit.
  }
}

/**
 * One-time orientation for a first visit: what the page is, the three moves
 * that make it useful, and the model boundary. Non-modal, so the simulator
 * stays usable behind it. Automated browsers (capture scripts, which set
 * navigator.webdriver) never see it, so recorded evidence is unchanged.
 */
export function IntroCard(): React.JSX.Element | null {
  const isMobile = useIsMobile();
  const site = useStore((s) => s.params.site);
  const tourActive = useStore((s) => s.tour.activeId !== null);
  const startTour = useStore((s) => s.startTour);
  const [visible, setVisible] = useState(() => !navigator.webdriver && !readDismissed());

  const dismiss = (): void => {
    writeDismissed();
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible || tourActive) return null;

  const plant =
    site === "polar"
      ? "This plant mines ice from a permanently shadowed crater and turns it into water."
      : "This plant melts lunar regolith and splits it into oxygen and metal-rich slag.";

  return (
    <section className="intro-card" role="dialog" aria-modal="false" aria-labelledby="intro-card-title">
      <button type="button" className="intro-card-close" aria-label="Dismiss introduction" onClick={dismiss}>
        ✕
      </button>
      <span className="reactor-eyebrow">LIVE LUNAR ISRU MODEL</span>
      <h2 id="intro-card-title">A resource plant you can re-engineer</h2>
      <p>{plant} Every number is recomputed by the physics engine the moment you change an input.</p>
      <ol>
        <li>
          {isMobile ? "Open CONTROLS below and change an input" : "Change an input on the left"} — try{" "}
          <strong>Daily product target</strong>.
        </li>
        <li>Watch the plant and the numbers {isMobile ? "in the panel" : "along the bottom"} respond.</li>
        <li>Select any number to see the equation behind it.</li>
      </ol>
      <p className="intro-card-boundary">
        A conceptual trade tool — not a flight, hardware, safety, or cost model.
      </p>
      <div className="intro-card-actions">
        <button
          type="button"
          className="topbar-btn intro-card-primary"
          onClick={() => {
            dismiss();
            startTour(INTRO_TOUR);
          }}
        >
          TAKE THE TOUR
        </button>
        <button type="button" className="topbar-btn" onClick={dismiss}>
          EXPLORE ON MY OWN
        </button>
      </div>
    </section>
  );
}
