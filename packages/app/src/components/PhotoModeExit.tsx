import { useEffect, useState } from "react";
import {
  GRAPHICS_EVENT,
  loadGraphicsPrefs,
  publishGraphicsPrefs,
  type GraphicsPrefs
} from "../lib/graphics";

export function PhotoModeExit(): React.JSX.Element | null {
  const [prefs, setPrefs] = useState<GraphicsPrefs>(() => loadGraphicsPrefs());

  useEffect(() => {
    const onGraphics = (event: Event): void => {
      setPrefs((event as CustomEvent<GraphicsPrefs>).detail);
    };
    window.addEventListener(GRAPHICS_EVENT, onGraphics);
    return () => window.removeEventListener(GRAPHICS_EVENT, onGraphics);
  }, []);

  useEffect(() => {
    if (!prefs.photoMode) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        publishGraphicsPrefs({ ...prefs, photoMode: false });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prefs]);

  if (!prefs.photoMode) {
    return null;
  }

  return (
    <button
      type="button"
      className="photo-mode-exit"
      onClick={() => publishGraphicsPrefs({ ...prefs, photoMode: false })}
      aria-label="Exit photo mode"
    >
      EXIT PHOTO MODE <kbd>ESC</kbd>
    </button>
  );
}
