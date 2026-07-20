import type { SimParams, SimResult } from "@selene-isru/engine";
import { paramsForGroup } from "../controls/manifest";
import { formatQtyText } from "../lib/format";
import { useStore } from "../state/store";
import { ParamRow } from "./ParamRow";

interface MetricValue {
  label: string;
  value: string;
}

interface AssetConfig {
  id: string;
  title: string;
  group: string;
  module: string;
  controlLabels: Record<string, string>;
  note: string;
  metrics: (result: SimResult, params: SimParams) => MetricValue[];
}

const EQUATORIAL_CONFIG: Record<string, AssetConfig> = {
  excavator: {
    id: "EX-01",
    title: "EXCAVATION ROVER",
    group: "excavation",
    module: "excavation",
    controlLabels: {
      zDepth: "Cut depth",
      wBlade: "Blade width",
      vCut: "Cut speed",
      etaDrive: "Drive efficiency"
    },
    note: "Closed-loop traverse speed, articulated boom, bucket stroke, wheel contact, and dust cadence respond to excavation throughput.",
    metrics: (r) => [
      { label: "Regolith feed", value: formatQtyText(r.production.regolithKgPerDay, "kg/day") },
      { label: "Cutting force", value: formatQtyText(r.excavation.cuttingForceN, "N") },
      { label: "Mechanical power", value: formatQtyText(r.excavation.mechPowerW, "W") },
      { label: "Fleet mass", value: formatQtyText(r.excavation.fleetMassKg, "kg") }
    ]
  },
  hauler: {
    id: "HV-01",
    title: "REGOLITH HAULER",
    group: "excavation",
    module: "excavation",
    controlLabels: {
      eMining: "Mining energy",
      kExcFleet: "Fleet mass factor",
      vCut: "Excavation speed",
      etaDrive: "Drive efficiency"
    },
    note: "The hauler shuttles between trench and reactor, carries a throughput-scaled load, and raises its dump bed at the process handoff.",
    metrics: (r) => [
      { label: "Regolith moved", value: formatQtyText(r.production.regolithKgPerDay, "kg/day") },
      { label: "Fleet mass", value: formatQtyText(r.excavation.fleetMassKg, "kg") },
      { label: "Grid demand", value: formatQtyText(r.energy.gridPowerW, "W") },
      { label: "Product target", value: formatQtyText(r.production.targetKgPerDay, "kg/day") }
    ]
  },
  reactor: {
    id: "MRE-01",
    title: "MOLTEN REGOLITH ELECTROLYSIS",
    group: "electrolysis",
    module: "electrolysis",
    controlLabels: {
      Vcell: "Cell voltage",
      etaCurrent: "Current efficiency",
      Tmelt: "Melt temperature",
      jOperating: "Anode current density"
    },
    note: "Feed gate, tap valve, gauge, thermal band, and beacon respond to the current simulator state.",
    metrics: (r) => [
      { label: "O₂ output", value: formatQtyText(r.production.o2KgPerDay, "kg/day") },
      { label: "Cell current", value: `${(r.electrolysis.currentA / 1_000).toFixed(1)} kA` },
      { label: "Electrolysis SEC", value: formatQtyText(r.electrolysis.secElec_JPerKg / 3.6e6, "kWh/kg") },
      { label: "Effective O₂ yield", value: formatQtyText(r.electrolysis.xO2Effective, "kg/kg", 3) }
    ]
  },
  castingYard: {
    id: "CY-01",
    title: "SLAG CASTING YARD",
    group: "construction",
    module: "construction",
    controlLabels: {
      rhoSlag: "Slag density",
      castDeltaT: "Casting temperature drop",
      dPad: "Pad diameter",
      tPad: "Pad thickness"
    },
    note: "The pour arm cycles over the mold conveyor while the brick field grows and its leading castings cool from orange to gray.",
    metrics: (r) => [
      { label: "Slag feed", value: formatQtyText(r.production.slagKgPerDay, "kg/day") },
      { label: "Cast output", value: formatQtyText(r.construction.slagPerYearT, "t/yr") },
      { label: "Pads per year", value: formatQtyText(r.construction.padsPerYear, "pads/yr", 2) },
      { label: "Safe cooling ΔT", value: formatQtyText(r.construction.maxSafeCoolingDeltaK, "K") }
    ]
  },
  tanks: {
    id: "CR-01",
    title: "CRYOGENIC STORAGE FARM",
    group: "cryo",
    module: "cryo",
    controlLabels: {
      reserveDays: "Reserve duration",
      Nmli: "MLI layers",
      Ttank: "Tank temperature",
      secLiquefaction: "Liquefaction SEC"
    },
    note: "Tank count follows reserve volume; fill columns, valve speed, beacon intensity, and subtle vapor follow storage state and calculated boil-off.",
    metrics: (r, p) => [
      { label: "Boil-off", value: formatQtyText(r.cryo.boiloffKgPerDay, "kg/day") },
      { label: "Heat leak", value: formatQtyText(r.cryo.qLeakW, "W") },
      { label: "Cryocooler", value: formatQtyText(r.cryo.cryocoolerPowerW, "W") },
      { label: "Reserve", value: formatQtyText(p.reserveDays, "days", 1) }
    ]
  },
  station: {
    id: "PW-01",
    title: "HYBRID POWER HUB",
    group: "power",
    module: "power",
    controlLabels: {
      thetaSun: "Solar incidence",
      etaCell: "Cell efficiency",
      SEstorage: "Storage specific energy",
      alphaSpecific: "Nuclear specific mass"
    },
    note: "The selected solar or nuclear branch shares a switchgear deck; trackers follow the lunar cycle and radiator span follows rejected heat.",
    metrics: (r) => [
      { label: "Architecture", value: r.power.architecture.toUpperCase() },
      { label: "Grid power", value: formatQtyText(r.energy.gridPowerW, "W") },
      { label: "Solar array", value: formatQtyText(r.power.solarArrayM2, "m²") },
      { label: "Radiator area", value: formatQtyText(r.power.radiatorM2, "m²") }
    ]
  },
  pad: {
    id: "LP-01",
    title: "LANDING SYSTEM",
    group: "logistics",
    module: "logistics",
    controlLabels: {
      IspLander: "Lander specific impulse",
      MdryLander: "Lander dry mass",
      dPad: "Pad diameter",
      tPad: "Pad thickness"
    },
    note: "Pad tiles and mission markers scale with construction and logistics; the lander runs a restrained arrival/departure cycle with ramp and plume state.",
    metrics: (r) => [
      { label: "Missions", value: formatQtyText(r.logistics.nMissions, "msn", 0) },
      { label: "Payload per mission", value: formatQtyText(r.logistics.payloadPerMissionKg, "kg") },
      { label: "Pads per year", value: formatQtyText(r.construction.padsPerYear, "pads/yr", 2) },
      { label: "Joint utilization", value: `${(r.construction.padJointUtilization * 100).toFixed(1)}%` }
    ]
  },
  habitat: {
    id: "HAB-01",
    title: "SHIELDED SURFACE HABITAT",
    group: "construction",
    module: "construction",
    controlLabels: {
      shieldDesignM: "Designed shielding",
      areaHabRoof: "Habitat roof area",
      Pinternal: "Internal pressure",
      rhoSlag: "Shield material density"
    },
    note: "Visible roof sections quantize the selected shielding depth while the airlock, pressure shell, radiator, and lit windows expose human scale and function.",
    metrics: (r, p) => [
      { label: "Shield design", value: formatQtyText(r.construction.shieldDesignM, "m", 2) },
      { label: "Full-balance shield", value: formatQtyText(r.construction.shieldFullBalanceM, "m", 2) },
      { label: "Time to shield", value: formatQtyText(r.construction.daysToShieldHabitat, "days") },
      { label: "Roof area", value: formatQtyText(p.areaHabRoof, "m²") }
    ]
  }
};

const POLAR_CONFIG: Record<string, AssetConfig> = {
  excavator: {
    id: "PX-01",
    title: "POLAR ICE EXCAVATOR",
    group: "excavation",
    module: "excavation",
    controlLabels: {
      zDepth: "Cut depth",
      wBlade: "Cutter width",
      vCut: "Traverse speed",
      etaDrive: "Drive efficiency"
    },
    note: "Tracked ground contact, articulated cutter depth, auger speed, route cadence, and dust respond to the excavation load instead of looping as decoration.",
    metrics: (r) => [
      { label: "Icy feed", value: formatQtyText(r.production.regolithKgPerDay, "kg/day") },
      { label: "Cutting force", value: formatQtyText(r.excavation.cuttingForceN, "N") },
      { label: "Mechanical power", value: formatQtyText(r.excavation.mechPowerW, "W") },
      { label: "Fleet mass", value: formatQtyText(r.excavation.fleetMassKg, "kg") }
    ]
  },
  tents: {
    id: "SUB-01",
    title: "SUBLIMATION FIELD CAMP",
    group: "thermal",
    module: "thermal",
    controlLabels: {
      chiIce: "Feedstock ice fraction",
      Tpsr: "PSR temperature",
      Tsub: "Sublimation temperature",
      rPore: "Regolith pore radius"
    },
    note: "Three sealed extraction tents feed a shared condenser manifold; vent activity and cold-blue status lighting follow the calculated sublimation energy demand.",
    metrics: (r, p) => [
      { label: "Sublimation SEC", value: formatQtyText((r.thermal.secSub_JPerKg ?? 0) / 3.6e6, "kWh/kg") },
      { label: "Ice fraction", value: `${(p.chiIce * 100).toFixed(2)}%` },
      { label: "Conductivity", value: formatQtyText(r.thermal.conductivity_WPerMK, "W/(m·K)") },
      { label: "Knudsen diffusion", value: formatQtyText(r.thermal.knudsenD_M2PerS, "m²/s") }
    ]
  },
  receiver: {
    id: "BR-01",
    title: "BEAM RECEIVER + SABATIER PLANT",
    group: "sabatier",
    module: "sabatier",
    controlLabels: {
      Vel: "Electrolyzer voltage",
      etaFaradayEl: "Faradaic efficiency",
      fConversion: "Sabatier conversion",
      Tsabatier: "Reactor temperature"
    },
    note: "The restrained beam terminates on a serviceable absorber deck. The reactor skid and moving valve appear only when the Sabatier loop is enabled.",
    metrics: (r) => [
      { label: "Beamed floor power", value: formatQtyText(r.power.beamedFloorPowerW ?? 0, "W") },
      { label: "CH₄ output", value: formatQtyText(r.production.ch4KgPerDay, "kg/day") },
      { label: "H₂ output", value: formatQtyText(r.production.h2KgPerDay, "kg/day") },
      { label: "O₂ coproduct", value: formatQtyText(r.production.o2KgPerDay, "kg/day") }
    ]
  },
  tanks: {
    id: "PCR-01",
    title: "POLAR CRYOGENIC FARM",
    group: "cryo",
    module: "cryo",
    controlLabels: {
      reserveDays: "Reserve duration",
      Nmli: "MLI layers",
      Ttank: "Tank temperature",
      secLiquefaction: "Liquefaction SEC"
    },
    note: "Tank count follows reserve volume while fill columns, status intensity, and low-opacity vapor follow storage state and calculated boil-off.",
    metrics: (r, p) => [
      { label: "Boil-off", value: formatQtyText(r.cryo.boiloffKgPerDay, "kg/day") },
      { label: "Heat leak", value: formatQtyText(r.cryo.qLeakW, "W") },
      { label: "Cryocooler", value: formatQtyText(r.cryo.cryocoolerPowerW, "W") },
      { label: "Reserve", value: formatQtyText(p.reserveDays, "days", 1) }
    ]
  },
  towers: {
    id: "PT-01",
    title: "RIM POWER TOWERS",
    group: "power",
    module: "power",
    controlLabels: {
      thetaSun: "Solar incidence",
      etaCell: "Cell efficiency",
      thetaDivBeam: "Beam divergence",
      rReceiver: "Receiver radius"
    },
    note: "Three terrain-grounded lattice towers track the lunar cycle and feed a narrower, readable power column to the crater-floor receiver.",
    metrics: (r) => [
      { label: "Grid power", value: formatQtyText(r.energy.gridPowerW, "W") },
      { label: "Solar array", value: formatQtyText(r.power.solarArrayM2, "m²") },
      { label: "Beamed floor", value: formatQtyText(r.power.beamedFloorPowerW ?? 0, "W") },
      { label: "Architecture", value: r.power.architecture.toUpperCase() }
    ]
  },
  station: {
    id: "PN-01",
    title: "POLAR NUCLEAR STATION",
    group: "power",
    module: "power",
    controlLabels: {
      Tsource: "Hot-side temperature",
      Tsink: "Sink temperature",
      alphaSpecific: "Nuclear specific mass",
      epsRad: "Radiator emissivity"
    },
    note: "The rim reactor appears for the nuclear architecture; its radiator span scales with rejected heat and its switchgear lighting follows grid demand.",
    metrics: (r) => [
      { label: "Architecture", value: r.power.architecture.toUpperCase() },
      { label: "Grid power", value: formatQtyText(r.energy.gridPowerW, "W") },
      { label: "Nuclear mass", value: formatQtyText(r.power.nuclearMassKg, "kg") },
      { label: "Radiator area", value: formatQtyText(r.power.radiatorM2, "m²") }
    ]
  },
  habitat: {
    id: "PHAB-01",
    title: "POLAR SURFACE HABITAT",
    group: "construction",
    module: "construction",
    controlLabels: {
      shieldDesignM: "Designed shielding",
      areaHabRoof: "Habitat roof area",
      Pinternal: "Internal pressure",
      rhoSlag: "Shield material density"
    },
    note: "The pressure shell, airlock, radiator, human-scale windows, and quantized shielding sections provide a readable occupied anchor on the crater floor.",
    metrics: (r, p) => [
      { label: "Shield design", value: formatQtyText(r.construction.shieldDesignM, "m", 2) },
      { label: "Time to shield", value: formatQtyText(r.construction.daysToShieldHabitat, "days") },
      { label: "Internal pressure", value: formatQtyText(p.Pinternal, "Pa") },
      { label: "Roof area", value: formatQtyText(p.areaHabRoof, "m²") }
    ]
  }
};

export function AssetInspector(): React.JSX.Element | null {
  const selected = useStore((state) => state.ui.selectedAsset);
  const site = useStore((state) => state.params.site);
  const params = useStore((state) => state.params);
  const result = useStore((state) => state.result);
  const setUi = useStore((state) => state.setUi);
  const flyTo = useStore((state) => state.flyTo);

  const config = selected === null
    ? undefined
    : (site === "equatorial" ? EQUATORIAL_CONFIG : POLAR_CONFIG)[selected];

  if (config === undefined) {
    return null;
  }

  const controls = paramsForGroup(config.group).filter((def) => def.key in config.controlLabels);
  const warnings = result.warnings.filter((warning) => warning.module === config.module);
  const status = warnings.some((warning) => warning.severity === "alarm")
    ? "alarm"
    : warnings.length > 0
      ? "caution"
      : "nominal";

  return (
    <aside className="reactor-inspector asset-inspector" aria-label={`${config.title} inspector`}>
      <header className="reactor-inspector-head">
        <div>
          <span className="reactor-eyebrow">SELECTED ASSET · {config.id}</span>
          <h2>{config.title}</h2>
        </div>
        <button type="button" className="reactor-close" onClick={() => setUi({ selectedAsset: null })}>
          CLOSE
        </button>
      </header>

      <div className="reactor-status-row">
        <span className={`reactor-status ${status}`}>{status.toUpperCase()}</span>
        <button type="button" className="reactor-focus" onClick={() => selected !== null && flyTo(selected)}>
          FOCUS CAMERA
        </button>
      </div>

      <div className="reactor-metrics">
        {config.metrics(result, params).map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
      </div>

      <div className="reactor-state-note">
        <span className="reactor-section-title">PURPOSE + SIMULATED BEHAVIOR</span>
        <p>{config.note}</p>
      </div>

      {warnings.length > 0 && <div className={`reactor-warning ${status}`}>{warnings[0]?.message}</div>}

      {controls.length > 0 && (
        <section className="reactor-controls" aria-labelledby="asset-controls-title">
          <div id="asset-controls-title" className="reactor-section-title">
            LIVE SYSTEM INPUTS
          </div>
          <p className="reactor-control-note">
            Open <b>i</b> beside an input for its source and supported model range.
          </p>
          {controls.map((def) => {
            const warning = warnings.find((item) => item.id === "anode-current" && def.key === "jOperating");
            return (
              <ParamRow
                key={def.key}
                def={def}
                label={config.controlLabels[def.key]}
                warnSeverity={warning?.severity === "alarm" ? "alarm" : warning === undefined ? undefined : "caution"}
                warnLimit={warning?.limit}
              />
            );
          })}
        </section>
      )}
    </aside>
  );
}

function Metric({ label, value }: MetricValue): React.JSX.Element {
  return (
    <div className="reactor-metric">
      <span>{label}</span>
      <strong className="num">{value}</strong>
    </div>
  );
}
