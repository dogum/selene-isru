import { useEffect, useRef } from "react";
import { useIsMobile } from "../lib/hooks";
import { useStore } from "../state/store";
import { Viewer } from "../viewer/Viewer";

/**
 * Mounts the vanilla-Three Viewer (§3.1). React never touches Three objects;
 * it forwards store changes through viewer.apply()/flyTo()/focusAsset().
 */
export function Scene(): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const viewer = new Viewer(el, isMobile);
    const initial = useStore.getState();
    viewer.apply(initial.result, initial.params);
    viewer.applyTime(
      initial.timePoint,
      initial.params,
      initial.result,
      initial.timeseries.points.at(-1)?.tHours ?? 708
    );

    const unsub = useStore.subscribe((state, prev) => {
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
    });

    return () => {
      unsub();
      viewer.dispose();
    };
  }, [isMobile]);

  return <div ref={ref} className="stage-canvas" aria-label="3D site diorama" />;
}
