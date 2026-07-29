import type {
  SiteAssetCapacityModel,
  SiteAssetDefinition,
  SiteConnectionKind,
  SiteEnvironment
} from "./types";

function asset(definition: SiteAssetDefinition): SiteAssetDefinition {
  return definition;
}

const BASELINE_THROUGHPUT_KG_PER_DAY = 1_000;
const BASELINE_SOURCE_POWER_W = 1_250_000;

function throughputCapacity(
  groupId: string,
  groupLabel: string,
  requiredPortIds: readonly string[],
  quantityMode: SiteAssetCapacityModel["quantityMode"] = "instances"
): SiteAssetCapacityModel {
  return {
    groupId,
    groupLabel,
    metric: "product-throughput",
    rating: BASELINE_THROUGHPUT_KG_PER_DAY,
    unit: "kg/day",
    requiredPortIds,
    quantityMode,
    ...(quantityMode === "bank"
      ? { quantityKey: "unitCount", maxQuantity: 8 }
      : {}),
    modelMaturity: "DESIGN ASSUMPTION",
    basis:
      "One placed instance represents one complete 1,000 kg/day baseline process train.",
    evidence:
      "SELENE v0.1 default production target and continuously sized subsystem correlations; screening allocation, not a vendor hardware rating."
  };
}

function powerCapacity(
  groupId: string,
  groupLabel: string
): SiteAssetCapacityModel {
  return {
    groupId,
    groupLabel,
    metric: "electrical-output",
    rating: BASELINE_SOURCE_POWER_W,
    unit: "W",
    requiredPortIds: ["grid-out"],
    quantityMode: "bank",
    quantityKey: "unitCount",
    maxQuantity: 8,
    modelMaturity: "DESIGN ASSUMPTION",
    basis:
      "One placed source represents 1.25 MW of nameplate electrical output before route loss.",
    evidence:
      "Screening allocation set above the v0.1 default equatorial grid regression point (~1.03 MW); replace with project hardware data for design decisions."
  };
}

export const SITE_ASSET_CATALOG: readonly SiteAssetDefinition[] = [
  asset({
    kind: "equatorial.excavator",
    label: "Excavation rover",
    category: "Excavation",
    purpose: "Excavate and meter lunar regolith into the oxygen-production chain.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["equatorial"],
    footprint: { widthM: 4.8, depthM: 3.2, clearanceM: 2 },
    multiplicity: "multiple",
    capacityModel: throughputCapacity(
      "equatorial-excavation",
      "Excavation fleet",
      ["regolith-out"]
    ),
    ports: [
      {
        id: "regolith-out",
        label: "Excavated regolith",
        kind: "material",
        direction: "output",
        streams: ["regolith"]
      }
    ]
  }),
  asset({
    kind: "equatorial.hauler",
    label: "Regolith hauler",
    category: "Excavation",
    purpose: "Move excavated regolith from the trench to the process plant.",
    modelMaturity: "DESIGN ASSUMPTION",
    compatibleEnvironments: ["equatorial"],
    footprint: { widthM: 5.2, depthM: 3.2, clearanceM: 2 },
    multiplicity: "multiple",
    capacityModel: throughputCapacity(
      "equatorial-haul",
      "Regolith haul",
      ["regolith-in", "regolith-out"]
    ),
    ports: [
      {
        id: "regolith-in",
        label: "Regolith pickup",
        kind: "material",
        direction: "input",
        streams: ["regolith"]
      },
      {
        id: "regolith-out",
        label: "Reactor feed",
        kind: "material",
        direction: "output",
        streams: ["regolith"]
      }
    ]
  }),
  asset({
    kind: "equatorial.mre-reactor",
    label: "MRE reactor",
    category: "Processing",
    purpose: "Convert molten regolith into oxygen product and construction-grade slag.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["equatorial"],
    footprint: { widthM: 13, depthM: 11, clearanceM: 4 },
    multiplicity: "multiple",
    capacityModel: throughputCapacity(
      "equatorial-mre",
      "MRE processing",
      ["regolith-in", "power-in", "oxygen-out"]
    ),
    ports: [
      {
        id: "regolith-in",
        label: "Regolith feed",
        kind: "material",
        direction: "input",
        streams: ["regolith"],
        maxConnections: 1
      },
      {
        id: "power-in",
        label: "Electrical power",
        kind: "power",
        direction: "input",
        streams: ["electricity"],
        maxConnections: 1
      },
      {
        id: "oxygen-out",
        label: "Oxygen product",
        kind: "material",
        direction: "output",
        streams: ["oxygen"]
      },
      {
        id: "slag-out",
        label: "Slag coproduct",
        kind: "construction",
        direction: "output",
        streams: ["slag"]
      }
    ]
  }),
  asset({
    kind: "equatorial.casting-yard",
    label: "Slag casting yard",
    category: "Construction",
    purpose: "Cast hot slag into pads, shielding, and structural feedstock.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["equatorial"],
    footprint: { widthM: 18, depthM: 12, clearanceM: 4 },
    multiplicity: "single",
    ports: [
      {
        id: "slag-in",
        label: "Slag feed",
        kind: "construction",
        direction: "input",
        streams: ["slag"],
        maxConnections: 1
      },
      {
        id: "shield-out",
        label: "Shielding product",
        kind: "construction",
        direction: "output",
        streams: ["shielding"]
      }
    ]
  }),
  asset({
    kind: "equatorial.cryo-farm",
    label: "Cryogenic storage farm",
    category: "Storage",
    purpose: "Condition and hold product inventory as an operational reserve.",
    modelMaturity: "LITERATURE-DERIVED",
    compatibleEnvironments: ["equatorial"],
    footprint: { widthM: 18, depthM: 12, clearanceM: 5 },
    multiplicity: "multiple",
    capacityModel: throughputCapacity(
      "equatorial-storage",
      "Product storage",
      ["product-in"]
    ),
    ports: [
      {
        id: "product-in",
        label: "Stored product",
        kind: "material",
        direction: "input",
        streams: ["oxygen"],
        maxConnections: 1
      },
      {
        id: "reserve-out",
        label: "Mission reserve",
        kind: "logistics",
        direction: "output",
        streams: ["reserve"]
      }
    ]
  }),
  asset({
    kind: "equatorial.power-hub",
    label: "Hybrid power hub",
    category: "Power",
    purpose: "Provide the selected solar or nuclear surface-power architecture.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["equatorial"],
    footprint: { widthM: 24, depthM: 16, clearanceM: 8 },
    multiplicity: "single",
    capacityModel: powerCapacity(
      "equatorial-power",
      "Installed surface power"
    ),
    ports: [
      {
        id: "grid-out",
        label: "Site grid",
        kind: "power",
        direction: "output",
        streams: ["electricity"]
      }
    ]
  }),
  asset({
    kind: "equatorial.landing-system",
    label: "Landing system",
    category: "Logistics",
    purpose: "Receive landed infrastructure and transfer stored mission product.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["equatorial"],
    footprint: { widthM: 24, depthM: 24, clearanceM: 20 },
    multiplicity: "single",
    ports: [
      {
        id: "reserve-in",
        label: "Product reserve",
        kind: "logistics",
        direction: "input",
        streams: ["reserve"],
        maxConnections: 1
      },
      {
        id: "infra-out",
        label: "Landed infrastructure",
        kind: "logistics",
        direction: "output",
        streams: ["landed-infrastructure"]
      }
    ]
  }),
  asset({
    kind: "equatorial.habitat",
    label: "Surface habitat",
    category: "Outpost",
    purpose: "Represent an occupied surface anchor and shielding demand.",
    modelMaturity: "DESIGN ASSUMPTION",
    compatibleEnvironments: ["equatorial"],
    footprint: { widthM: 12, depthM: 10, clearanceM: 4 },
    multiplicity: "multiple",
    ports: [
      {
        id: "shield-in",
        label: "Shielding feed",
        kind: "construction",
        direction: "input",
        streams: ["shielding"],
        maxConnections: 1
      },
      {
        id: "infra-in",
        label: "Landed infrastructure",
        kind: "logistics",
        direction: "input",
        streams: ["landed-infrastructure"],
        maxConnections: 1
      }
    ]
  }),
  asset({
    kind: "polar.ice-excavator",
    label: "Polar ice excavator",
    category: "Excavation",
    purpose: "Excavate ice-bearing regolith from a permanently shadowed region.",
    modelMaturity: "DESIGN ASSUMPTION",
    compatibleEnvironments: ["polar"],
    footprint: { widthM: 5.2, depthM: 3.6, clearanceM: 2 },
    multiplicity: "multiple",
    capacityModel: throughputCapacity(
      "polar-excavation",
      "Ice excavation",
      ["icy-feed-out"]
    ),
    ports: [
      {
        id: "icy-feed-out",
        label: "Icy regolith",
        kind: "material",
        direction: "output",
        streams: ["icy-regolith"]
      }
    ]
  }),
  asset({
    kind: "polar.sublimation-camp",
    label: "Sublimation field camp",
    category: "Processing",
    purpose: "Heat icy feedstock and recover water vapor.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["polar"],
    footprint: { widthM: 20, depthM: 16, clearanceM: 5 },
    multiplicity: "multiple",
    capacityModel: throughputCapacity(
      "polar-sublimation",
      "Sublimation recovery",
      ["icy-feed-in", "water-out"]
    ),
    ports: [
      {
        id: "icy-feed-in",
        label: "Icy regolith",
        kind: "material",
        direction: "input",
        streams: ["icy-regolith"],
        maxConnections: 1
      },
      {
        id: "water-out",
        label: "Recovered water",
        kind: "material",
        direction: "output",
        streams: ["water"]
      }
    ]
  }),
  asset({
    kind: "polar.receiver-sabatier",
    label: "Receiver and Sabatier plant",
    category: "Processing",
    purpose: "Receive power, collect water, and optionally produce methane and oxygen.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["polar"],
    footprint: { widthM: 16, depthM: 14, clearanceM: 6 },
    multiplicity: "single",
    capacityModel: throughputCapacity(
      "polar-receiver",
      "Receiver processing",
      ["water-in", "power-in", "product-out"],
      "bank"
    ),
    ports: [
      {
        id: "water-in",
        label: "Recovered water",
        kind: "material",
        direction: "input",
        streams: ["water"],
        maxConnections: 8
      },
      {
        id: "power-in",
        label: "Delivered power",
        kind: "power",
        direction: "input",
        streams: ["electricity"],
        maxConnections: 1
      },
      {
        id: "product-out",
        label: "Mission product",
        kind: "material",
        direction: "output",
        streams: ["water", "oxygen", "methane"]
      }
    ]
  }),
  asset({
    kind: "polar.cryo-farm",
    label: "Polar cryogenic farm",
    category: "Storage",
    purpose: "Condition and store water, oxygen, hydrogen, methane, and feed inventories.",
    modelMaturity: "LITERATURE-DERIVED",
    compatibleEnvironments: ["polar"],
    footprint: { widthM: 18, depthM: 12, clearanceM: 5 },
    multiplicity: "multiple",
    capacityModel: throughputCapacity(
      "polar-storage",
      "Product storage",
      ["product-in"]
    ),
    ports: [
      {
        id: "product-in",
        label: "Stored product",
        kind: "material",
        direction: "input",
        streams: ["water", "oxygen", "methane"],
        maxConnections: 1
      },
      {
        id: "reserve-out",
        label: "Outpost reserve",
        kind: "logistics",
        direction: "output",
        streams: ["reserve"]
      }
    ]
  }),
  asset({
    kind: "polar.power-towers",
    label: "Rim power towers",
    category: "Power",
    purpose: "Collect rim sunlight and deliver usable power to the crater floor.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["polar"],
    footprint: { widthM: 32, depthM: 14, clearanceM: 10 },
    multiplicity: "single",
    capacityModel: powerCapacity(
      "polar-power",
      "Installed surface power"
    ),
    ports: [
      {
        id: "grid-out",
        label: "Delivered power",
        kind: "power",
        direction: "output",
        streams: ["electricity"]
      }
    ]
  }),
  asset({
    kind: "polar.nuclear-station",
    label: "Polar nuclear station",
    category: "Power",
    purpose: "Provide continuous alternative surface power.",
    modelMaturity: "SIMPLIFIED CORRELATION",
    compatibleEnvironments: ["polar"],
    footprint: { widthM: 22, depthM: 18, clearanceM: 12 },
    multiplicity: "single",
    capacityModel: powerCapacity(
      "polar-power",
      "Installed surface power"
    ),
    ports: [
      {
        id: "grid-out",
        label: "Site grid",
        kind: "power",
        direction: "output",
        streams: ["electricity"]
      }
    ]
  }),
  asset({
    kind: "polar.habitat",
    label: "Polar habitat",
    category: "Outpost",
    purpose: "Represent an occupied polar outpost consuming stored product.",
    modelMaturity: "DESIGN ASSUMPTION",
    compatibleEnvironments: ["polar"],
    footprint: { widthM: 12, depthM: 10, clearanceM: 4 },
    multiplicity: "multiple",
    ports: [
      {
        id: "reserve-in",
        label: "Outpost reserve",
        kind: "logistics",
        direction: "input",
        streams: ["reserve"],
        maxConnections: 1
      }
    ]
  })
] as const;

const CATALOG_BY_KIND = new Map(SITE_ASSET_CATALOG.map((definition) => [
  definition.kind,
  definition
]));

export function siteAssetDefinition(kind: string): SiteAssetDefinition | null {
  return CATALOG_BY_KIND.get(kind) ?? null;
}

export function siteAssetsForEnvironment(
  environment: SiteEnvironment
): SiteAssetDefinition[] {
  return SITE_ASSET_CATALOG.filter((definition) =>
    definition.compatibleEnvironments.includes(environment)
  );
}

export interface RequiredSiteConnection {
  id: string;
  label: string;
  kind: SiteConnectionKind;
  fromKinds: readonly string[];
  fromPortId: string;
  toKinds: readonly string[];
  toPortId: string;
}

export const REQUIRED_SITE_CONNECTIONS: Record<
  SiteEnvironment,
  readonly RequiredSiteConnection[]
> = {
  equatorial: [
    {
      id: "equatorial-excavate-haul",
      label: "Excavator to regolith hauler",
      kind: "material",
      fromKinds: ["equatorial.excavator"],
      fromPortId: "regolith-out",
      toKinds: ["equatorial.hauler"],
      toPortId: "regolith-in"
    },
    {
      id: "equatorial-haul-process",
      label: "Regolith hauler to MRE reactor",
      kind: "material",
      fromKinds: ["equatorial.hauler"],
      fromPortId: "regolith-out",
      toKinds: ["equatorial.mre-reactor"],
      toPortId: "regolith-in"
    },
    {
      id: "equatorial-power-process",
      label: "Power hub to MRE reactor",
      kind: "power",
      fromKinds: ["equatorial.power-hub"],
      fromPortId: "grid-out",
      toKinds: ["equatorial.mre-reactor"],
      toPortId: "power-in"
    },
    {
      id: "equatorial-product-storage",
      label: "MRE oxygen product to storage",
      kind: "material",
      fromKinds: ["equatorial.mre-reactor"],
      fromPortId: "oxygen-out",
      toKinds: ["equatorial.cryo-farm"],
      toPortId: "product-in"
    }
  ],
  polar: [
    {
      id: "polar-excavate-extract",
      label: "Ice excavator to sublimation camp",
      kind: "material",
      fromKinds: ["polar.ice-excavator"],
      fromPortId: "icy-feed-out",
      toKinds: ["polar.sublimation-camp"],
      toPortId: "icy-feed-in"
    },
    {
      id: "polar-extract-process",
      label: "Sublimation camp to receiver plant",
      kind: "material",
      fromKinds: ["polar.sublimation-camp"],
      fromPortId: "water-out",
      toKinds: ["polar.receiver-sabatier"],
      toPortId: "water-in"
    },
    {
      id: "polar-power-process",
      label: "Installed power source to receiver plant",
      kind: "power",
      fromKinds: ["polar.power-towers", "polar.nuclear-station"],
      fromPortId: "grid-out",
      toKinds: ["polar.receiver-sabatier"],
      toPortId: "power-in"
    },
    {
      id: "polar-product-storage",
      label: "Receiver plant product to storage",
      kind: "material",
      fromKinds: ["polar.receiver-sabatier"],
      fromPortId: "product-out",
      toKinds: ["polar.cryo-farm"],
      toPortId: "product-in"
    }
  ]
};
