from __future__ import annotations

from typing import Any

from ..constants import c
from .ilmenite import ilmenite_soil_per_kg_o2, reduces_ilmenite


def regolith_per_kg_product(params: dict[str, Any], x_o2_effective: float | None = None) -> float:
    if reduces_ilmenite(params):
        return ilmenite_soil_per_kg_o2(params)
    if params["site"] == "equatorial":
        return 1 / (x_o2_effective if x_o2_effective is not None else params["xO2"] * params["fExtract"])
    # Only the captured share of the mobilized ice becomes product water.
    return 1 / (params["chiIce"] * params["etaIceCapture"])


def simulate_excavation(params: dict[str, Any], x_o2_effective: float | None = None) -> dict[str, float]:
    g_l = c("gL")
    q = params["rhoReg"] * g_l * params["zDepth"]
    cutting_force_n = (
        params["c"] * params["Nc"]
        + q * params["Nq"]
        + 0.5 * params["rhoReg"] * g_l * params["wBlade"] * params["dBlade"] * params["Ngamma"]
    ) * params["wBlade"] * params["dBlade"]
    mech_power_w = cutting_force_n * params["vCut"] / params["etaDrive"]
    regolith_per_kg = regolith_per_kg_product(params, x_o2_effective)
    # Every plant's mining energy and fleet scale with the soil it moves. The
    # polar pit mine also strips dry overburden to reach the icy regolith.
    overburden_per_kg = params["overburdenRatio"] * regolith_per_kg if params["site"] == "polar" else 0
    soil_moved_per_kg = regolith_per_kg + overburden_per_kg
    soil_moved_kg_per_day = params["targetKgPerDay"] * soil_moved_per_kg

    return {
        "cuttingForceN": cutting_force_n,
        "mechPowerW": mech_power_w,
        "fleetMassKg": params["kMiningMass"] * soil_moved_kg_per_day,
        "secExcavation_JPerKg": params["eMining"] * soil_moved_per_kg,
        "regolithPerKgProduct": regolith_per_kg,
        "soilMovedPerKgProduct": soil_moved_per_kg,
        "soilMovedKgPerDay": soil_moved_kg_per_day,
        "overburdenKgPerDay": params["targetKgPerDay"] * overburden_per_kg,
    }
