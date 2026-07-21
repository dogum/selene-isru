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
    const dryTailingsKgPerDay = production.regolithKgPerDay - production.waterKgPerDay;
    flows.push(
      { material: "icy-regolith", from: "terrain", to: "sublimation", kgPerDay: production.regolithKgPerDay },
      { material: "water", from: "sublimation", to: params.enableSabatier ? "electrolysis" : "product-storage", kgPerDay: production.waterKgPerDay },
      { material: "dry-tailings", from: "sublimation", to: "tailings", kgPerDay: dryTailingsKgPerDay }
    );
    balances.push(
      balance(
        "polar-extraction",
        "Polar water extraction",
        production.regolithKgPerDay,
        production.waterKgPerDay + dryTailingsKgPerDay
      )
    );

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
