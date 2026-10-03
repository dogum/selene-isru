import type { MaterialFlow, ProcessBalance, SimParams } from "../types";

interface ProductionLedger {
  regolithKgPerDay: number;
  slagKgPerDay: number;
  o2KgPerDay: number;
  waterKgPerDay: number;
  grossH2KgPerDay: number;
  h2KgPerDay: number;
  co2ImportedKgPerDay: number;
  ch4KgPerDay: number;
  waterRecycleKgPerDay: number;
}

export interface MaterialLedger {
  flows: MaterialFlow[];
  balances: ProcessBalance[];
  maxAbsResidualKgPerDay: number;
}

function balance(id: string, label: string, massInKgPerDay: number, massOutKgPerDay: number): ProcessBalance {
  const rawResidual = massInKgPerDay - massOutKgPerDay;
  return {
    id,
    label,
    massInKgPerDay,
    massOutKgPerDay,
    residualKgPerDay: Math.abs(rawResidual) < 1e-9 ? 0 : rawResidual
  };
}

export function materialLedger(params: SimParams, production: ProductionLedger): MaterialLedger {
  const flows: MaterialFlow[] = [];
  const balances: ProcessBalance[] = [];

  if (params.site === "equatorial") {
    flows.push(
      { material: "regolith", from: "terrain", to: "mre", kgPerDay: production.regolithKgPerDay },
      { material: "oxygen", from: "mre", to: "product-storage", kgPerDay: production.o2KgPerDay },
      { material: "deoxygenated-regolith", from: "mre", to: "construction", kgPerDay: production.slagKgPerDay }
    );
    balances.push(
      balance(
        "mre-separation",
        "MRE aggregate material split",
        production.regolithKgPerDay,
        production.o2KgPerDay + production.slagKgPerDay
      )
    );
  } else {
    // Mobilized ice that escapes capture leaves as vapor; the rest of the
    // feed is dry tailings.
    const mobilizedWaterKgPerDay = production.regolithKgPerDay * params.chiIce;
    const vaporLossKgPerDay = mobilizedWaterKgPerDay - production.waterKgPerDay;
    const dryTailingsKgPerDay = production.regolithKgPerDay - mobilizedWaterKgPerDay;
    flows.push(
      { material: "icy-regolith", from: "terrain", to: "sublimation", kgPerDay: production.regolithKgPerDay },
      { material: "water", from: "sublimation", to: production.grossH2KgPerDay > 0 ? "electrolysis" : "product-storage", kgPerDay: production.waterKgPerDay },
      { material: "water-vapor", from: "sublimation", to: "uncaptured-loss", kgPerDay: vaporLossKgPerDay },
      { material: "dry-tailings", from: "sublimation", to: "tailings", kgPerDay: dryTailingsKgPerDay }
    );
    balances.push(
      balance(
        "polar-extraction",
        "Polar water extraction",
        production.regolithKgPerDay,
        production.waterKgPerDay + vaporLossKgPerDay + dryTailingsKgPerDay
      )
    );

    if (!params.enableSabatier && production.grossH2KgPerDay > 0) {
      // Propellant mode: every kilogram of water becomes stored O2 and H2.
      flows.push(
        { material: "oxygen", from: "electrolysis", to: "product-storage", kgPerDay: production.o2KgPerDay },
        { material: "hydrogen", from: "electrolysis", to: "product-storage", kgPerDay: production.h2KgPerDay }
      );
      balances.push(
        balance("water-electrolysis", "Water electrolysis", production.waterKgPerDay, production.o2KgPerDay + production.h2KgPerDay)
      );
    }

    if (params.enableSabatier) {
      const h2ConsumedKgPerDay = production.grossH2KgPerDay - production.h2KgPerDay;
      flows.push(
        { material: "oxygen", from: "electrolysis", to: "product-storage", kgPerDay: production.o2KgPerDay },
        { material: "hydrogen", from: "electrolysis", to: "sabatier", kgPerDay: h2ConsumedKgPerDay },
        { material: "hydrogen", from: "electrolysis", to: "product-storage", kgPerDay: production.h2KgPerDay },
        { material: "carbon-dioxide", from: "imported-feed", to: "sabatier", kgPerDay: production.co2ImportedKgPerDay },
        { material: "methane", from: "sabatier", to: "product-storage", kgPerDay: production.ch4KgPerDay },
        { material: "water", from: "sabatier", to: "recycle", kgPerDay: production.waterRecycleKgPerDay }
      );
      balances.push(
        balance(
          "water-electrolysis",
          "Water electrolysis",
          production.waterKgPerDay,
          production.o2KgPerDay + production.grossH2KgPerDay
        ),
        balance(
          "sabatier",
          "Sabatier conversion",
          h2ConsumedKgPerDay + production.co2ImportedKgPerDay,
          production.ch4KgPerDay + production.waterRecycleKgPerDay
        )
      );
    }
  }

  return {
    flows,
    balances,
    maxAbsResidualKgPerDay: balances.reduce(
      (maximum, item) => Math.max(maximum, Math.abs(item.residualKgPerDay)),
      0
    )
  };
}
