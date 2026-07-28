import {
  createBlankSiteDesign,
  parseSiteDesign,
  serializeSiteDesign
} from "@selene-isru/engine";
import type {
  SiteDesignDocument,
  SiteEnvironment
} from "@selene-isru/engine";

export const CUSTOM_SITE_DRAFT_KEY = "selene-isru.custom-site-draft.v1";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

let designNonce = 0;

export function createWorkingSiteDesign(
  environment: SiteEnvironment,
  timestamp = new Date().toISOString()
): SiteDesignDocument {
  designNonce += 1;
  return createBlankSiteDesign(environment, {
    id: `custom-${Date.now().toString(36)}-${designNonce.toString(36)}`,
    name: `Untitled ${environment === "polar" ? "Polar" : "Equatorial"} site`,
    timestamp
  });
}

export function loadCustomSiteDraft(
  storage: DraftStorage | null = typeof window === "undefined" ? null : window.localStorage
): SiteDesignDocument | null {
  if (storage === null) {
    return null;
  }
  try {
    const raw = storage.getItem(CUSTOM_SITE_DRAFT_KEY);
    if (raw === null) {
      return null;
    }
    return parseSiteDesign(JSON.parse(raw)).document;
  } catch {
    return null;
  }
}

export function saveCustomSiteDraft(
  design: SiteDesignDocument,
  storage: DraftStorage | null = typeof window === "undefined" ? null : window.localStorage
): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(CUSTOM_SITE_DRAFT_KEY, serializeSiteDesign(design));
    return true;
  } catch {
    return false;
  }
}

export function clearCustomSiteDraft(
  storage: DraftStorage | null = typeof window === "undefined" ? null : window.localStorage
): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.removeItem(CUSTOM_SITE_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
