import { useEffect, useRef, useState } from "react";
import { useStore, type SheetDetent } from "../../state/store";

const PEEK_PX = 148;

function detentHeight(detent: SheetDetent): number {
  const vh = window.innerHeight;
  if (detent === "peek") {
    return PEEK_PX;
  }
  if (detent === "half") {
    return vh * 0.5;
  }
  return vh * 0.9;
}

/**
 * §2.1 — hand-rolled bottom sheet: touch drag + snap detents + momentum.
 * The sheet's inner content scrolls; the page never does.
 */
export function BottomSheet({ children }: { children: React.ReactNode }): React.JSX.Element {
  const detent = useStore((s) => s.ui.sheetDetent);
  const setUi = useStore((s) => s.setUi);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const height = dragHeight ?? detentHeight(detent);

  useEffect(() => {
    const onResize = (): void => setDragHeight(null);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent): void => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startH: detentHeight(detent),
      lastY: e.clientY,
      lastT: performance.now(),
      v: 0
    };
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current;
    if (d === null) {
      return;
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = (e.clientY - d.lastY) / dt; // px/ms, + = downward
    d.lastY = e.clientY;
    d.lastT = now;
    const h = Math.min(window.innerHeight * 0.92, Math.max(90, d.startH - (e.clientY - d.startY)));
    setDragHeight(h);
  };

  const onPointerUp = (): void => {
    const d = drag.current;
    drag.current = null;
    if (d === null || dragHeight === null) {
      setDragHeight(null);
      return;
    }
    // momentum: project the release height forward, then snap to nearest detent
    const projected = dragHeight - d.v * 180;
    const detents: SheetDetent[] = ["peek", "half", "full"];
    let best: SheetDetent = "peek";
    let bestDist = Infinity;
    for (const candidate of detents) {
      const dist = Math.abs(detentHeight(candidate) - projected);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    setDragHeight(null);
    setUi({ sheetDetent: best });
  };

  return (
    <div
      ref={sheetRef}
      className={`sheet ${dragHeight !== null ? "dragging" : ""}`}
      style={{ height }}
      role="region"
      aria-label="Controls and charts"
    >
      <div
        className="sheet-handle-zone"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sheet-handle" />
      </div>
      <div className="sheet-scroll">{children}</div>
    </div>
  );
}
