import { createBlankSiteDesign } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import {
  CUSTOM_HISTORY_LIMIT,
  duplicateSiteAsset,
  emptyCustomHistory,
  placeSiteAsset,
  pushCustomHistory,
  redoCustomDesign,
  removeSiteAsset,
  undoCustomDesign,
  updateSiteAsset
} from "../src/site-design/editor";

describe("custom site editor commands", () => {
  it("places and updates assets using the document snap settings", () => {
    const blank = createBlankSiteDesign("equatorial", {
      timestamp: "2026-01-01T00:00:00.000Z"
    });
    const placed = placeSiteAsset(blank, "equatorial.excavator", 12.1, -7.9, {
      id: "ex-1",
      updatedAt: "2026-01-01T00:01:00.000Z"
    });
    expect(placed?.assets[0]?.transform).toEqual({
      xM: 10,
      zM: -10,
      headingDeg: 0
    });

    const updated = updateSiteAsset(
      placed!,
      "ex-1",
      { xM: 13, headingDeg: 22, name: "  Trench rover  " },
      "2026-01-01T00:02:00.000Z"
    );
    expect(updated.assets[0]).toMatchObject({
      name: "Trench rover",
      transform: { xM: 15, zM: -10, headingDeg: 15 }
    });
  });

  it("duplicates multiple assets but preserves single-instance contracts", () => {
    const blank = createBlankSiteDesign("equatorial");
    const withRover = placeSiteAsset(blank, "equatorial.excavator", -30, -30, {
      id: "ex-1"
    })!;
    expect(duplicateSiteAsset(withRover, "ex-1", { id: "ex-2" })?.assets)
      .toHaveLength(2);

    const withPower = placeSiteAsset(withRover, "equatorial.power-hub", 30, 30, {
      id: "power-1"
    })!;
    expect(duplicateSiteAsset(withPower, "power-1")).toBeNull();
    expect(placeSiteAsset(withPower, "equatorial.power-hub", 50, 50)).toBeNull();
  });

  it("removes attached connections with a deleted asset", () => {
    const blank = createBlankSiteDesign("equatorial");
    const design = {
      ...blank,
      assets: [
        placeSiteAsset(blank, "equatorial.excavator", -20, 0, { id: "a" })!.assets[0]!,
        placeSiteAsset(blank, "equatorial.hauler", 20, 0, { id: "b" })!.assets[0]!
      ],
      connections: [{
        id: "c",
        kind: "material" as const,
        from: { assetId: "a", portId: "regolith-out" },
        to: { assetId: "b", portId: "regolith-in" },
        route: [],
        configuration: {}
      }]
    };
    const removed = removeSiteAsset(design, "a");
    expect(removed.assets.map((asset) => asset.id)).toEqual(["b"]);
    expect(removed.connections).toEqual([]);
  });

  it("bounds snapshot history and supports undo/redo", () => {
    const blank = createBlankSiteDesign("equatorial");
    let history = emptyCustomHistory();
    for (let index = 0; index < CUSTOM_HISTORY_LIMIT + 8; index += 1) {
      history = pushCustomHistory(history, {
        ...blank,
        name: `Version ${index}`
      });
    }
    expect(history.past).toHaveLength(CUSTOM_HISTORY_LIMIT);

    const current = { ...blank, name: "Current" };
    const undone = undoCustomDesign(current, history)!;
    expect(undone.design.name).toBe(`Version ${CUSTOM_HISTORY_LIMIT + 7}`);
    const redone = redoCustomDesign(undone.design, undone.history)!;
    expect(redone.design.name).toBe("Current");
  });
});
