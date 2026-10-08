import type { SimParams } from "@selene-isru/engine";

export interface Preset {
  id: string;
  label: string;
  patch: Partial<SimParams>;
}

/** Preset scenarios (§5). Each is a param patch applied over DEFAULTS. */
export const PRESETS: Preset[] = [
  { id: "baseline", label: "Baseline 1 t/day", patch: {} },
  {
    id: "mare-assay",
    label: "Mare Basalt Assay",
    patch: {
      oxideSiO2: 0.45,
      oxideTiO2: 0.04,
      oxideAl2O3: 0.13,
      oxideFeO: 0.18,
      oxideMgO: 0.09,
      oxideCaO: 0.11
    }
  },
  {
    id: "highlands-assay",
    label: "Highlands Assay",
    patch: {
      oxideSiO2: 0.45,
      oxideTiO2: 0.01,
      oxideAl2O3: 0.28,
      oxideFeO: 0.06,
      oxideMgO: 0.07,
      oxideCaO: 0.13
    }
  },
  {
    // Eagle Engineering 1988's soil-fed plant: 7.5 wt% ilmenite mare soil,
    // magnetic concentration, and hydrogen reduction at 1,000 C.
    id: "ilmenite-mare",
    label: "Ilmenite Reduction (Mare Soil)",
    patch: { equatorialProcess: "ilmenite" }
  },
  {
    // High-Ti mare soil near the top of the lunar range (about 15 wt%).
    id: "ilmenite-high-ti",
    label: "Ilmenite Reduction (High-Ti Mare)",
    patch: { equatorialProcess: "ilmenite", fIlmenite: 0.15 }
  },
  {
    // Eagle 1988's basalt-fed plant: high-Ti basalt (about 33 wt% ilmenite)
    // crushed, ground, and separated before the same reactor.
    id: "ilmenite-basalt",
    label: "Ilmenite Reduction (High-Ti Basalt)",
    patch: { equatorialProcess: "ilmenite", ilmFeed: "basalt" }
  },
  { id: "shackleton", label: "Shackleton Ice Camp", patch: { site: "polar" } },
  {
    // Kleinhenz & Paz 2020's baseline: 15 t of water into LOX/LH2 in a
    // 225-day window after 48 h of commissioning, once a year. The plant is
    // sized for the window's rate; availability carries the 223-of-365-day duty.
    id: "polar-propellant",
    label: "Polar Propellant (NASA baseline)",
    patch: { site: "polar", polarProduct: "propellant", targetKgPerDay: 67.26, plantAvailability: 0.611, commissioningDays: 2 }
  },
  {
    // Chen et al. 2021's yearly crewed sortie flown by their LH2/LOX stage
    // from LLO, refuelled with the default plant's oxygen.
    id: "crew-refuelling",
    label: "Crew Lander Refuelling",
    patch: { refuelDemand: "lander" }
  },
  {
    // The same vehicle as a polar tanker: 8 sorties a year landing 5 t.
    id: "polar-tanker",
    label: "Polar Propellant Tanker",
    patch: { site: "polar", polarProduct: "propellant", refuelDemand: "lander", sortiesPerYear: 8, McargoDown: 5000 }
  },
  { id: "industrial", label: "Industrial 10 t/day", patch: { targetKgPerDay: 10000 } },
  {
    id: "minimal",
    label: "Minimal Outpost",
    patch: { targetKgPerDay: 100, missionYears: 10 }
  },
  {
    id: "rich-ice",
    label: "PSR Ice-Rich Assay",
    patch: {
      site: "polar",
      chiIce: 0.12,
      oxideSiO2: 0.43,
      oxideTiO2: 0.01,
      oxideAl2O3: 0.24,
      oxideFeO: 0.08,
      oxideMgO: 0.08,
      oxideCaO: 0.16
    }
  }
];
