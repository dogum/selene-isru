from __future__ import annotations

import math
from typing import Any

from ..constants import c


def p_crit_kw(m_shield_kg: float, beta: float, alpha: float) -> float | None:
    if beta <= alpha:
        return None
    return m_shield_kg / (beta - alpha)


def p_crit_dynamic_kw(
    m_shield_kg: float,
    beta: float,
    alpha: float,
    d_solar: float,
    d_nuclear: float,
    t_years: float,
) -> float | None:
    denominator = beta / (1 - d_solar) ** t_years - alpha * (1 + d_nuclear * t_years)
    if denominator <= 0:
        return None
    return m_shield_kg / denominator


def beamed_power_w(
    p_array_rim_w: float,
    w0_beam: float,
    theta_div_beam: float,
    z_crater_drop: float,
    r_receiver: float,
    eta_emitter: float,
    eta_pv_receiver: float,
) -> float:
    w_beam = w0_beam + theta_div_beam * z_crater_drop
    eta_geo = 1 - math.exp(-2 * r_receiver**2 / w_beam**2)
    return p_array_rim_w * eta_emitter * eta_geo * eta_pv_receiver


def simulate_power(params: dict[str, Any], grid_power_w: float) -> dict[str, Any]:
    p_grid = grid_power_w
    p_array = p_grid / params["etaWire"] + p_grid * c("tNight") / (c("tDay") * params["etaRoundTrip"])
    solar_denominator = c("ISOLAR") * params["etaCell"] * math.cos(params["thetaSun"]) * params["Fdegrade"]
    solar_array_m2 = p_array / solar_denominator
    e_storage_wh = p_grid * c("tNight") / (params["DoD"] * params["etaDischarge"])
    m_storage = e_storage_wh / params["SEstorage"]
    solar_mass_kg = params["Rarray"] * (p_array / 1000) + m_storage
    beta_solar = solar_mass_kg / (p_grid / 1000)

    eta_therm = (1 - params["Tsink"] / params["Tsource"]) * params["etaMech"]
    q_fission = p_grid / eta_therm
    q_reject = q_fission - p_grid
    radiator_m2 = q_reject / (
        params["etaRad"] * params["epsRad"] * c("sigma") * (params["Tsink"] ** 4 - params["Tenv"] ** 4)
    )
    nuclear_mass_kg = params["MshieldKg"] + params["alphaSpecific"] * (p_grid / 1000)
    architecture = "solar" if solar_mass_kg <= nuclear_mass_kg else "nuclear"
    selected_power_mass_kg = solar_mass_kg if architecture == "solar" else nuclear_mass_kg
    p_crit = p_crit_kw(params["MshieldKg"], beta_solar, params["alphaSpecific"])
    p_crit_dynamic = p_crit_dynamic_kw(
        params["MshieldKg"],
        beta_solar,
        params["alphaSpecific"],
        params["dSolar"],
        params["dNuclear"],
        params["missionYears"],
    )
    warnings: list[dict[str, Any]] = []

    if p_crit is None:
        warnings.append(
            {
                "id": "beta-le-alpha",
                "severity": "caution",
                "module": "power",
                "message": "Solar specific mass is less than or equal to nuclear specific mass.",
                "value": beta_solar,
                "limit": params["alphaSpecific"],
            }
        )

    beamed_floor_power_w = (
        beamed_power_w(
            p_array,
            params["w0Beam"],
            params["thetaDivBeam"],
            params["zCraterDrop"],
            params["rReceiver"],
            params["etaEmitter"],
            params["etaPvReceiver"],
        )
        if params["site"] == "polar"
        else None
    )

    return {
        "architecture": architecture,
        "solarMassKg": solar_mass_kg,
        "nuclearMassKg": nuclear_mass_kg,
        "solarArrayM2": solar_array_m2,
        "radiatorM2": radiator_m2,
        "pCritW": 0 if p_crit is None else p_crit * 1000,
        "pCritDynamicW": 0 if p_crit_dynamic is None else p_crit_dynamic * 1000,
        "beamedFloorPowerW": beamed_floor_power_w,
        "selectedPowerMassKg": selected_power_mass_kg,
        "warnings": warnings,
    }
