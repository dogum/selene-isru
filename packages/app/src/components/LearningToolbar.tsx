import { useEffect, useState } from "react";
import {
  GRAPHICS_EVENT,
  loadGraphicsPrefs,
  publishGraphicsPrefs,
  type GraphicsPrefs
} from "../lib/graphics";
import { useStore } from "../state/store";

export function LearningToolbar(): React.JSX.Element | null {
  const active = useStore((s) => s.ui.learningMode);
  const processFlow = useStore((s) => s.ui.processFlow);
  const setUi = useStore((s) => s.setUi);
  const flyTo = useStore((s) => s.flyTo);
  const [graphics, setGraphics] = useState<GraphicsPrefs>(() => loadGraphicsPrefs());

  useEffect(() => {
    const onGraphics = (event: Event): void => {
      setGraphics((event as CustomEvent<GraphicsPrefs>).detail);
    };
    window.addEventListener(GRAPHICS_EVENT, onGraphics);
    return () => window.removeEventListener(GRAPHICS_EVENT, onGraphics);
  }, []);

  if (!active) {
    return null;
  }

  const updateGraphics = (patch: Partial<GraphicsPrefs>): void => {
    const next = { ...graphics, ...patch };
    setGraphics(next);
    publishGraphicsPrefs(next);
  };

  return (
    <div className="learning-toolbar" role="toolbar" aria-label="Learning mode controls">
      <span className="learning-toolbar-title">LEARNING LAYER</span>
      <button
        type="button"
        onClick={() => {
          setUi({ selectedAsset: null });
          flyTo("overview");
        }}
      >
        RESET VIEW
      </button>
      <button
        type="button"
        className={graphics.daylightLock ? "active" : ""}
        aria-pressed={graphics.daylightLock}
        onClick={() => updateGraphics({ daylightLock: !graphics.daylightLock })}
      >
        READABILITY
      </button>
      <button
        type="button"
        className={processFlow ? "active" : ""}
        aria-pressed={processFlow}
        onClick={() => setUi({ processFlow: !processFlow })}
      >
        PROCESS PATHS
      </button>
      <button type="button" className="learning-done" onClick={() => setUi({ learningMode: false })}>
        DONE
      </button>
    </div>
  );
}
