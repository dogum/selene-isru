from __future__ import annotations

import math
from typing import Any

from ..constants import c


def _properties(stream: str, params: dict[str, Any]) -> dict[str, Any]:
    values = {
        "lox": (1141, 90.2, c("dHvap_LOX"), 2.2, True),
        "water-ice": (917, 150, c("dHsub_ice"), 0.15, True),
        "liquid-water": (997, 293, 0, 0.08, False),
        "lh2": (70.8, 20.3, c("dHvap_LH2"), 12, True),
        "lch4": (422, 111.7, c("dHvap_LCH4"), 1.2, True),
        "co2-feed": (1560, 195, c("dHsub_CO2"), 0.15, True),
        "custom": (params["rhoCryo"], params["Ttank"], params["customLatentHeatJPerKg"], params["secLiquefaction"], True),
    }
    density, temperature, latent, conditioning, phase_loss = values[stream]
    return {"densityKgPerM3": density, "storageTemperatureK": temperature, "latentHeatJPerKg": latent, "conditioningSecKWhPerKg": conditioning, "phaseLossEnabled": phase_loss}


def _pending_inventory(params: dict[str, Any], demand: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    properties = _properties(demand["stream"], params)
    reserve_inventory = params["reserveDays"] * demand["rateKgPerDay"]
    volume = reserve_inventory / properties["densityKgPerM3"]
    radius = (3 * volume / (4 * math.pi)) ** (1 / 3)
    area = 4 * math.pi * radius**2
    projected_area = math.pi * radius**2
    illumination = profile["averageIllumination"] if params["site"] == "polar" else 1
    surface_temperature = profile["maximumSurfaceTemperatureK"] if params["site"] == "polar" else params["Tsurface"]
    q_solar = params["alphaTank"] * c("ISOLAR") * projected_area * illumination
    q_albedo = params["alphaTank"] * c("ISOLAR") * 0.12 * params["Fview"] * area * illumination
    q_ir = params["epsTank"] * c("sigma") * surface_temperature**4 * params["Fview"] * area
    cold = properties["storageTemperatureK"]
    q_space = params["epsTank"] * c("sigma") * (cold**4 - 3**4) * area * (1 - params["Fview"])
    q_environment = q_solar + q_albedo + q_ir - q_space
    equilibrium = (q_environment / (params["epsTank"] * c("sigma") * area)) ** 0.25 if q_environment > 0 else cold
    hot = max(equilibrium, cold)
    mean = (hot + cold) / 2
    calibrated_layer_density = params["Nlaydens"] / 10
    mli_flux = (
        params["C1mli"] * calibrated_layer_density ** params["rExp"] * mean * (hot - cold) / params["Nmli"]
        + params["C2mli"] * params["epsLayer"] * (hot**4.67 - cold**4.67) / params["Nmli"]
    )
    q_leak = max(0, mli_flux * area) + params["qStrutW"]
    conditioning_power = demand["rateKgPerDay"] / 86400 * properties["conditioningSecKWhPerKg"] * 3_600_000
    return {
        "id": demand["id"], "stream": demand["stream"], "role": demand["role"], "rateKgPerDay": demand["rateKgPerDay"],
        "reserveInventoryKg": reserve_inventory, "volumeM3": volume, "storageMassKg": params["kCryoMass"] * demand["rateKgPerDay"],
        "densityKgPerM3": properties["densityKgPerM3"], "storageTemperatureK": cold,
        "conditioningSecKWhPerKg": properties["conditioningSecKWhPerKg"], "conditioningPowerW": conditioning_power,
        "qLeakW": q_leak, "qRemovedW": 0, "qResidualW": q_leak, "unmitigatedLossKgPerDay": 0, "actualLossKgPerDay": 0,
        "latentHeatJPerKg": properties["latentHeatJPerKg"], "phaseLossEnabled": properties["phaseLossEnabled"], "areaM2": area,
        "mliFluxWPerM2": mli_flux, "hotSideTemperatureK": hot,
    }


def simulate_cryo(params: dict[str, Any], demands: list[dict[str, Any]], profile: dict[str, Any]) -> dict[str, Any]:
    active = [demand for demand in demands if demand["rateKgPerDay"] > 1e-12]
    fallback = {"id": "primary-product", "stream": "lox" if params["site"] == "equatorial" else "water-ice", "role": "product", "rateKgPerDay": params["targetKgPerDay"]}
    pending = [_pending_inventory(params, demand, profile) for demand in (active or [fallback])]
    total_leak = sum(item["qLeakW"] for item in pending)
    if params["cryoControlMode"] == "passive":
        removal_budget = 0
    elif params["cryoControlMode"] == "capacity-limited":
        removal_budget = min(total_leak, params["coolerCapacityW"])
    else:
        removal_budget = total_leak
    cryocooler_power = 0.0
    for item in pending:
        item["qRemovedW"] = removal_budget * item["qLeakW"] / total_leak if total_leak > 0 else 0
        item["qResidualW"] = max(0, item["qLeakW"] - item["qRemovedW"])
        loss_factor = 86400 / item["latentHeatJPerKg"] if item["phaseLossEnabled"] else 0
        item["unmitigatedLossKgPerDay"] = item["qLeakW"] * loss_factor
        item["actualLossKgPerDay"] = item["qResidualW"] * loss_factor
        if item["qRemovedW"] > 0 and item["hotSideTemperatureK"] > item["storageTemperatureK"]:
            cryocooler_power += item["qRemovedW"] * (item["hotSideTemperatureK"] - item["storageTemperatureK"]) / (params["eta2ndLaw"] * item["storageTemperatureK"])
    public_keys = ("id", "stream", "role", "rateKgPerDay", "reserveInventoryKg", "volumeM3", "storageMassKg", "densityKgPerM3", "storageTemperatureK", "conditioningSecKWhPerKg", "conditioningPowerW", "qLeakW", "qRemovedW", "qResidualW", "unmitigatedLossKgPerDay", "actualLossKgPerDay")
    inventories = [{key: item[key] for key in public_keys} for item in pending]
    primary = pending[0]
    q_removed = sum(item["qRemovedW"] for item in pending)
    q_residual = sum(item["qResidualW"] for item in pending)
    unmitigated_loss = sum(item["unmitigatedLossKgPerDay"] for item in pending)
    actual_loss = sum(item["actualLossKgPerDay"] for item in pending)
    cryo_mass = sum(item["storageMassKg"] for item in pending)
    total_volume = sum(item["volumeM3"] for item in pending)
    total_conditioning_power = sum(item["conditioningPowerW"] for item in pending)
    total_area = sum(item["areaM2"] for item in pending)
    warnings: list[dict[str, Any]] = []
    if params["cryoControlMode"] == "capacity-limited" and q_residual > 1e-9:
        warnings.append({"id": "cryo-capacity-shortfall", "severity": "caution", "module": "storage", "message": "Shared cryocooler capacity is below the multi-inventory heat leak; residual phase loss remains.", "value": q_removed, "limit": total_leak})
    return {
        "stream": primary["stream"], "controlMode": params["cryoControlMode"], "densityKgPerM3": primary["densityKgPerM3"],
        "storageTemperatureK": primary["storageTemperatureK"], "latentHeatJPerKg": primary["latentHeatJPerKg"],
        "conditioningSecKWhPerKg": total_conditioning_power * 86400 / (params["targetKgPerDay"] * 3_600_000), "phaseLossEnabled": primary["phaseLossEnabled"],
        "qLeakW": total_leak, "qRemovedW": q_removed, "qResidualW": q_residual, "unmitigatedBoiloffKgPerDay": unmitigated_loss,
        "boiloffKgPerDay": actual_loss, "cryocoolerPowerW": cryocooler_power,
        "mliFlux_WPerM2": sum(item["mliFluxWPerM2"] * item["areaM2"] for item in pending) / total_area if total_area > 0 else 0,
        "cryoMassKg": cryo_mass, "totalReserveVolumeM3": total_volume, "totalConditioningPowerW": total_conditioning_power,
        "inventories": inventories, "warnings": warnings,
    }
