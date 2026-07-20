from __future__ import annotations

from typing import Any

from ..constants import c


def regolith_per_kg_product(params: dict[str, Any], x_o2_effective: float | None = None) -> float:
    if params["site"] == "equatorial":
        return 1 / (x_o2_effective if x_o2_effective is not None else params["xO2"] * params["fExtract"])
    return 1 / params["chiIce"]


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
    sec_excavation_j_per_kg = params["eMining"] * regolith_per_kg
    fleet_mass_kg = params["kExcFleet"] * params["targetKgPerDay"]

    return {
        "cuttingForceN": cutting_force_n,
        "mechPowerW": mech_power_w,
        "fleetMassKg": fleet_mass_kg,
        "secExcavation_JPerKg": sec_excavation_j_per_kg,
        "regolithPerKgProduct": regolith_per_kg,
    }
