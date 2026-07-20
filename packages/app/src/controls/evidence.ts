import type { SimParams } from "@selene-isru/engine";

export type EvidenceMaturity =
  | "REFERENCE DATA"
  | "LITERATURE-DERIVED"
  | "SIMPLIFIED CORRELATION"
  | "DESIGN ASSUMPTION";

export interface ParamEvidence {
  maturity: EvidenceMaturity;
  sourceUrl: string;
  sourceSection: string;
  rangeRationale: string;
  validity: string;
  applicability: string;
  defaultUncertainty: number;
}

interface EvidenceInput {
  key: keyof SimParams;
  group: string;
  source: string;
  min: number;
  max: number;
  unit: string;
}

const REPO_CONSTANTS =
  "https://github.com/dogum/selene-isru/blob/main/constants/constants.json";

const SOURCE_LINKS: Array<{ match: RegExp; url: string; section: string }> = [
  {
    match: /CODATA|standard gravity|molar mass/i,
    url: "https://physics.nist.gov/cuu/Constants/",
    section: "NIST Standard Reference Database 121 · 2022 CODATA adjustment"
  },
  {
    match: /RASSOR|excavat/i,
    url: "https://ntrs.nasa.gov/citations/20220005125",
    section: "NASA IPEx / RASSOR excavation development"
  },
  {
    match: /lunar regolith|lunar soil|Terzaghi|McKyes/i,
    url: "https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20090026015.pdf",
    section: "NASA · The Lunar Regolith"
  },
  {
    match: /PSR|shadow|cold|thermal/i,
    url: "https://ntrs.nasa.gov/citations/20100024437",
    section: "NASA · Polar Lunar Regions thermal environment"
  },
  {
    match: /radiator|solar|irradiance/i,
    url: "https://ntrs.nasa.gov/citations/20240011166",
    section: "NASA · Lunar latitude and terrain radiator sensitivity"
  },
  {
    match: /JANAF|reaction thermodynamics|enthalpy|vaporization|sublimation/i,
    url: "https://janaf.nist.gov/",
    section: "NIST-JANAF thermochemical tables"
  },
  {
    match: /spec|model switch|continuity cal|engineering reference/i,
    url: REPO_CONSTANTS,
    section: "SELENE checked-in design/model assumption"
  }
];

const KEY_OVERRIDES: Partial<Record<keyof SimParams, Partial<ParamEvidence>>> = {
  targetKgPerDay: {
    rangeRationale: "Pilot-to-industrial sweep spanning 10 kg/day through 20 t/day product output.",
    validity: "Steady-state sizing only; no ramp-up, downtime, or campaign scheduling.",
    applicability: "Both sites · mission-level product target",
    defaultUncertainty: 0.1
  },
  missionYears: {
    rangeRationale: "One-to-twenty-year surface campaign envelope used for degradation and payback trades.",
    validity: "Does not include component replacement schedules or probabilistic mission loss.",
    applicability: "Both sites · logistics and power lifecycle",
    defaultUncertainty: 0.05
  },
  rhoReg: {
    rangeRationale: "Loose-to-compacted lunar bulk-regolith engineering envelope.",
    applicability: "Both sites · excavation and feed mass",
    defaultUncertainty: 0.12
  },
  chiIce: {
    rangeRationale: "0.5–12 wt% volatile-bearing feed envelope for polar trade exploration.",
    validity: "Assumes a spatially uniform bulk ice fraction; assay heterogeneity is not resolved.",
    applicability: "Polar site only · excavation and sublimation",
    defaultUncertainty: 0.25
  },
  Vcell: {
    rangeRationale: "Engineering operating envelope around the modeled MRE decomposition requirement and overpotential.",
    validity: "Aggregate cell voltage; electrode degradation and transient control are excluded.",
    applicability: "Equatorial MRE only · electrolysis",
    defaultUncertainty: 0.08
  },
  etaCurrent: {
    rangeRationale: "Conservative-to-aspirational current-efficiency range for design sensitivity.",
    validity: "Treated as independent of current density, chemistry, and operating age.",
    applicability: "Equatorial MRE only · electrolysis",
    defaultUncertainty: 0.12
  },
  Tmelt: {
    rangeRationale: "Regolith melt-temperature operating envelope used by viscosity and sensible-heat calculations.",
    validity: "Bulk uniform temperature; local gradients and refractory limits require detailed design.",
    applicability: "Equatorial MRE only · thermal/electrolysis",
    defaultUncertainty: 0.05
  },
  jOperating: {
    rangeRationale: "Design sweep bounded by low-rate operation and the model's diffusion-limit warning region.",
    validity: "One-dimensional mass-transfer limit; electrode geometry and bubbles are unresolved.",
    applicability: "Equatorial MRE only · anode operating point",
    defaultUncertainty: 0.15
  },
  reserveDays: {
    rangeRationale: "Operational reserve from one day through a sixty-day contingency stock.",
    validity: "Constant production and withdrawal; transfer campaigns are not scheduled.",
    applicability: "Both sites · cryogenic storage",
    defaultUncertainty: 0.1
  },
  Nmli: {
    rangeRationale: "Sparse-to-high-performance multilayer-insulation construction sweep.",
    validity: "Layer performance is lumped; seams, penetrations, compression, and aging are excluded.",
    applicability: "Both sites · cryogenic heat leak",
    defaultUncertainty: 0.15
  },
  etaCell: {
    rangeRationale: "Commercial-to-advanced photovoltaic conversion-efficiency design envelope.",
    validity: "Uniform array temperature and illumination; dust and pointing are represented separately or omitted.",
    applicability: "Both sites · solar architecture",
    defaultUncertainty: 0.08
  },
  alphaSpecific: {
    rangeRationale: "Advanced-to-conservative fission system specific-mass envelope excluding shielding.",
    validity: "Linear mass scaling; packaging, redundancy, and minimum unit size are not resolved.",
    applicability: "Both sites · nuclear architecture",
    defaultUncertainty: 0.2
  },
  thetaDivBeam: {
    rangeRationale: "Narrow-to-diffuse beam divergence envelope for crater-floor delivery trades.",
    validity: "Geometric beam spread only; pointing jitter and atmospheric effects are absent.",
    applicability: "Polar site · beamed solar power",
    defaultUncertainty: 0.2
  },
  IspLander: {
    rangeRationale: "Storable-to-high-performance chemical lander propulsion envelope.",
    validity: "Ideal rocket equation with fixed total delta-v and no reserve policy beyond the explicit residual mass.",
    applicability: "Both sites · landed payload",
    defaultUncertainty: 0.05
  },
  shieldDesignM: {
    rangeRationale: "Thin demonstration cover through multi-meter bulk shielding design depth.",
    validity: "Mass-balance depth only; radiation transport and structural penetrations are not modeled.",
    applicability: "Equatorial construction and habitat visualization",
    defaultUncertainty: 0.15
  }
};

function maturityFor(source: string): EvidenceMaturity {
  if (/CODATA|standard gravity|molar mass/i.test(source)) {
    return "REFERENCE DATA";
  }
  if (/spec|model switch|continuity cal/i.test(source)) {
    return "DESIGN ASSUMPTION";
  }
  if (/Terzaghi|McKyes|approximation|coefficient|fit|cal/i.test(source)) {
    return "SIMPLIFIED CORRELATION";
  }
  return "LITERATURE-DERIVED";
}

function applicabilityFor(group: string): string {
  const labels: Record<string, string> = {
    global: "Both sites · mission definition",
    excavation: "Both sites · excavation",
    electrolysis: "Equatorial site · MRE electrolysis",
    thermal: "Polar site · sublimation",
    sabatier: "Polar site · optional Sabatier loop",
    cryo: "Both sites · cryogenic storage",
    power: "Both sites · surface power",
    logistics: "Both sites · landing and logistics",
    construction: "Equatorial site · slag construction"
  };
  return labels[group] ?? `Model group · ${group}`;
}

export function evidenceForParam(input: EvidenceInput): ParamEvidence {
  const link = SOURCE_LINKS.find((entry) => entry.match.test(input.source)) ?? {
    url: REPO_CONSTANTS,
    section: "SELENE model constants and cited source label"
  };
  const maturity = maturityFor(input.source);
  const base: ParamEvidence = {
    maturity,
    sourceUrl: link.url,
    sourceSection: link.section,
    rangeRationale:
      maturity === "DESIGN ASSUMPTION"
        ? `Checked-in design sweep from ${input.min} to ${input.max} ${input.unit === "1" ? "" : input.unit}.`
        : `Bounded literature/model sweep from ${input.min} to ${input.max} ${input.unit === "1" ? "" : input.unit}.`,
    validity: "Use inside the supported range and with the subsystem assumptions shown in the selected-asset inspector.",
    applicability: applicabilityFor(input.group),
    defaultUncertainty: maturity === "REFERENCE DATA" ? 0.005 : maturity === "DESIGN ASSUMPTION" ? 0.15 : 0.1
  };
  return { ...base, ...KEY_OVERRIDES[input.key] };
}
