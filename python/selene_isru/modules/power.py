from __future__ import annotations

import math
from typing import Any

from ..constants import c
from .site_profile import resolve_polar_profile


def p_crit_kw(m_shield_kg: float, beta: float, alpha: float) -> float | None:
    return None if beta <= alpha else m_shield_kg / (beta - alpha)


def p_crit_dynamic_kw(m_shield_kg: float, beta: float, alpha: float, d_solar: float, d_nuclear: float, t_years: float) -> float | None:
    denominator = beta / (1 - d_solar) ** t_years - alpha * (1 + d_nuclear * t_years)
    return None if denominator <= 0 else m_shield_kg / denominator


def site_cycle_hours(params: dict[str, Any], profile: dict[str, Any] | None = None) -> tuple[float, float]:
    if params["site"] == "equatorial":
        return c("tDay"), c("tNight")
    night_hours = params["polarLongestShadowHours"] if profile is None else profile["longestReceiverOutageHours"]
    fraction = params["polarIlluminationFraction"] if profile is None else profile["averageDeliveredFraction"]
    cycle = night_hours / (1 - fraction) if profile is None else profile["cycleHours"]
    day_hours = max(1e-6, cycle * fraction)
    return day_hours, night_hours


def beam_efficiency(w0_beam: float, theta_div_beam: float, z_crater_drop: float, r_receiver: float, eta_emitter: float, eta_pv_receiver: float) -> float:
    w_beam = w0_beam + theta_div_beam * z_crater_drop
    eta_geo = 1 - math.exp(-2 * r_receiver**2 / w_beam**2)
    return eta_emitter * eta_geo * eta_pv_receiver


def beamed_power_w(p_array_rim_w: float, w0_beam: float, theta_div_beam: float, z_crater_drop: float, r_receiver: float, eta_emitter: float, eta_pv_receiver: float) -> float:
    return p_array_rim_w * beam_efficiency(w0_beam, theta_div_beam, z_crater_drop, r_receiver, eta_emitter, eta_pv_receiver)


def simulate_power(params: dict[str, Any], grid_power_w: float, profile: dict[str, Any] | None = None) -> dict[str, Any]:
    p_grid = grid_power_w
    active_profile = resolve_polar_profile(params)["profile"] if profile is None else profile
    day_hours, night_hours = site_cycle_hours(params, active_profile)
    beam_transfer = beam_efficiency(params["w0Beam"], params["thetaDivBeam"], params["zCraterDrop"], params["rReceiver"], params["etaEmitter"], params["etaPvReceiver"]) if params["site"] == "polar" else 1
    delivery_efficiency = params["etaWire"] * beam_transfer
    p_array = p_grid / delivery_efficiency + p_grid * night_hours / (day_hours * params["etaRoundTrip"] * delivery_efficiency)
    solar_delivered_capacity_w = p_array * delivery_efficiency
    solar_denominator = c("ISOLAR") * params["etaCell"] * math.cos(params["thetaSun"]) * params["Fdegrade"]
    solar_array_m2 = p_array / max(1e-9, solar_denominator)
    e_storage_wh = p_grid * night_hours / (params["DoD"] * params["etaDischarge"])
    m_storage = e_storage_wh / params["SEstorage"]
    solar_mass_kg = params["Rarray"] * (p_array / 1000) + m_storage
    beta_solar = solar_mass_kg / (p_grid / 1000)

    eta_therm_raw = (1 - params["Tsink"] / params["Tsource"]) * params["etaMech"]
    eta_therm = max(1e-9, eta_therm_raw)
    q_fission = p_grid / eta_therm
    q_reject = q_fission - p_grid
    radiator_denominator = params["etaRad"] * params["epsRad"] * c("sigma") * (params["Tsink"] ** 4 - params["Tenv"] ** 4)
    radiator_m2 = q_reject / max(1e-9, radiator_denominator)
    nuclear_mass_kg = params["MshieldKg"] + params["alphaSpecific"] * (p_grid / 1000)
    architecture = "solar" if solar_mass_kg <= nuclear_mass_kg else "nuclear"
    selected_power_mass_kg = solar_mass_kg if architecture == "solar" else nuclear_mass_kg
    p_crit = p_crit_kw(params["MshieldKg"], beta_solar, params["alphaSpecific"])
    p_crit_dynamic = p_crit_dynamic_kw(params["MshieldKg"], beta_solar, params["alphaSpecific"], params["dSolar"], params["dNuclear"], params["missionYears"])
    warnings: list[dict[str, Any]] = []
    if p_crit is None:
        warnings.append({"id": "beta-le-alpha", "severity": "caution", "module": "power", "message": "Solar specific mass is less than or equal to nuclear specific mass.", "value": beta_solar, "limit": params["alphaSpecific"]})
    if params["Tsource"] <= params["Tsink"]:
        warnings.append({"id": "power-hot-side", "severity": "alarm", "module": "power", "message": "Fission hot-side temperature must exceed sink temperature.", "value": params["Tsource"], "limit": params["Tsink"]})
    if params["Tsink"] <= params["Tenv"]:
        warnings.append({"id": "radiator-temperature", "severity": "alarm", "module": "power", "message": "Radiator sink temperature must exceed its environment temperature.", "value": params["Tsink"], "limit": params["Tenv"]})

    beamed_floor_power_w = beamed_power_w(p_array, params["w0Beam"], params["thetaDivBeam"], params["zCraterDrop"], params["rReceiver"], params["etaEmitter"], params["etaPvReceiver"]) * params["etaWire"] if params["site"] == "polar" and architecture == "solar" else None
    beam_delivery_margin_w = None if beamed_floor_power_w is None else beamed_floor_power_w - p_grid
    if beam_delivery_margin_w is not None and beam_delivery_margin_w < -1e-6:
        warnings.append({"id": "beam-power-shortfall", "severity": "alarm", "module": "power", "message": "Delivered beamed power is below the crater-floor load.", "value": beamed_floor_power_w, "limit": p_grid})

    return {
        "architecture": architecture,
        "solarMassKg": solar_mass_kg,
        "nuclearMassKg": nuclear_mass_kg,
        "solarArrayM2": solar_array_m2,
        "radiatorM2": radiator_m2,
        "pCritW": 0 if p_crit is None else p_crit * 1000,
        "pCritDynamicW": 0 if p_crit_dynamic is None else p_crit_dynamic * 1000,
        "beamedFloorPowerW": beamed_floor_power_w,
        "beamDeliveryMarginW": beam_delivery_margin_w,
        "solarDeliveredCapacityW": solar_delivered_capacity_w,
        "siteDayHours": day_hours,
        "siteNightHours": night_hours,
        "siteProfile": active_profile,
        "selectedPowerMassKg": selected_power_mass_kg,
        "warnings": warnings,
    }
