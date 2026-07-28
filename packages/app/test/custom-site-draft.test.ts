// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createBlankSiteDesign } from "@selene-isru/engine";
import {
  CUSTOM_SITE_DRAFT_KEY,
  clearCustomSiteDraft,
  loadCustomSiteDraft,
  saveCustomSiteDraft
} from "../src/site-design/draft";

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

  it("clears a saved draft", () => {
    const storage = memoryStorage();
    saveCustomSiteDraft(createBlankSiteDesign("equatorial"), storage);

    expect(clearCustomSiteDraft(storage)).toBe(true);
    expect(loadCustomSiteDraft(storage)).toBeNull();
  });
});
