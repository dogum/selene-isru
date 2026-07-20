import { useEffect, useRef } from "react";
import { formatQtyText } from "../lib/format";
import { useStore } from "../state/store";

export function TimelineStrip(): React.JSX.Element {
  const time = useStore((s) => s.time);
  const point = useStore((s) => s.timePoint);
  const timeseries = useStore((s) => s.timeseries);
  const setTimeHours = useStore((s) => s.setTimeHours);
  const setPlaying = useStore((s) => s.setPlaying);
  const setTimeRate = useStore((s) => s.setTimeRate);
  const advanceTime = useStore((s) => s.advanceTime);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const cycleHours = Math.max(1, timeseries.points.at(-1)?.tHours ?? 1);

  useEffect(() => {
    if (!time.playing) {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      last.current = null;
      return;
    }
    const frame = (now: number): void => {
      if (last.current !== null) {
        advanceTime((now - last.current) / 1000);
      }
      last.current = now;
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    return () => {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
    };
  }, [advanceTime, time.playing]);

  return (
    <div className="timeline-strip" aria-label="Lunar cycle timeline">
      <button
        className={`timeline-play ${time.playing ? "active" : ""}`}
        onClick={() => setPlaying(!time.playing)}
        aria-label={time.playing ? "Pause lunar cycle" : "Play lunar cycle"}
      >
        {time.playing ? "PAUSE" : "PLAY"}
      </button>
      <input
        className="timeline-range"
        type="range"
        min={0}
        max={cycleHours}
        step={cycleHours / 240}
        value={time.tHours}
        onChange={(e) => setTimeHours(Number(e.target.value))}
        aria-label="Scrub lunar cycle"
      />
      <select
        className="timeline-rate mono"
        value={time.rate}
        onChange={(e) => setTimeRate(Number(e.target.value))}
        aria-label="Timeline rate"
      >
        <option value={12}>12x</option>
        <option value={48}>48x</option>
        <option value={120}>120x</option>
      </select>
      <div className="timeline-readouts mono">
        <span>{formatQtyText(point.tHours, "h")}</span>
        <span>{point.daylight ? "DAY" : "NIGHT"}</span>
        <span>SOC {Math.round(point.batterySoC * 100)}%</span>
        <span>{formatQtyText(point.tankFillKg, "kg")}</span>
      </div>
    </div>
  );
}
