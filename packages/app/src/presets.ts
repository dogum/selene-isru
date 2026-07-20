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
  { id: "shackleton", label: "Shackleton Ice Camp", patch: { site: "polar" } },
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
