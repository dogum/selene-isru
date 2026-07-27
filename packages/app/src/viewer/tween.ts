export type Ease = (t: number) => number;

export const cubicInOut: Ease = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

interface ActiveTween {
  from: number;
  to: number;
  startMs: number;
  durationMs: number;
  ease: Ease;
  apply: (value: number) => void;
  done?: () => void;
}

/**
 * Minimal keyed tween pool (§3.5 — no GSAP). Re-adding a key retargets the
 * tween from its current value, so rapid slider drags stay smooth.
 */
export class TweenManager {
  private tweens = new Map<string, ActiveTween>();
  private nowMs = 0;

  add(
    key: string,
    from: number,
    to: number,
    durationMs: number,
    apply: (value: number) => void,
    done?: () => void,
    ease: Ease = cubicInOut
  ): void {
    if (durationMs <= 0) {
      this.tweens.delete(key);
      apply(to);
      done?.();
      return;
    }
    this.tweens.set(key, { from, to, startMs: this.nowMs, durationMs, ease, apply, done });
  }

  /** Advance all tweens to `nowMs`; returns true while any tween is live. */
  update(nowMs: number): boolean {
    this.nowMs = nowMs;
    for (const [key, t] of this.tweens) {
      const u = Math.min(1, (nowMs - t.startMs) / t.durationMs);
      t.apply(t.from + (t.to - t.from) * t.ease(u));
      if (u >= 1) {
        this.tweens.delete(key);
        t.done?.();
      }
    }
    return this.tweens.size > 0;
  }

  get active(): boolean {
    return this.tweens.size > 0;
  }

  cancel(key: string): void {
    this.tweens.delete(key);
  }

  clear(): void {
    this.tweens.clear();
  }
}
