from __future__ import annotations

import math
from typing import Any

from ..constants import c

DAYS_PER_YEAR = 365
# Sorties drawn on the stores; enough to show the pattern settle.
MIN_HORIZON_DAYS = 2 * DAYS_PER_YEAR
HORIZON_SORTIES = 3


def sortie_propellant_kg(params: dict[str, Any]) -> dict[str, float]:
    """Ideal rocket equation, two legs, all propellant loaded on the surface."""
    exhaust_velocity = params["IspReusable"] * c("g0")
    descent_kg = (params["MdryReusable"] + params["McargoDown"]) * (math.exp(params["dvDescent"] / exhaust_velocity) - 1)
    ascent_kg = (params["MdryReusable"] + params["McargoUp"] + descent_kg) * (
        math.exp(params["dvAscent"] / exhaust_velocity) - 1
    )
    total_kg = descent_kg + ascent_kg
    return {
        "descentKg": descent_kg,
        "ascentKg": ascent_kg,
        "totalKg": total_kg,
        "oxidizerKg": total_kg * params["mixtureRatio"] / (1 + params["mixtureRatio"]),
        "fuelKg": total_kg / (1 + params["mixtureRatio"]),
    }


def simulate_refuel(
    params: dict[str, Any], sortie: dict[str, float], supply: dict[str, float]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    demand_o2 = sortie["oxidizerKg"] * params["sortiesPerYear"] / DAYS_PER_YEAR
    demand_fuel = sortie["fuelKg"] * params["sortiesPerYear"] / DAYS_PER_YEAR
    available_o2 = supply["o2KgPerDay"] * params["plantAvailability"]
    available_h2 = supply["h2KgPerDay"] * params["plantAvailability"]
    # Each component is used up to its own demand; Earth makes up either shortfall.
    isru_o2 = min(available_o2, demand_o2)
    isru_fuel = min(available_h2, demand_fuel)
    used = isru_o2 + isru_fuel
    demand = demand_o2 + demand_fuel

    warnings: list[dict[str, Any]] = []
    if sortie["totalKg"] > params["MtankReusable"]:
        warnings.append(
            {
                "id": "refuel-tank-exceeded",
                "severity": "caution",
                "module": "refuel",
                "message": "A sortie needs more propellant than the reusable lander's tanks hold; the demand assumes the load fits.",
                "value": sortie["totalKg"],
                "limit": params["MtankReusable"],
            }
        )

    refuel = {
        "descentPropellantKg": sortie["descentKg"],
        "ascentPropellantKg": sortie["ascentKg"],
        "propellantPerSortieKg": sortie["totalKg"],
        "oxidizerPerSortieKg": sortie["oxidizerKg"],
        "fuelPerSortieKg": sortie["fuelKg"],
        "demandO2KgPerDay": demand_o2,
        "demandFuelKgPerDay": demand_fuel,
        "supplyO2KgPerDay": available_o2,
        "supplyH2KgPerDay": available_h2,
        "isruO2KgPerDay": isru_o2,
        "isruFuelKgPerDay": isru_fuel,
        "isruShare": used / demand if demand > 0 else 0,
        "earthPropellantKgPerYear": (demand - used) * DAYS_PER_YEAR,
        "surplusKgPerDay": available_o2 + available_h2 - used,
        "oxidizerSortiesPerYear": available_o2 * DAYS_PER_YEAR / sortie["oxidizerKg"] if sortie["oxidizerKg"] > 0 else 0,
        "fuelSortiesPerYear": available_h2 * DAYS_PER_YEAR / sortie["fuelKg"] if sortie["fuelKg"] > 0 else 0,
        "usedKgPerDay": used,
        "sortieIntervalDays": DAYS_PER_YEAR / params["sortiesPerYear"],
    }
    return refuel, warnings


def refuel_timeline(params: dict[str, Any], result: dict[str, Any]) -> list[dict[str, Any]]:
    """Tank drawdown from production start; mirrors `refuelTimeline`."""
    refuel = result["refuel"]
    if refuel is None:
        return []
    campaign = result["campaign"]

    loads = [refuel["oxidizerPerSortieKg"], refuel["fuelPerSortieKg"]]
    rates = [refuel["supplyO2KgPerDay"], refuel["supplyH2KgPerDay"]]
    capacities = _store_capacities_kg(params, result, loads, rates)
    interval = refuel["sortieIntervalDays"]
    operating_days = campaign["campaignEndDay"] - campaign["firstProductDay"]
    horizon = min(operating_days, max(MIN_HORIZON_DAYS, HORIZON_SORTIES * interval))
    sorties = math.floor(horizon / interval + 1e-9)
    stores = [
        {"rate": rate, "load": load, "capacity": capacity, "level": 0.0}
        for rate, load, capacity in zip(rates, loads, capacities, strict=True)
    ]
    points: list[dict[str, Any]] = []

    def add(t: float, levels: list[float], event: str) -> None:
        points.append({"tDays": campaign["firstProductDay"] + t, "o2Kg": levels[0], "h2Kg": levels[1], "event": event})

    add(0, [0, 0], "production start")
    for k in range(sorties + 1):
        start = k * interval
        end = min((k + 1) * interval, horizon)
        if end <= start:
            break
        # A store that fills before the next sortie levels off there.
        fills = sorted(
            t
            for t in (
                start + (store["capacity"] - store["level"]) / store["rate"]
                if store["rate"] > 0 and store["level"] < store["capacity"]
                else math.inf
                for store in stores
            )
            if t < end - 1e-9
        )
        for t in fills:
            add(t, [min(s["capacity"], s["level"] + s["rate"] * (t - start)) for s in stores], "store full")
        for store in stores:
            store["level"] = min(store["capacity"], store["level"] + store["rate"] * (end - start))
        if end < (k + 1) * interval:
            add(end, [s["level"] for s in stores], "")
            break
        add(end, [s["level"] for s in stores], f"before sortie {k + 1}")
        for store in stores:
            store["level"] -= min(store["level"], store["load"])
        add(end, [s["level"] for s in stores], f"sortie {k + 1}")
    return points


def _store_capacities_kg(
    params: dict[str, Any], result: dict[str, Any], loads: list[float], rates: list[float]
) -> list[float]:
    """Oxygen and hydrogen store capacity; mirrors `storeCapacitiesKg`."""
    inventories = result["cryo"]["inventories"]
    if params["storageStream"] == "auto":
        capacities = []
        for stream, load in zip(("lox", "lh2"), loads, strict=True):
            store = next((i for i in inventories if i["role"] == "product" and i["stream"] == stream), None)
            capacities.append(max(load, 0 if store is None else store["reserveInventoryKg"]))
        return capacities
    shared_kg = sum(i["reserveInventoryKg"] for i in inventories if i["role"] in ("product", "custom"))
    made_load_kg = sum(load for load, rate in zip(loads, rates, strict=True) if rate > 0)
    return [
        max(load, shared_kg * load / made_load_kg) if rate > 0 and made_load_kg > 0 else load
        for load, rate in zip(loads, rates, strict=True)
    ]
