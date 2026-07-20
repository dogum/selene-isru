import { useEffect } from "react";
import { TOURS, tourReadout } from "../tours";
import { useStore } from "../state/store";

const TOUR_BY_ID = new Map(TOURS.map((tour) => [tour.id, tour]));

export function TourOverlay(): React.JSX.Element | null {
  const tourState = useStore((s) => s.tour);
  const result = useStore((s) => s.result);
  const stopTour = useStore((s) => s.stopTour);
  const advanceTour = useStore((s) => s.advanceTour);

  const tour = tourState.activeId !== null ? TOUR_BY_ID.get(tourState.activeId) : undefined;
  const beat = tour?.beats[tourState.beatIndex];

  useEffect(() => {
    if (tourState.activeId === null) {
      return;
    }
    const currentTour = TOUR_BY_ID.get(tourState.activeId);
    const currentBeat = currentTour?.beats[tourState.beatIndex];
    if (currentTour === undefined || currentBeat === undefined) {
      useStore.getState().stopTour();
      return;
    }

    const store = useStore.getState();
    if (currentBeat.paramPatch !== undefined) {
      store.applyPatch(currentBeat.paramPatch);
    }
    store.setPlaying(false);
    store.flyTo(currentBeat.cameraPose);

    const timer = window.setTimeout(() => {
      const latest = useStore.getState().tour;
      if (latest.activeId !== tourState.activeId || latest.beatIndex !== tourState.beatIndex) {
        return;
      }
      if (tourState.beatIndex >= currentTour.beats.length - 1) {
        useStore.getState().stopTour();
      } else {
        useStore.getState().advanceTour();
      }
    }, currentBeat.holdMs);

    return () => window.clearTimeout(timer);
  }, [tourState.activeId, tourState.beatIndex]);

  useEffect(() => {
    if (tourState.activeId === null) {
      return;
    }
    const shouldIgnore = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest(".tour-overlay, .presets") !== null;
    const onPointer = (event: PointerEvent): void => {
      if (!shouldIgnore(event.target)) {
        useStore.getState().stopTour();
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (!shouldIgnore(event.target)) {
        useStore.getState().stopTour();
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [tourState.activeId]);

  if (tour === undefined || beat === undefined) {
    return null;
  }

  const next = (): void => {
    if (tourState.beatIndex >= tour.beats.length - 1) {
      stopTour();
    } else {
      advanceTour();
    }
  };

  return (
    <div className="tour-overlay" role="status" aria-live="polite">
      <div className="tour-topline mono">
        <span>{tour.label}</span>
        <span>
          {tourState.beatIndex + 1}/{tour.beats.length}
        </span>
      </div>
      <div className="tour-caption">{beat.caption}</div>
      <div className="tour-readout mono">{tourReadout(beat.readout, result)}</div>
      <div className="tour-progress" aria-hidden="true">
        {tour.beats.map((b, i) => (
          <i key={`${b.cameraPose}-${i}`} className={i <= tourState.beatIndex ? "active" : ""} />
        ))}
      </div>
      <div className="tour-actions">
        <button className="topbar-btn" onClick={stopTour}>
          STOP
        </button>
        <button className="topbar-btn" onClick={next}>
          NEXT
        </button>
      </div>
    </div>
  );
}
