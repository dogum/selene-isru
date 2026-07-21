from __future__ import annotations

import math
from typing import Any

from ..constants import c


def sabatier_kp(temp: float) -> float:
    d_h = c("dH_sabatier")
    d_s = c("dS_sabatier")
    return math.exp(-(d_h - temp * d_s) / (c("R") * temp))


def simulate_sabatier(params: dict[str, Any], water_kg_per_day: float) -> dict[str, float]:
    sec_water_electrolysis_j_per_kg = params["Vel"] * 2 * c("F") / (c("M_H2O") * params["etaFaradayEl"])
    gross_h2_kg_per_day = water_kg_per_day * (c("M_H2") / c("M_H2O"))
    o2_kg_per_day = water_kg_per_day * ((c("M_O2") / 2) / c("M_H2O"))
    h2_consumed_kg_per_day = gross_h2_kg_per_day * params["fConversion"]
    h2_unreacted_kg_per_day = gross_h2_kg_per_day - h2_consumed_kg_per_day
    co2_imported_kg_per_day = h2_consumed_kg_per_day * c("M_CO2") / (4 * c("M_H2"))
    ch4_kg_per_day = h2_consumed_kg_per_day * c("M_CH4") / (4 * c("M_H2"))
    water_recycle_kg_per_day = h2_consumed_kg_per_day * (2 * c("M_H2O")) / (4 * c("M_H2"))
    mdot_ch4_mol_per_s = (ch4_kg_per_day / 86400) / c("M_CH4")
    q_sabatier_w = mdot_ch4_mol_per_s * abs(c("dH_sabatier"))

    return {
        "secWaterElectrolysis_JPerKg": sec_water_electrolysis_j_per_kg,
        "grossH2KgPerDay": gross_h2_kg_per_day,
        "h2ConsumedKgPerDay": h2_consumed_kg_per_day,
        "h2UnreactedKgPerDay": h2_unreacted_kg_per_day,
        "o2KgPerDay": o2_kg_per_day,
        "co2ImportedKgPerDay": co2_imported_kg_per_day,
        "ch4KgPerDay": ch4_kg_per_day,
        "waterRecycleKgPerDay": water_recycle_kg_per_day,
        "qSabatierW": q_sabatier_w,
        "kp": sabatier_kp(params["Tsabatier"]),
    }
