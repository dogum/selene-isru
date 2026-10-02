from __future__ import annotations

import math
from typing import Any

from ..constants import c


def sec_sub_j_per_kg(chi_ice: float, cp_reg_cold: float, tpsr: float, tsub: float) -> float:
    """Thermodynamic minimum per kg of mobilized water [J/kg]."""
    return (1 / chi_ice) * cp_reg_cold * (tsub - tpsr) + c("dHsub_ice")


def sec_sub_delivered_j_per_kg(params: dict[str, Any]) -> float:
    """Heat delivered to the feed per kg of captured water [J/kg]."""
    return sec_sub_j_per_kg(params["chiIce"], params["cpRegCold"], params["Tpsr"], params["Tsub"]) / params["etaIceCapture"]


def simulate_thermal(params: dict[str, Any]) -> dict[str, float | None]:
    temp = params["Tsub"] if params["site"] == "polar" else c("TrefRegolith")
    conductivity_w_per_mk = params["kc"] + params["kr"] * temp**3
    knudsen_d_m2_per_s = (2 / 3) * params["rPore"] * math.sqrt((8 * c("R") * temp) / (math.pi * c("M_H2O")))

    polar = params["site"] == "polar"
    delivered = sec_sub_delivered_j_per_kg(params) if polar else None
    regolith_kg_per_day = params["targetKgPerDay"] / (params["chiIce"] * params["etaIceCapture"]) if polar else 0

    return {
        "secSub_JPerKg": delivered,
        "heaterLoss_JPerKg": None if delivered is None else delivered * (1 / params["etaSubHeater"] - 1),
        "extractorMassKg": params["kIceExtractorMass"] * regolith_kg_per_day,
        "knudsenD_M2PerS": knudsen_d_m2_per_s,
        "conductivity_WPerMK": conductivity_w_per_mk,
    }
