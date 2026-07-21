from __future__ import annotations

import math
from typing import Any

from ..constants import c


def payload_per_mission_kg(params: dict[str, Any]) -> float:
    return params["M0leo"] * math.exp(-params["dvTotal"] / (params["IspLander"] * c("g0"))) - params["MdryLander"] - params["MresidProp"]


def simulate_logistics(
    params: dict[str, Any],
    fleet_mass_kg: float,
    reactor_mass_kg: float,
    power_mass_kg: float,
    cryo_mass_kg: float,
) -> dict[str, Any]:
    payload = payload_per_mission_kg(params)
    total_infra_mass_kg = fleet_mass_kg + reactor_mass_kg + power_mass_kg + cryo_mass_kg
    capacity = params["etaPack"] * payload
    n_missions = max(0, math.ceil(total_infra_mass_kg / capacity)) if capacity > 0 else 0
    plant_mass_throughput_days = total_infra_mass_kg / params["targetKgPerDay"]
    annual_product_kg = params["targetKgPerDay"] * 365
    leverage_l = annual_product_kg * params["missionYears"] * params["gearRatio"] / total_infra_mass_kg if total_infra_mass_kg != 0 else 0
    manifest = [
        {"subsystem": "excavation fleet", "massKg": fleet_mass_kg},
        {"subsystem": "reactor/plant", "massKg": reactor_mass_kg},
        {"subsystem": "power system", "massKg": power_mass_kg},
        {"subsystem": "cryo block", "massKg": cryo_mass_kg},
    ]

    return {
        "payloadPerMissionKg": payload,
        "totalInfraMassKg": total_infra_mass_kg,
        "nMissions": n_missions,
        "leverageL": leverage_l,
        "plantMassThroughputDays": plant_mass_throughput_days,
        "manifest": manifest,
    }
