import { DEFAULTS } from "../constants";
import type {
  SiteAssetInstance,
  SiteConnection,
  SiteDesignDocument,
  SiteDesignFixtureOptions,
  SiteEnvironment
} from "./types";

const FIXTURE_TIMESTAMP = "2026-07-28T00:00:00.000Z";

function optionsFor(
  environment: SiteEnvironment,
  options: SiteDesignFixtureOptions
): Required<SiteDesignFixtureOptions> {
  return {
    id: options.id ?? `custom-${environment}-site`,
    name: options.name ?? `Untitled ${environment === "polar" ? "Polar" : "Equatorial"} site`,
    timestamp: options.timestamp ?? FIXTURE_TIMESTAMP
  };
}

export function createBlankSiteDesign(
  environment: SiteEnvironment,
  options: SiteDesignFixtureOptions = {}
): SiteDesignDocument {
  const resolved = optionsFor(environment, options);
  return {
    schema: "selene-site-design",
    version: 1,
    id: resolved.id,
    name: resolved.name,
    environment,
    params: { ...DEFAULTS, site: environment },
    assets: [],
    connections: [],
    planner: {
      gridSnapM: 5,
      rotationSnapDeg: 15,
      northDeg: 0,
      annotations: []
    },
    createdAt: resolved.timestamp,
    updatedAt: resolved.timestamp
  };
}

function instance(
  id: string,
  kind: string,
  name: string,
  xM: number,
  zM: number,
  headingDeg = 0
): SiteAssetInstance {
  return {
    id,
    kind,
    name,
    transform: { xM, zM, headingDeg },
    enabled: true,
    configuration: {}
  };
}

function connection(
  id: string,
  kind: SiteConnection["kind"],
  fromAsset: SiteAssetInstance,
  fromPortId: string,
  toAsset: SiteAssetInstance,
  toPortId: string
): SiteConnection {
  return {
    id,
    kind,
    from: { assetId: fromAsset.id, portId: fromPortId },
    to: { assetId: toAsset.id, portId: toPortId },
    route: [
      { xM: fromAsset.transform.xM, zM: fromAsset.transform.zM },
      { xM: toAsset.transform.xM, zM: toAsset.transform.zM }
    ],
    configuration: {}
  };
}

function equatorialSeed(options: SiteDesignFixtureOptions): SiteDesignDocument {
  const design = createBlankSiteDesign("equatorial", {
    ...options,
    id: options.id ?? "fixture-equatorial-seed",
    name: options.name ?? "Seeded Equatorial reference"
  });
  const excavator = instance("eq-excavator-1", "equatorial.excavator", "Excavation rover EX-01", -45, 0);
  const hauler = instance("eq-hauler-1", "equatorial.hauler", "Regolith hauler HV-01", -34, 3);
  const reactor = instance("eq-reactor-1", "equatorial.mre-reactor", "MRE reactor MRE-01", -20, 0);
  const casting = instance("eq-casting-1", "equatorial.casting-yard", "Casting yard CY-01", -5, 14);
  const storage = instance("eq-storage-1", "equatorial.cryo-farm", "Cryogenic farm CR-01", 2, -18);
  const power = instance("eq-power-1", "equatorial.power-hub", "Power hub PW-01", -30, -22);
  const landing = instance("eq-landing-1", "equatorial.landing-system", "Landing system LP-01", 30, -18);
  const habitat = instance("eq-habitat-1", "equatorial.habitat", "Surface habitat HAB-01", 18, 16);
  design.assets = [excavator, hauler, reactor, casting, storage, power, landing, habitat];
  design.connections = [
    connection("eq-regolith-pickup", "material", excavator, "regolith-out", hauler, "regolith-in"),
    connection("eq-reactor-feed", "material", hauler, "regolith-out", reactor, "regolith-in"),
    connection("eq-reactor-power", "power", power, "grid-out", reactor, "power-in"),
    connection("eq-oxygen-storage", "material", reactor, "oxygen-out", storage, "product-in"),
    connection("eq-slag-casting", "construction", reactor, "slag-out", casting, "slag-in"),
    connection("eq-shield-feed", "construction", casting, "shield-out", habitat, "shield-in"),
    connection("eq-product-logistics", "logistics", storage, "reserve-out", landing, "reserve-in"),
    connection("eq-landed-infra", "logistics", landing, "infra-out", habitat, "infra-in")
  ];
  return design;
}

function polarSeed(options: SiteDesignFixtureOptions): SiteDesignDocument {
  const design = createBlankSiteDesign("polar", {
    ...options,
    id: options.id ?? "fixture-polar-seed",
    name: options.name ?? "Seeded Polar reference"
  });
  const excavator = instance("polar-excavator-1", "polar.ice-excavator", "Polar excavator PX-01", -36, 18);
  const extraction = instance("polar-sublimation-1", "polar.sublimation-camp", "Sublimation camp SUB-01", -18, 12);
  const receiver = instance("polar-receiver-1", "polar.receiver-sabatier", "Receiver plant BR-01", 4, -8);
  const storage = instance("polar-storage-1", "polar.cryo-farm", "Polar cryogenic farm PCR-01", 28, 6);
  const towers = instance("polar-towers-1", "polar.power-towers", "Rim power towers PT-01", 0, -44);
  const station = instance("polar-station-1", "polar.nuclear-station", "Nuclear station PN-01", 34, -28);
  const habitat = instance("polar-habitat-1", "polar.habitat", "Polar habitat PHAB-01", 30, 28);
  design.assets = [excavator, extraction, receiver, storage, towers, station, habitat];
  design.connections = [
    connection("polar-icy-feed", "material", excavator, "icy-feed-out", extraction, "icy-feed-in"),
    connection("polar-water-feed", "material", extraction, "water-out", receiver, "water-in"),
    connection("polar-power-feed", "power", towers, "grid-out", receiver, "power-in"),
    connection("polar-product-storage", "material", receiver, "product-out", storage, "product-in"),
    connection("polar-outpost-reserve", "logistics", storage, "reserve-out", habitat, "reserve-in")
  ];
  return design;
}

export function createSeededSiteDesign(
  environment: SiteEnvironment,
  options: SiteDesignFixtureOptions = {}
): SiteDesignDocument {
  return environment === "equatorial" ? equatorialSeed(options) : polarSeed(options);
}

export const BLANK_SITE_DESIGN_FIXTURES = {
  equatorial: createBlankSiteDesign("equatorial", {
    id: "fixture-equatorial-blank",
    name: "Blank Equatorial site"
  }),
  polar: createBlankSiteDesign("polar", {
    id: "fixture-polar-blank",
    name: "Blank Polar site"
  })
} as const;

export const SEEDED_SITE_DESIGN_FIXTURES = {
  equatorial: createSeededSiteDesign("equatorial"),
  polar: createSeededSiteDesign("polar")
} as const;
