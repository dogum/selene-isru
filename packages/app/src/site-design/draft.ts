import {
  createBlankSiteDesign,
  evaluateSiteDesign,
  parseSiteDesign,
  serializeSiteDesign
} from "@selene-isru/engine";
import type {
  SiteDesignDocument,
  SiteDesignFinding,
  SiteEnvironment
} from "@selene-isru/engine";

export const CUSTOM_SITE_DRAFT_KEY = "selene-isru.custom-site-draft.v1";
export const CUSTOM_SITE_DRAFT_BACKUP_KEY =
  "selene-isru.custom-site-draft-backup.v1";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

let designNonce = 0;

export interface CustomSiteImportPreview {
  document: SiteDesignDocument | null;
  findings: SiteDesignFinding[];
  canonicalJson: string | null;
}

function parseStoredDesign(raw: string | null): SiteDesignDocument | null {
  if (raw === null) {
    return null;
  }
  try {
    return parseSiteDesign(JSON.parse(raw) as unknown).document;
  } catch {
    return null;
  }
}

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
    return (
      parseStoredDesign(storage.getItem(CUSTOM_SITE_DRAFT_KEY)) ??
      parseStoredDesign(storage.getItem(CUSTOM_SITE_DRAFT_BACKUP_KEY))
    );
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
    const serialized = serializeSiteDesign(design);
    const current = storage.getItem(CUSTOM_SITE_DRAFT_KEY);
    if (
      current !== null &&
      parseStoredDesign(current) !== null &&
      current !== serialized
    ) {
      storage.setItem(CUSTOM_SITE_DRAFT_BACKUP_KEY, current);
    }
    storage.setItem(CUSTOM_SITE_DRAFT_KEY, serialized);
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
    storage.removeItem(CUSTOM_SITE_DRAFT_BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
}

export function previewCustomSiteImport(
  text: string
): CustomSiteImportPreview {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return {
      document: null,
      findings: [{
        id: "import.json",
        severity: "error",
        message: "The selected file is not valid JSON.",
        entityIds: [],
        suggestedAction: "Choose an exported SELENE site-design JSON file."
      }],
      canonicalJson: null
    };
  }
  const parsed = parseSiteDesign(value);
  if (parsed.document === null) {
    return {
      document: null,
      findings: parsed.findings,
      canonicalJson: null
    };
  }
  const evaluation = evaluateSiteDesign(parsed.document);
  return {
    document: evaluation.normalizedDesign,
    findings: [...parsed.findings, ...evaluation.findings],
    canonicalJson: serializeSiteDesign(evaluation.normalizedDesign)
  };
}
