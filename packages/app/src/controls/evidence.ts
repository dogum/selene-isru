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
    match: /^(?:calibrated to |derived from )?Eagle Engineering 1988/,
    url: "https://ntrs.nasa.gov/citations/19890004515",
    section: "Eagle Engineering 1988, Conceptual Design of a Lunar Oxygen Pilot Plant (EEI 88-182, NASA contract NAS9-17878), Tables 6-1, 6-3 and 6-5, Appendix A"
  },
  {
    match: /^Guerrero-Gonzalez/,
    url: "https://doi.org/10.1016/j.actaastro.2022.11.050",
    section: "Guerrero-Gonzalez & Zabel 2023, System analysis of an ISRU production plant: extraction of metals and oxygen from lunar regolith (Acta Astronautica 203), Sec. 3.4 and Table 2"
  },
  {
    match: /arXiv:1910\.04265/,
    url: "https://arxiv.org/abs/1910.04265",
    section: "Chen, Sarton du Jonchay, Hou & Ho 2021, Multifidelity Space Mission Planning and Infrastructure Design Framework for Space Resource Logistics (J. Spacecraft & Rockets; arXiv:1910.04265), Tables 1, 2 and 4"
  },
  {
    match: /Merancy/,
    url: "https://www.nasa.gov/wp-content/uploads/2023/10/nrho-artemis-orbit.pdf",
    section: "NASA Architecture Workshop 2023 · Merancy, How: NRHO, The Artemis Orbit (cis-lunar delta-v, slides 6 and 9)"
  },
  {
    match: /Kleinhenz/i,
    url: "https://ntrs.nasa.gov/citations/20205007966",
    section: "NASA · Kleinhenz & Paz 2020, Case Studies for Lunar ISRU Systems Utilizing Polar Water (AIAA 2020-4042)"
  },
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
    validity: "Sizes the plant at steady state. Deployment, commissioning, downtime, and spares are applied in the campaign ledger, not in sizing.",
    applicability: "Both sites · mission-level product target",
    defaultUncertainty: 0.1
  },
  missionYears: {
    rangeRationale: "One-to-twenty-year surface campaign envelope used for degradation and mass-leverage trades.",
    validity: "Years of production after commissioning. Spares are a constant annual mass fraction; replacement schedules and probabilistic mission loss are not modelled.",
    applicability: "Both sites · logistics and power lifecycle",
    defaultUncertainty: 0.05
  },
  gearRatio: {
    validity: "Read as low-Earth-orbit mass saved per kg of product, the unit of M0leo, so the campaign ledger compares like with like. For product used on the surface, the lander model itself implies about 12.8 kg/kg at defaults; lower values suit product used in orbit.",
    applicability: "Both sites · leverage and campaign ledger"
  },
  mixtureRatio: {
    rangeRationale: "Fuel-rich to near-stoichiometric LOX/LH2 engines; NASA's polar case uses 6, and RL10-class engines run about 5.5–5.9.",
    validity: "Sets usable propellant and splits a refuelling demand into oxygen and hydrogen. Electrolysis gives O/F 7.94, so without a demand hydrogen limits usable propellant and the surplus oxygen is reported but not credited.",
    applicability: "Polar propellant mode, and the refuelling demand at either site",
    defaultUncertainty: 0.05
  },
  kElectrolyzerMass: {
    rangeRationale: "Bounded around the NASA case's PEM electrolyzer and gas dryers.",
    validity: "Derived from one small (67 kg/day) design and scaled linearly with water processed; storage tanks are sized separately in the cryo block.",
    applicability: "Polar propellant mode, and the equatorial ilmenite plant's water electrolysis",
    defaultUncertainty: 0.3
  },
  Vel: {
    applicability: "Polar propellant mode and Sabatier loop, and the equatorial ilmenite plant's water electrolysis"
  },
  etaFaradayEl: {
    applicability: "Polar propellant mode and Sabatier loop, and the equatorial ilmenite plant's water electrolysis"
  },
  Tambient: {
    applicability: "Equatorial site · feed temperature for the MRE melt and the ilmenite reactor"
  },
  fIlmenite: {
    rangeRationale: "From highland soils near 1 wt% to high-Ti mare soils near 17 wt% (Guerrero-Gonzalez & Zabel 2023, Fig. 10). Eagle's mare soil is 7.5 wt%.",
    validity: "A property of the site, not a design lever. Ilmenite is assumed spread evenly across grain sizes, so the share outside the feed window is lost with that soil, as Eagle assumed.",
    defaultUncertainty: 0.3
  },
  fIlmSized: {
    rangeRationale: "Eagle's split comes from one Apollo 11 soil (10084); coarser or finer soils move it.",
    validity: "The window is 0.045–0.5 mm, set by fluidization and dust carry-over. Grinding oversize to recover its ilmenite is not modelled.",
    defaultUncertainty: 0.2
  },
  etaIlmRecovery: {
    validity: "Recovery of liberated ilmenite grains. Ilmenite locked in agglutinates or rock fragments is not recovered; lower values stand in for it.",
    defaultUncertainty: 0.1
  },
  ilmConcentrateGrade: {
    rangeRationale: "From an enrichment factor near 3, measured on simulants (Berggren et al., used by Guerrero-Gonzalez & Zabel), to Eagle's assumed 90 wt% concentrate.",
    validity: "Sets the solids the reactor heats. A grade no richer than the soil's means no separation: the whole sized stream goes to the reactor with all its ilmenite, so magnetic recovery no longer applies. Reactor mass does not scale with feed here, so lean concentrates understate it: Eagle's no-separation trade added 46% to its process mass.",
    defaultUncertainty: 0.3
  },
  fIlmConversion: {
    rangeRationale: "From about a third, measured in short static runs at 1,000 °C (Sargeant et al. 2020), to complete reduction.",
    validity: "Not tied to temperature or residence time in this model; Eagle's 90% assumes a three-stage fluidized bed with a 4 h residence. Reduction of FeO in other minerals is not credited.",
    defaultUncertainty: 0.15
  },
  TIlmReactor: {
    rangeRationale: "900–1,100 °C, the range of most ilmenite reduction studies.",
    validity: "Sets the feed heat only. A hotter reactor reduces faster in practice, but conversion is a separate input here.",
    defaultUncertainty: 0.05
  },
  etaIlmHeatRecovery: {
    validity: "Feed heat recovered from discharged solids and gas in a counter-current reactor. Eagle's conceptual design assumed half; no lunar heat-recovery hardware has been demonstrated.",
    defaultUncertainty: 0.3
  },
  fIlmHeatLoss: {
    validity: "Lumps reactor wall loss, heater inefficiency, and the gas recycle compressor. Calibrated so the model reproduces Eagle's 1,160 kW process power at 1,000 t/yr; Eagle's 2 t/month pilot lost about half its heater power.",
    defaultUncertainty: 0.3
  },
  eIlmMining: {
    rangeRationale: "From RASSOR (10 kJ/kg) and Eagle's front-end loaders (11.9 kJ/kg) up to the fleet-level figure MRE uses (120 kJ/kg).",
    validity: "Energy per kg of soil delivered to the plant, tailings returned. Applies to the ilmenite plant only; MRE and polar plants keep the fleet-level mining energy and a fleet scaled with product.",
    defaultUncertainty: 0.3
  },
  kIlmMiningMass: {
    validity: "RASSOR-class excavators, 66 kg moving 2.7 t a day each; Eagle's front-end loaders give 0.014.",
    defaultUncertainty: 0.3
  },
  eIlmBeneficiation: {
    validity: "Fine screening dominates in both studies. Electrostatic separation, which needs the feed heated to about 200 °C, is not modelled.",
    defaultUncertainty: 0.3
  },
  kIlmBeneficiationMass: {
    validity: "Screens, magnetic separator, hoppers, and conveyors. Guerrero-Gonzalez & Zabel's parametric models give about 2.3 times Eagle's mass per tonne of soil.",
    defaultUncertainty: 0.4
  },
  kIlmReactorMass: {
    validity: "Reactor vessels, heater, cyclones, hoppers, gas handling, piping, and radiators, scaled with oxygen output. The electrolyzer, liquefier, and tanks are sized separately. Derived from one design.",
    defaultUncertainty: 0.3
  },
  kLiquefierLox: {
    rangeRationale: "No liquefaction hardware up to several times the NASA case's cryocooler-based O2 liquefier.",
    validity: "Derived from one small design (60 kg/day O2) and scaled linearly; applies to stored liquid-oxygen product only.",
    applicability: "Both sites · liquid-oxygen product",
    defaultUncertainty: 0.3
  },
  kLiquefierLh2: {
    rangeRationale: "No liquefaction hardware up to about 2.5× the NASA case's cryocooler-based H2 liquefier, its largest single mass item.",
    validity: "Derived from one small design (7.5 kg/day H2) and scaled linearly, which is conservative for large plants; applies to stored liquid-hydrogen product only.",
    applicability: "Both sites · liquid-hydrogen product",
    defaultUncertainty: 0.4
  },
  secCondLox: {
    rangeRationale: "From an efficient large liquefier to a small, poorly integrated one.",
    validity: "Derived from NASA's cryocooler-based O2 liquefier with its 20% power margin removed; earlier versions used an uncited 2.2 kWh/kg.",
    applicability: "Both sites · liquid-oxygen product",
    defaultUncertainty: 0.2
  },
  secCondLh2: {
    rangeRationale: "From large terrestrial liquefiers (about 10–12 kWh/kg) to small cryocooler-based units like NASA's polar design (about 54 kWh/kg).",
    validity: "Derived from a 7.5 kg/day design, so it is pessimistic for large plants. Earlier versions used an uncited 12 kWh/kg, a large-terrestrial-plant figure.",
    applicability: "Both sites · liquid-hydrogen product",
    defaultUncertainty: 0.3
  },
  landingsPerYear: {
    rangeRationale: "From one landing every two years to monthly cargo service; the source assumes a launch every 120 days.",
    validity: "Landings arrive evenly from day 0, each carrying up to one lander capacity of plant. Matters only when the plant needs more than one lander. No launch failures or schedule slips.",
    applicability: "Both sites · deployment campaign",
    defaultUncertainty: 0.3
  },
  commissioningDays: {
    rangeRationale: "Immediate start to a full year of checkout. NASA's polar case study assumes 48 hours; the 30-day default allows for a first-of-a-kind plant.",
    validity: "One block of time after the last landing with no output. Partial early operation and phased start-up are not modelled.",
    applicability: "Both sites · deployment campaign",
    defaultUncertainty: 0.5
  },
  plantAvailability: {
    rangeRationale: "Half to full uptime after commissioning.",
    validity: "A constant average derate on output for unplanned downtime. Separate from night-time power storage, which plant sizing already covers.",
    applicability: "Both sites · operations campaign",
    defaultUncertainty: 0.1
  },
  sparesFracPerYear: {
    rangeRationale: "No resupply up to 30% of plant mass each year; published ISRU logistics studies use 5% and 10%.",
    validity: "Spares ride as a mass share of other cargo at the lander's LEO cost per landed kg. They do not add capacity or wear out on a schedule.",
    applicability: "Both sites · operations campaign",
    defaultUncertainty: 0.5
  },
  sortiesPerYear: {
    rangeRationale: "From a sortie every two years to weekly service; the source campaign flies one crewed mission a year.",
    validity: "Sorties are evenly spaced and each loads its whole propellant on the surface. No missed sorties, vehicle boil-off, or reserves.",
    applicability: "Oxygen or propellant plants · refuelling demand",
    defaultUncertainty: 0.5
  },
  MdryReusable: {
    rangeRationale: "From a small cargo hopper to a large crewed lander; the default is the source's ACES-based stage, and Lockheed Martin's 2018 crewed concept is about 22 t.",
    validity: "Constant over the campaign; the same vehicle flies every sortie.",
    applicability: "Oxygen or propellant plants · refuelling demand",
    defaultUncertainty: 0.2
  },
  MtankReusable: {
    rangeRationale: "Small hopper to large tanker capacity around the source's 68 t ACES-based stage.",
    validity: "Only checked: a sortie that needs more raises a caution, and the demand is computed as if it fit.",
    applicability: "Oxygen or propellant plants · refuelling demand",
    defaultUncertainty: 0.1
  },
  IspReusable: {
    rangeRationale: "Down to 350 s for degraded or heavily throttled engines, up to RL10B-2-class hydrogen engines (about 465 s); the source uses 420 s.",
    validity: "Ideal rocket equation on both legs at this Isp. The demand always splits at the LOX/LH2 mixture ratio.",
    applicability: "Oxygen or propellant plants · refuelling demand",
    defaultUncertainty: 0.03
  },
  McargoDown: {
    rangeRationale: "Empty return up to 60 t; the source's crewed mission lands 30 t of cabin and equipment.",
    validity: "Cargo is picked up in the staging orbit; delivering it there from Earth is outside this ledger.",
    applicability: "Oxygen or propellant plants · refuelling demand",
    defaultUncertainty: 0.3
  },
  McargoUp: {
    rangeRationale: "Empty climb up to 30 t; the source's crew returns 5 t of cabin and samples.",
    validity: "Carried from the surface to the staging orbit and handed over there.",
    applicability: "Oxygen or propellant plants · refuelling demand",
    defaultUncertainty: 0.3
  },
  dvDescent: {
    rangeRationale: "From low lunar orbit (about 2,050 m/s) through NRHO (about 2,700 m/s) to Constellation's global-access LLO (3,160 m/s).",
    validity: "Covers any orbit transfer and the landing; no losses beyond those already in the figure.",
    applicability: "Oxygen or propellant plants · refuelling demand",
    defaultUncertainty: 0.05
  },
  dvAscent: {
    rangeRationale: "From low lunar orbit (about 1,860 m/s) to NRHO (about 2,700 m/s).",
    validity: "Covers the climb and any orbit transfer; the lander carries the propellant for its return.",
    applicability: "Oxygen or propellant plants · refuelling demand",
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
    validity: "System-level applied voltage is decomposed into reversible, activation, area-specific ohmic, concentration, and unallocated terms. The loss inputs are lumped assumptions rather than integrated-reactor calibration.",
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
    validity: "Drives electrode area, ohmic loss, concentration overpotential, and the diffusion-limit warning; bubble coverage and three-dimensional geometry remain unresolved.",
    applicability: "Equatorial MRE only · voltage-loss and electrode-area operating point",
    defaultUncertainty: 0.15
  },
  mreActivationOverpotentialV: {
    rangeRationale: "Bounded aggregate electrode-kinetics sweep used to expose voltage headroom.",
    validity: "A lumped design assumption, not a fitted Butler-Volmer model or electrode-specific measurement.",
    applicability: "Equatorial MRE · voltage-loss decomposition",
    defaultUncertainty: 0.25
  },
  mreAreaSpecificResistanceOhmM2: {
    rangeRationale: "Conceptual electrolyte/electrode area-specific resistance envelope.",
    validity: "Uniform effective resistance; temperature gradients, electrode spacing, contacts, bubbles, and aging are not resolved.",
    applicability: "Equatorial MRE · ohmic voltage loss",
    defaultUncertainty: 0.3
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
  Nlaydens: {
    rangeRationale: "Layer-density sweep around the checked-in v0.1 thermal anchors.",
    validity: "The current coefficient is calibrated with an internal layers/mm convention. Published NASA optimization examples report layers/cm; absolute heat leak remains benchmark-pending.",
    applicability: "Both sites · storage heat-leak sensitivity",
    defaultUncertainty: 0.25
  },
  polarIlluminationFraction: {
    rangeRationale: "Site-profile envelope rather than a lunar-global constant.",
    validity: "Default reflects a Shackleton-rim study case; mission design requires a location and height-specific illumination trace.",
    applicability: "Polar solar architecture and storage sizing",
    defaultUncertainty: 0.15
  },
  polarLongestShadowHours: {
    rangeRationale: "One-hour favorable access through a full equatorial half-cycle.",
    validity: "Default is a conservative Shackleton-rim study value. NASA reported 62 h for a different favorable reduced-DEM site.",
    applicability: "Polar storage sizing and time-domain display",
    defaultUncertainty: 0.2
  },
  polarProfileMode: {
    validity: "Imported profiles are deterministic user inputs, not validated site ephemerides.",
    applicability: "Polar solar, receiver, storage, thermal display, and time-domain simulation"
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
  etaIceCapture: {
    rangeRationale: "From heavy capture loss (40%) to ideal capture; the NASA polar-water case study assumes 75%.",
    validity: "Lumps sublimation during excavation, line losses, and cold-trap inefficiency into one mass fraction. Uncaptured ice still costs its heating and sublimation energy.",
    applicability: "Polar site · ice extraction yield, regolith throughput, and extractor size",
    defaultUncertainty: 0.15
  },
  etaSubHeater: {
    maturity: "SIMPLIFIED CORRELATION",
    rangeRationale: "Poorly coupled heaters (15%) to an ideal heater with every joule reaching the feed (100%).",
    validity: "Default 0.4 is derived: this model's thermal minimum for the NASA baseline (67 kg/day water, 5 wt%, 75% capture) divided by the study's ~16.7 kW water-extractor power before margin. It calibrates the energy, not a specific heater design.",
    applicability: "Polar site · sublimation heater input and parasitic heat loss",
    defaultUncertainty: 0.25
  },
  kIceExtractorMass: {
    maturity: "SIMPLIFIED CORRELATION",
    rangeRationale: "Light auger-dryer scaling to heavy batch-oven scaling, per kg of regolith processed per day.",
    validity: "Default 0.18 is derived from the NASA baseline water extractor (~330 kg incl. margins at ~1.8 t/day regolith). Scaling is linear in regolith throughput, which is conservative for large plants; the study's own trade is sub-linear.",
    applicability: "Polar site · landed extraction-plant mass",
    defaultUncertainty: 0.3
  },
  // The blade-cutting model is a feasibility diagnostic by design (v0.4): at
  // defaults its work is ~34 J/kg of regolith against the 120 kJ/kg fleet
  // figure, and that fleet figure is RASSOR-class, whose counter-rotating
  // drums cancel the reaction force a blade would need traction to resist.
  ...Object.fromEntries(
    (["c", "Nc", "Nq", "Ngamma", "zDepth", "wBlade", "dBlade", "vCut", "etaDrive"] as const).map((key) => [
      key,
      {
        validity:
          "Blade-cutting force (Terzaghi/McKyes) for the excavation-drive diagnostics. Cutting work is about 0.03% of the fleet-level mining energy at defaults, so excavation energy uses the RASSOR-class fleet figure (eMining) instead; a blade excavator's traction limit in lunar gravity is not applied because RASSOR-class drums cancel the reaction force."
      }
    ])
  ),
  ...Object.fromEntries(
    (["secCondLox", "secCondWaterIce", "secCondLiquidWater", "secCondLh2", "secCondLch4", "secCondCo2"] as const).map((key) => [
      key,
      {
        rangeRationale: "Design sweep around the v0.3 conditioning estimate, which carries no published per-stream source.",
        validity: "Lumped energy to bring the product to its storage state (liquefaction or chilling). Not derived from cryocooler efficiency; treat as an assumption to vary.",
        applicability: "Shown only while the engine stores this stream · product conditioning energy",
        defaultUncertainty: 0.3
      }
    ])
  ),
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
    ilmenite: "Equatorial site · ilmenite H₂ reduction",
    thermal: "Polar site · sublimation",
    sabatier: "Polar site · optional Sabatier loop",
    cryo: "Both sites · cryogenic storage",
    power: "Both sites · surface power",
    logistics: "Both sites · landing and logistics",
    campaign: "Both sites · deployment and operations campaign",
    refuel: "Oxygen or propellant plants · refuelling demand",
    propellant: "Polar site · water electrolysis (propellant mode or Sabatier loop)",
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
