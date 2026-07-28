import { describe, expect, test } from "vitest";
import {
  BLANK_SITE_DESIGN_FIXTURES,
  REQUIRED_SITE_CONNECTIONS,
  SEEDED_SITE_DESIGN_FIXTURES,
  SITE_ASSET_CATALOG,
  canonicalSiteDesign,
  createBlankSiteDesign,
  parseSiteDesign,
  serializeSiteDesign,
  snapSiteCoordinate,
  snapSiteHeading,
  siteAssetsForEnvironment,
  validateSiteAssetPlacement,
  validateSiteDesign
} from "../src/index";
import type {
  SiteAssetInstance,
  SiteConnection,
  SiteDesignDocument,
  SiteEnvironment
} from "../src/index";

function errors(document: SiteDesignDocument): string[] {
  return validateSiteDesign(document)
    .filter((finding) => finding.severity === "error")
    .map((finding) => finding.id);
}

function clone(document: SiteDesignDocument): SiteDesignDocument {
  return structuredClone(document);
}

describe("site design catalog", () => {
  test("uses unique stable kinds and covers both environments", () => {
    const kinds = SITE_ASSET_CATALOG.map((definition) => definition.kind);

    expect(new Set(kinds).size).toBe(kinds.length);
    expect(siteAssetsForEnvironment("equatorial").length).toBeGreaterThan(0);
    expect(siteAssetsForEnvironment("polar").length).toBeGreaterThan(0);
    expect(SITE_ASSET_CATALOG.every((definition) =>
      definition.ports.every((port) => port.streams.length > 0)
    )).toBe(true);
  });
});

describe("site design fixtures and schema", () => {
  test.each<SiteEnvironment>(["equatorial", "polar"])(
    "creates and round-trips a blank %s design",
    (environment) => {
      const fixture = BLANK_SITE_DESIGN_FIXTURES[environment];
      const serialized = serializeSiteDesign(fixture);
      const parsed = parseSiteDesign(JSON.parse(serialized));

      expect(parsed.findings).toEqual([]);
      expect(parsed.document).not.toBeNull();
      expect(parsed.document?.environment).toBe(environment);
      expect(parsed.document?.params.site).toBe(environment);
      expect(parsed.document && serializeSiteDesign(parsed.document)).toBe(serialized);
    }
  );

  test("canonicalizes entity order, headings, coordinates, and configuration keys", () => {
    const design = createBlankSiteDesign("equatorial");
    design.assets = [
      {
        id: "z",
        kind: "equatorial.excavator",
        name: "Z",
        transform: { xM: 900, zM: -900, headingDeg: -15 },
        enabled: true,
        configuration: { z: 1, a: true }
      },
      {
        id: "a",
        kind: "equatorial.hauler",
        name: "A",
        transform: { xM: 0, zM: 0, headingDeg: 375 },
        enabled: true,
        configuration: {}
      }
    ];

    const normalized = canonicalSiteDesign(design);

    expect(normalized.assets.map((asset) => asset.id)).toEqual(["a", "z"]);
    expect(normalized.assets[0]?.transform.headingDeg).toBe(15);
    expect(normalized.assets[1]?.transform).toMatchObject({
      xM: 500,
      zM: -500,
      headingDeg: 345
    });
    expect(Object.keys(normalized.assets[1]?.configuration ?? {})).toEqual(["a", "z"]);
  });

  test("rejects unsupported schema identifiers and versions", () => {
    expect(parseSiteDesign({}).document).toBeNull();
    expect(parseSiteDesign({
      schema: "selene-site-design",
      version: 2
    }).document).toBeNull();
  });

  test("normalizes out-of-bounds and invalid coordinates with stable findings", () => {
    const design = createBlankSiteDesign("equatorial") as SiteDesignDocument;
    design.assets = [{
      id: "outside",
      kind: "equatorial.excavator",
      name: "Outside",
      transform: { xM: 900, zM: 0, headingDeg: -15 },
      enabled: true,
      configuration: {}
    }];
    design.connections = [{
      id: "bad-route",
      kind: "material",
      from: { assetId: "outside", portId: "regolith-out" },
      to: { assetId: "outside", portId: "regolith-out" },
      route: [{ xM: Number.NaN, zM: 0 }],
      configuration: {}
    }];

    const parsed = parseSiteDesign(design);

    expect(parsed.document?.assets[0]?.transform).toMatchObject({
      xM: 500,
      zM: 0,
      headingDeg: 345
    });
    expect(parsed.findings.map((finding) => finding.id)).toEqual([
      "schema.asset-bounds-0",
      "schema.connection-route-0-0"
    ]);
  });
});

describe("site design validation", () => {
  test.each<SiteEnvironment>(["equatorial", "polar"])(
    "accepts the seeded %s required process chain",
    (environment) => {
      expect(errors(SEEDED_SITE_DESIGN_FIXTURES[environment])).toEqual([]);
    }
  );

  test.each<SiteEnvironment>(["equatorial", "polar"])(
    "identifies every open required step in a blank %s design",
    (environment) => {
      const findings = validateSiteDesign(BLANK_SITE_DESIGN_FIXTURES[environment]);

      expect(findings.filter((finding) => finding.severity === "error")).toHaveLength(
        REQUIRED_SITE_CONNECTIONS[environment].length
      );
      expect(findings.some((finding) => finding.id === "design.blank")).toBe(true);
    }
  );

  test("reports the exact required step when a valid chain is broken", () => {
    const design = clone(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
    design.connections = design.connections.filter((connection) =>
      connection.id !== "eq-reactor-power"
    );

    expect(errors(design)).toContain(
      "topology.required.equatorial-power-process"
    );
  });

  test("reports cross-environment equipment, duplicate ids, and singleton overflow", () => {
    const design = createBlankSiteDesign("equatorial");
    const power: SiteAssetInstance = {
      id: "power",
      kind: "equatorial.power-hub",
      name: "Power A",
      transform: { xM: 0, zM: 0, headingDeg: 0 },
      enabled: true,
      configuration: {}
    };
    design.assets = [
      power,
      { ...power, name: "Power B", transform: { ...power.transform, xM: 10 } },
      {
        ...power,
        id: "polar-power",
        kind: "polar.power-towers",
        name: "Wrong environment"
      }
    ];

    const ids = errors(design);

    expect(ids).toContain("asset.duplicate-id.power");
    expect(ids).toContain("asset.multiplicity.equatorial.power-hub");
    expect(ids).toContain("asset.environment.polar-power");
  });

  test("reports missing endpoints and incompatible port contracts", () => {
    const design = clone(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
    const missing: SiteConnection = {
      id: "missing",
      kind: "material",
      from: { assetId: "not-there", portId: "output" },
      to: { assetId: "eq-reactor-1", portId: "regolith-in" },
      route: [],
      configuration: {}
    };
    const incompatible: SiteConnection = {
      id: "incompatible",
      kind: "power",
      from: { assetId: "eq-reactor-1", portId: "power-in" },
      to: { assetId: "eq-power-1", portId: "grid-out" },
      route: [],
      configuration: {}
    };
    design.connections.push(missing, incompatible);

    const ids = errors(design);

    expect(ids).toContain("connection.endpoint.missing");
    expect(ids).toContain("connection.incompatible.incompatible");
  });
});

describe("site placement geometry", () => {
  test("snaps finite coordinates and normalizes headings", () => {
    expect(snapSiteCoordinate(12.6, 5)).toBe(15);
    expect(snapSiteCoordinate(12.6, 0)).toBe(12.6);
    expect(snapSiteHeading(-17, 15)).toBe(345);
    expect(snapSiteHeading(367, 0)).toBe(7);
  });

  test("distinguishes footprint collisions from clearance conflicts", () => {
    const design = createBlankSiteDesign("equatorial");
    const excavator: SiteAssetInstance = {
      id: "excavator",
      kind: "equatorial.excavator",
      name: "Excavator",
      transform: { xM: 0, zM: 0, headingDeg: 0 },
      enabled: true,
      configuration: {}
    };
    const hauler: SiteAssetInstance = {
      id: "hauler",
      kind: "equatorial.hauler",
      name: "Hauler",
      transform: { xM: 2, zM: 0, headingDeg: 0 },
      enabled: true,
      configuration: {}
    };
    design.assets = [excavator];

    expect(validateSiteAssetPlacement(design, hauler).map((finding) => finding.id))
      .toContain("placement.collision.excavator.hauler");

    hauler.transform.xM = 7;
    const clearance = validateSiteAssetPlacement(design, hauler);
    expect(clearance.some((finding) => finding.id ===
      "placement.clearance.excavator.hauler" && finding.severity === "caution"
    )).toBe(true);

    hauler.transform.xM = 12;
    expect(validateSiteAssetPlacement(design, hauler)).toEqual([]);
  });

  test("rejects footprints that extend beyond the planning boundary", () => {
    const design = createBlankSiteDesign("polar");
    const candidate: SiteAssetInstance = {
      id: "rim-towers",
      kind: "polar.power-towers",
      name: "Rim towers",
      transform: { xM: 84, zM: 0, headingDeg: 0 },
      enabled: true,
      configuration: {}
    };

    expect(validateSiteAssetPlacement(design, candidate).map((finding) => finding.id))
      .toContain("placement.boundary.rim-towers");
  });
});
