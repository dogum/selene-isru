// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createBlankSiteDesign,
  SEEDED_SITE_DESIGN_FIXTURES,
  serializeSiteDesign
} from "@selene-isru/engine";
import {
  CUSTOM_SITE_DRAFT_BACKUP_KEY,
  CUSTOM_SITE_DRAFT_KEY,
  clearCustomSiteDraft,
  loadCustomSiteDraft,
  previewCustomSiteImport,
  saveCustomSiteDraft
} from "../src/site-design/draft";
import { placeSiteAsset, updateSiteAsset } from "../src/site-design/editor";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe("custom site draft persistence", () => {
  it("round-trips a versioned design", () => {
    const storage = memoryStorage();
    const design = createBlankSiteDesign("polar", {
      id: "draft-test",
      name: "Shackleton sketch"
    });

    expect(saveCustomSiteDraft(design, storage)).toBe(true);
    expect(storage.getItem(CUSTOM_SITE_DRAFT_KEY)).toContain("selene-site-design");
    expect(loadCustomSiteDraft(storage)).toEqual(design);
  });

  it("preserves placed coordinates and headings across save and reload", () => {
    const storage = memoryStorage();
    const blank = createBlankSiteDesign("equatorial", {
      id: "placed-draft",
      timestamp: "2026-01-01T00:00:00.000Z"
    });
    const placed = placeSiteAsset(blank, "equatorial.excavator", 18, -13, {
      id: "ex-1",
      updatedAt: "2026-01-01T00:01:00.000Z"
    })!;
    const rotated = updateSiteAsset(
      placed,
      "ex-1",
      { headingDeg: 44 },
      "2026-01-01T00:02:00.000Z"
    );

    saveCustomSiteDraft(rotated, storage);
    expect(loadCustomSiteDraft(storage)?.assets[0]?.transform).toEqual({
      xM: 20,
      zM: -15,
      headingDeg: 45
    });
  });

  it("preserves typed endpoints and routed connection geometry", () => {
    const storage = memoryStorage();
    const design = SEEDED_SITE_DESIGN_FIXTURES.equatorial;
    saveCustomSiteDraft(design, storage);

    const restored = loadCustomSiteDraft(storage);
    expect(restored?.connections).toHaveLength(design.connections.length);
    expect(restored?.connections.find(
      (connection) => connection.id === "eq-regolith-pickup"
    )).toMatchObject({
      kind: "material",
      from: { portId: "regolith-out" },
      to: { portId: "regolith-in" },
      route: design.connections.find(
        (connection) => connection.id === "eq-regolith-pickup"
      )?.route
    });
  });

  it("fails closed for corrupt or unsupported drafts", () => {
    const storage = memoryStorage();
    storage.setItem(CUSTOM_SITE_DRAFT_KEY, "{bad json");
    expect(loadCustomSiteDraft(storage)).toBeNull();
    storage.setItem(CUSTOM_SITE_DRAFT_KEY, JSON.stringify({
      schema: "selene-site-design",
      version: 99
    }));
    expect(loadCustomSiteDraft(storage)).toBeNull();
  });

  it("recovers the previous valid draft when the primary copy is corrupt", () => {
    const storage = memoryStorage();
    const previous = {
      ...SEEDED_SITE_DESIGN_FIXTURES.equatorial,
      name: "Previous safe copy"
    };
    const latest = {
      ...SEEDED_SITE_DESIGN_FIXTURES.polar,
      name: "Latest working copy"
    };

    saveCustomSiteDraft(previous, storage);
    saveCustomSiteDraft(latest, storage);
    expect(storage.getItem(CUSTOM_SITE_DRAFT_BACKUP_KEY)).toBe(
      serializeSiteDesign(previous)
    );

    storage.setItem(CUSTOM_SITE_DRAFT_KEY, "{corrupt");
    expect(loadCustomSiteDraft(storage)?.name).toBe("Previous safe copy");
  });

  it("previews and canonicalizes imports without mutating draft storage", () => {
    const storage = memoryStorage();
    const current = SEEDED_SITE_DESIGN_FIXTURES.polar;
    saveCustomSiteDraft(current, storage);
    const before = storage.getItem(CUSTOM_SITE_DRAFT_KEY);
    const unsorted = {
      ...SEEDED_SITE_DESIGN_FIXTURES.equatorial,
      assets: [...SEEDED_SITE_DESIGN_FIXTURES.equatorial.assets].reverse()
    };

    const preview = previewCustomSiteImport(JSON.stringify(unsorted));

    expect(preview.document).not.toBeNull();
    expect(preview.canonicalJson).toBe(
      serializeSiteDesign(preview.document!)
    );
    expect(preview.document?.assets.map((asset) => asset.id)).toEqual(
      [...(preview.document?.assets ?? [])]
        .map((asset) => asset.id)
        .sort()
    );
    expect(storage.getItem(CUSTOM_SITE_DRAFT_KEY)).toBe(before);
  });

  it("blocks malformed import text without changing the current draft", () => {
    const storage = memoryStorage();
    saveCustomSiteDraft(SEEDED_SITE_DESIGN_FIXTURES.equatorial, storage);
    const before = storage.getItem(CUSTOM_SITE_DRAFT_KEY);

    const preview = previewCustomSiteImport("{not json");

    expect(preview.document).toBeNull();
    expect(preview.findings).toContainEqual(expect.objectContaining({
      severity: "error",
      id: "import.json"
    }));
    expect(storage.getItem(CUSTOM_SITE_DRAFT_KEY)).toBe(before);
  });

  it("clears saved primary and recovery drafts", () => {
    const storage = memoryStorage();
    saveCustomSiteDraft(createBlankSiteDesign("equatorial", {
      name: "First"
    }), storage);
    saveCustomSiteDraft(createBlankSiteDesign("equatorial", {
      name: "Second"
    }), storage);

    expect(clearCustomSiteDraft(storage)).toBe(true);
    expect(storage.getItem(CUSTOM_SITE_DRAFT_KEY)).toBeNull();
    expect(storage.getItem(CUSTOM_SITE_DRAFT_BACKUP_KEY)).toBeNull();
    expect(loadCustomSiteDraft(storage)).toBeNull();
  });
});
