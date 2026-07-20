from __future__ import annotations

import math
from typing import Any

from ..constants import c


def sec_sub_j_per_kg(chi_ice: float, cp_reg_cold: float, tpsr: float, tsub: float) -> float:
    return (1 / chi_ice) * cp_reg_cold * (tsub - tpsr) + c("dHsub_ice")


def simulate_thermal(params: dict[str, Any]) -> dict[str, float | None]:
    temp = params["Tsub"] if params["site"] == "polar" else 300
    conductivity_w_per_mk = params["kc"] + params["kr"] * temp**3
    knudsen_d_m2_per_s = (2 / 3) * params["rPore"] * math.sqrt((8 * c("R") * temp) / (math.pi * c("M_H2O")))

    return {
        "secSub_JPerKg": (
            sec_sub_j_per_kg(params["chiIce"], params["cpRegCold"], params["Tpsr"], params["Tsub"])
            if params["site"] == "polar"
            else None
        ),
        "knudsenD_M2PerS": knudsen_d_m2_per_s,
        "conductivity_WPerMK": conductivity_w_per_mk,
    }
