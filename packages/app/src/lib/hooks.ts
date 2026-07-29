import { useEffect, useRef, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setMatches(false);
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export const useIsMobile = (): boolean => useMediaQuery("(max-width: 1099px)");
export const usePrefersReducedMotion = (): boolean =>
  useMediaQuery("(prefers-reduced-motion: reduce)");

/** 200ms count-up tween for number displays (§1.3) — no layout shift, tabular nums. */
export function useCountUp(value: number, ms = 200): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced || !Number.isFinite(value) || !Number.isFinite(fromRef.current)) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) {
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number): void => {
      const u = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - u) * (1 - u);
      const v = from + (value - from) * eased;
      setDisplay(v);
      fromRef.current = v;
      if (u < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, reduced]);

  return display;
}

/** observed content size of a ref'd element (for chart rerenders) */
export function useSize<T extends HTMLElement>(): [React.RefObject<T>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
