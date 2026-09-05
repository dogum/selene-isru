import { describe, expect, it, vi } from "vitest";
import { Viewer } from "../src/viewer/Viewer";

function harness() {
  return {
    captureTime: null as number | null,
    elapsed: 99,
    needsRender: true,
    reducedMotion: false,
    stop: vi.fn(), wake: vi.fn(),
    tweens: { update: vi.fn() },
    diorama: { tick: vi.fn() },
    updatePulses: vi.fn(),
    controls: { update: vi.fn() },
    updateLearningOverlay: vi.fn(), updateCustomLabels: vi.fn(),
    post: { render: vi.fn() }
  };
}

describe("opt-in video capture clock", () => {
  it("steps the real rendering path without wall-clock frame loss", () => {
    const state = harness();
    const step = (time: number | null) => Viewer.prototype.setCaptureTime.call(state as unknown as Viewer, time);
    step(0);
    step(1 / 30);
    expect(state.diorama.tick).toHaveBeenLastCalledWith(1 / 30, 1 / 30, false);
    expect(state.post.render).toHaveBeenLastCalledWith(1 / 30);
    expect(state.elapsed).toBe(1 / 30);
    expect(state.stop).toHaveBeenCalledTimes(2);
    expect(state.updateCustomLabels).toHaveBeenCalledTimes(2);
    expect(state.needsRender).toBe(false);
  });

  it("restores the interactive loop when capture is disabled", () => {
    const state = harness(); state.captureTime = 2;
    Viewer.prototype.setCaptureTime.call(state as unknown as Viewer, null);
    expect(state.captureTime).toBe(null);
    expect(state.wake).toHaveBeenCalledOnce();
    expect(state.diorama.tick).not.toHaveBeenCalled();
  });

  it("rejects invalid time before touching the scene", () => {
    const state = harness();
    for (const value of [-1, NaN, Infinity]) {
      expect(() => Viewer.prototype.setCaptureTime.call(state as unknown as Viewer, value)).toThrow();
    }
    expect(state.stop).not.toHaveBeenCalled();
  });
});
