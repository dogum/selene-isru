import {
  createBlankSiteDesign,
  SEEDED_SITE_DESIGN_FIXTURES,
  siteConnectionLengthM,
  validateSiteDesign
} from "@selene-isru/engine";
import type { SiteDesignDocument } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import {
  CUSTOM_HISTORY_LIMIT,
  createSiteConnection,
  distributeSiteAssets,
  duplicateSiteAsset,
  emptyCustomHistory,
  moveSiteAssetGroup,
  placeSiteAsset,
  pushCustomHistory,
  redoCustomDesign,
  removeSiteConnection,
  removeSiteAsset,
  rerouteSiteConnection,
  rotateSiteAssetGroup,
  siteAlignmentGuides,
  siteLayoutSummary,
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

  it.each(["equatorial", "polar"] as const)(
    "assembles the valid %s reference topology through editor commands",
    (environment) => {
      const fixture = SEEDED_SITE_DESIGN_FIXTURES[environment];
      let design: SiteDesignDocument = {
        ...createBlankSiteDesign(environment),
        assets: fixture.assets,
        connections: []
      };
      for (const connection of fixture.connections) {
        design = createSiteConnection(
          design,
          connection.from,
          connection.to,
          {
            id: connection.id,
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        )!;
      }
      expect(design.connections).toHaveLength(fixture.connections.length);
      expect(validateSiteDesign(design).filter((finding) =>
        finding.severity === "error"
      )).toEqual([]);
    }
  );

  it("creates, measures, reroutes, rejects duplicates, and removes a route", () => {
    const fixture = SEEDED_SITE_DESIGN_FIXTURES.equatorial;
    const reference = fixture.connections[0]!;
    const blank = {
      ...createBlankSiteDesign("equatorial"),
      assets: fixture.assets,
      connections: []
    };
    const connected = createSiteConnection(
      blank,
      reference.from,
      reference.to,
      { id: "route-1", orientation: "x-first" }
    )!;
    expect(connected.connections[0]?.route).toHaveLength(1);
    expect(siteConnectionLengthM(connected, connected.connections[0]!))
      .toBeGreaterThan(0);
    expect(createSiteConnection(connected, reference.from, reference.to)).toBeNull();
    expect(createSiteConnection(connected, reference.to, reference.from)).toBeNull();

    const rerouted = rerouteSiteConnection(connected, "route-1");
    expect(rerouted.connections[0]?.route).not.toEqual(
      connected.connections[0]?.route
    );
    expect(removeSiteConnection(rerouted, "route-1").connections).toEqual([]);
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

  it("summarizes rotated site extents, footprint area, and route length", () => {
    const design = {
      ...SEEDED_SITE_DESIGN_FIXTURES.equatorial,
      assets: SEEDED_SITE_DESIGN_FIXTURES.equatorial.assets.slice(0, 2),
      connections: SEEDED_SITE_DESIGN_FIXTURES.equatorial.connections.slice(
        0,
        1
      )
    };
    const summary = siteLayoutSummary(design);

    expect(summary.widthM).toBeGreaterThan(10);
    expect(summary.depthM).toBeGreaterThan(3);
    expect(summary.occupiedAreaM2).toBeGreaterThan(0);
    expect(summary.clearanceAreaM2).toBeGreaterThan(
      summary.occupiedAreaM2
    );
    expect(summary.totalRouteLengthM).toBe(
      siteConnectionLengthM(design, design.connections[0]!)
    );
  });

  it("moves, rotates, aligns, and distributes a selected group", () => {
    const blank = createBlankSiteDesign("equatorial");
    blank.planner.gridSnapM = 1;
    blank.planner.rotationSnapDeg = 5;
    blank.assets = [
      {
        id: "a",
        kind: "equatorial.excavator",
        name: "A",
        transform: { xM: -20, zM: 0, headingDeg: 0 },
        enabled: true,
        configuration: {}
      },
      {
        id: "b",
        kind: "equatorial.hauler",
        name: "B",
        transform: { xM: 0, zM: 0, headingDeg: 0 },
        enabled: true,
        configuration: {}
      },
      {
        id: "c",
        kind: "equatorial.cryo-farm",
        name: "C",
        transform: { xM: 30, zM: 20, headingDeg: 0 },
        enabled: true,
        configuration: {}
      }
    ];

    expect(siteAlignmentGuides(blank, ["a", "b"])).toContainEqual(
      expect.objectContaining({
        axis: "z",
        valueM: 0,
        assetIds: ["a", "b"]
      })
    );

    const moved = moveSiteAssetGroup(blank, ["a", "b"], 5, -5);
    expect(moved.assets.map((asset) => asset.transform)).toEqual([
      { xM: -15, zM: -5, headingDeg: 0 },
      { xM: 5, zM: -5, headingDeg: 0 },
      { xM: 30, zM: 20, headingDeg: 0 }
    ]);

    const rotated = rotateSiteAssetGroup(moved, ["a", "b"], 90);
    expect(rotated.assets.slice(0, 2).map((asset) => asset.transform))
      .toEqual([
        { xM: -5, zM: -15, headingDeg: 90 },
        { xM: -5, zM: 5, headingDeg: 90 }
      ]);

    const distributed = distributeSiteAssets(blank, ["a", "b", "c"], "x");
    expect(distributed.assets.map((asset) => asset.transform.xM)).toEqual([
      -20,
      5,
      30
    ]);
  });
});
