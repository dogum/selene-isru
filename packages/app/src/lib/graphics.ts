import type { GraphicsTier } from "../viewer/bindings";

export type GraphicsTierChoice = "auto" | GraphicsTier;

export interface GraphicsPrefs {
  tier: GraphicsTierChoice;
  bloom: boolean;
  /** friendly illumination floor for exploring vs. physically-dark realism */
  brightLighting: boolean;
  hud: boolean;
  photoMode: boolean;
}

export const GRAPHICS_EVENT = "selene:graphics";
export const PHOTO_EVENT = "selene:photo";

const STORAGE_KEY = "selene.graphics";

export const DEFAULT_GRAPHICS_PREFS: GraphicsPrefs = {
  tier: "auto",
  bloom: true,
  brightLighting: true,
  hud: false,
  photoMode: false
};

export function loadGraphicsPrefs(): GraphicsPrefs {
  if (typeof window === "undefined") {
    return DEFAULT_GRAPHICS_PREFS;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_GRAPHICS_PREFS;
    }
    const parsed = JSON.parse(raw) as Partial<GraphicsPrefs>;
    return normalizeGraphicsPrefs(parsed);
  } catch {
    return DEFAULT_GRAPHICS_PREFS;
  }
}

export function saveGraphicsPrefs(prefs: GraphicsPrefs): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function publishGraphicsPrefs(prefs: GraphicsPrefs): void {
  saveGraphicsPrefs(prefs);
  document.body.classList.toggle("selene-photo-mode", prefs.photoMode);
  window.dispatchEvent(new CustomEvent<GraphicsPrefs>(GRAPHICS_EVENT, { detail: prefs }));
}

export function requestPhotoDownload(): void {
  window.dispatchEvent(new Event(PHOTO_EVENT));
}

export function effectiveTier(choice: GraphicsTierChoice, mobile: boolean): GraphicsTier {
  if (choice !== "auto") {
    return choice;
  }
  return mobile ? "medium" : "high";
}

function normalizeGraphicsPrefs(input: Partial<GraphicsPrefs>): GraphicsPrefs {
  const tier = isTierChoice(input.tier) ? input.tier : DEFAULT_GRAPHICS_PREFS.tier;
  return {
    tier,
    bloom: typeof input.bloom === "boolean" ? input.bloom : DEFAULT_GRAPHICS_PREFS.bloom,
    brightLighting:
      typeof input.brightLighting === "boolean"
        ? input.brightLighting
        : DEFAULT_GRAPHICS_PREFS.brightLighting,
    hud: typeof input.hud === "boolean" ? input.hud : DEFAULT_GRAPHICS_PREFS.hud,
    photoMode: typeof input.photoMode === "boolean" ? input.photoMode : DEFAULT_GRAPHICS_PREFS.photoMode
  };
}

function isTierChoice(value: unknown): value is GraphicsTierChoice {
  return value === "auto" || value === "low" || value === "medium" || value === "high" || value === "ultra";
}
