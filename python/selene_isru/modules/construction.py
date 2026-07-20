from __future__ import annotations

import math
from typing import Any

from ..constants import c


def shield_full_balance_m(p_internal: float, rho_slag: float) -> float:
    return p_internal / (rho_slag * c("gL"))


def simulate_construction(params: dict[str, Any], slag_kg_per_day: float) -> dict[str, Any]:
    shield_full = shield_full_balance_m(params["Pinternal"], params["rhoSlag"])
    max_safe_cooling_delta_k = params["sigmaTensile"] * (1 - params["nu"]) / (params["Eslag"] * params["alphaCte"])
    pad_shear_pa = 0.5 * params["rhoGasPlume"] * params["vGasPlume"] ** 2 * params["Cf"]
    pad_joint_utilization = pad_shear_pa / (params["tauAllowable"] / params["FS"])
    pad_mass_kg = math.pi / 4 * params["dPad"] ** 2 * params["tPad"] * params["rhoSlag"]
    pads_per_year = slag_kg_per_day * 365 / pad_mass_kg if slag_kg_per_day > 0 else 0
    hab_shield_mass = params["areaHabRoof"] * params["shieldDesignM"] * params["rhoSlag"]
    days_to_shield_habitat = hab_shield_mass / slag_kg_per_day if slag_kg_per_day > 0 else 0
    warnings: list[dict[str, Any]] = []

    if params["castDeltaT"] > max_safe_cooling_delta_k:
        warnings.append(
            {
                "id": "thermal-stress",
                "severity": "alarm",
                "module": "construction",
                "message": "Slag casting cooling delta exceeds the thermal stress limit.",
                "value": params["castDeltaT"],
                "limit": max_safe_cooling_delta_k,
            }
        )

    if pad_joint_utilization > 1:
        warnings.append(
            {
                "id": "pad-shear",
                "severity": "alarm",
                "module": "construction",
                "message": "Landing pad joint shear utilization exceeds unity.",
                "value": pad_joint_utilization,
                "limit": 1,
            }
        )

    return {
        "slagPerYearT": slag_kg_per_day * 365 / 1000,
        "shieldFullBalanceM": shield_full,
        "shieldDesignM": params["shieldDesignM"],
        "maxSafeCoolingDeltaK": max_safe_cooling_delta_k,
        "padShearPa": pad_shear_pa,
        "padJointUtilization": pad_joint_utilization,
        "padsPerYear": pads_per_year,
        "daysToShieldHabitat": days_to_shield_habitat,
        "warnings": warnings,
    }
