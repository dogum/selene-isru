import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GRAPHICS_PREFS,
  GRAPHICS_EVENT,
  loadGraphicsPrefs,
  publishGraphicsPrefs,
  saveGraphicsPrefs
} from "../src/lib/graphics";

const stored = new Map<string, string>();
const storage: Storage = {
  get length() {
    return stored.size;
  },
  clear: () => stored.clear(),
  getItem: (key) => stored.get(key) ?? null,
  key: (index) => [...stored.keys()][index] ?? null,
  removeItem: (key) => stored.delete(key),
  setItem: (key, value) => stored.set(key, value)
};

describe("graphics preferences", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    window.localStorage.clear();
    document.body.className = "";
  });

  it("never persists transient Photo mode", () => {
    saveGraphicsPrefs({ ...DEFAULT_GRAPHICS_PREFS, photoMode: true });
    expect(loadGraphicsPrefs().photoMode).toBe(false);
  });

  it("ignores legacy stored Photo mode so a reload cannot trap the UI", () => {
    window.localStorage.setItem(
      "selene.graphics",
      JSON.stringify({ ...DEFAULT_GRAPHICS_PREFS, photoMode: true })
    );
    expect(loadGraphicsPrefs().photoMode).toBe(false);
  });

  it("publishes active Photo mode while storing a safe reload state", () => {
    const onGraphics = vi.fn();
    window.addEventListener(GRAPHICS_EVENT, onGraphics);
    publishGraphicsPrefs({ ...DEFAULT_GRAPHICS_PREFS, photoMode: true });

    expect(document.body.classList.contains("selene-photo-mode")).toBe(true);
    expect((onGraphics.mock.calls[0]?.[0] as CustomEvent).detail.photoMode).toBe(true);
    expect(loadGraphicsPrefs().photoMode).toBe(false);
    window.removeEventListener(GRAPHICS_EVENT, onGraphics);
  });

  it("persists the daylight readability lock independently of Photo mode", () => {
    saveGraphicsPrefs({ ...DEFAULT_GRAPHICS_PREFS, daylightLock: true, photoMode: true });
    expect(loadGraphicsPrefs()).toMatchObject({ daylightLock: true, photoMode: false });
  });
});
