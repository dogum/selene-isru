from __future__ import annotations

import math
import sys
from typing import Any

from .constants import c
from .modules.construction import simulate_construction
from .modules.cryo import simulate_cryo
from .modules.electrolysis import simulate_electrolysis
from .modules.excavation import simulate_excavation
from .modules.logistics import simulate_logistics
from .modules.power import simulate_power
from .modules.sabatier import simulate_sabatier
from .modules.thermal import simulate_thermal
from .normalize import normalize_params

J_PER_KWH = 3_600_000
SECONDS_PER_DAY = 86_400
U64_MASK = (1 << 64) - 1
DOUBLE_UNIT = 9_007_199_254_740_992


def simulate(input_params: dict[str, Any] | None = None) -> dict[str, Any]:
    params, param_warnings = normalize_params(input_params)
    electrolysis = simulate_electrolysis(params)
    excavation = simulate_excavation(params, electrolysis["xO2Effective"])
    thermal = simulate_thermal(params)
    cryo = simulate_cryo(params)
    sabatier = simulate_sabatier(params, params["targetKgPerDay"]) if params["site"] == "polar" and params["enableSabatier"] else None

    production = _production_state(params, excavation["regolithPerKgProduct"], sabatier)
    energy_lines = _energy_line_items(
        params,
        excavation["secExcavation_JPerKg"],
        electrolysis,
        thermal["secSub_JPerKg"],
        cryo["cryocoolerPowerW"],
        sabatier,
    )
    flows = [{"from": line["from"], "to": line["to"], "kWhPerKg": line["jPerKg"] / J_PER_KWH} for line in energy_lines]
    sec_total_j_per_kg = sum(line["jPerKg"] for line in energy_lines)
    sec_total_kwh_per_kg = sec_total_j_per_kg / J_PER_KWH
    grid_power_w = params["targetKgPerDay"] / SECONDS_PER_DAY * sec_total_j_per_kg
    power = simulate_power(params, grid_power_w)
    reactor_mass_kg = params["kReactorMass"] * params["targetKgPerDay"] if params["site"] == "equatorial" or params["enableSabatier"] else 0
    logistics = simulate_logistics(
        params,
        excavation["fleetMassKg"],
        reactor_mass_kg,
        power["selectedPowerMassKg"],
        cryo["cryoMassKg"],
    )
    construction = simulate_construction(params, production["slagKgPerDay"] if params["site"] == "equatorial" else 0)
    warnings = [
        *param_warnings,
        *(electrolysis["warnings"] if params["site"] == "equatorial" else []),
        *power["warnings"],
        *(construction["warnings"] if params["site"] == "equatorial" else []),
    ]

    return {
        "site": params["site"],
        "production": production,
        "energy": {
            "secTotal_kWhPerKg": sec_total_kwh_per_kg,
            "flows": flows,
            "gridPowerW": grid_power_w,
        },
        "excavation": {
            "cuttingForceN": excavation["cuttingForceN"],
            "mechPowerW": excavation["mechPowerW"],
            "fleetMassKg": excavation["fleetMassKg"],
        },
        "electrolysis": {
            "secElec_JPerKg": electrolysis["secElec_JPerKg"] if params["site"] == "equatorial" else 0,
            "secThermal_JPerKg": electrolysis["secThermal_JPerKg"] if params["site"] == "equatorial" else 0,
            "currentA": electrolysis["currentA"] if params["site"] == "equatorial" else 0,
            "cellVoltageV": params["Vcell"],
            "jLimit_APerM2": electrolysis["jLimit_APerM2"],
            "jOperating_APerM2": params["jOperating"],
            "meltViscosityPaS": electrolysis["meltViscosityPaS"],
            "drainVelocityMPerS": electrolysis["drainVelocityMPerS"],
            "xO2Effective": electrolysis["xO2Effective"],
            "oxideYield": electrolysis["oxideYield"],
        },
        "thermal": thermal,
        "cryo": {
            "qLeakW": cryo["qLeakW"],
            "boiloffKgPerDay": cryo["boiloffKgPerDay"],
            "cryocoolerPowerW": cryo["cryocoolerPowerW"],
            "mliFlux_WPerM2": cryo["mliFlux_WPerM2"],
        },
        "power": {
            "architecture": power["architecture"],
            "solarMassKg": power["solarMassKg"],
            "nuclearMassKg": power["nuclearMassKg"],
            "solarArrayM2": power["solarArrayM2"],
            "radiatorM2": power["radiatorM2"],
            "pCritW": power["pCritW"],
            "pCritDynamicW": power["pCritDynamicW"],
            "beamedFloorPowerW": power["beamedFloorPowerW"],
        },
        "logistics": logistics,
        "construction": construction,
        "warnings": warnings,
    }


def _production_state(params: dict[str, Any], regolith_per_kg_product: float, sabatier: dict[str, float] | None) -> dict[str, float]:
    regolith_kg_per_day = params["targetKgPerDay"] * regolith_per_kg_product
    if params["site"] == "equatorial":
        return {
            "targetKgPerDay": params["targetKgPerDay"],
            "regolithKgPerDay": regolith_kg_per_day,
            "slagKgPerDay": regolith_kg_per_day - params["targetKgPerDay"],
            "o2KgPerDay": params["targetKgPerDay"],
            "waterKgPerDay": 0,
            "h2KgPerDay": 0,
            "ch4KgPerDay": 0,
        }

    return {
        "targetKgPerDay": params["targetKgPerDay"],
        "regolithKgPerDay": regolith_kg_per_day,
        "slagKgPerDay": 0,
        "o2KgPerDay": 0 if sabatier is None else sabatier["o2KgPerDay"],
        "waterKgPerDay": params["targetKgPerDay"],
        "h2KgPerDay": 0 if sabatier is None else sabatier["h2KgPerDay"],
        "ch4KgPerDay": 0 if sabatier is None else sabatier["ch4KgPerDay"],
    }


def _energy_line_items(
    params: dict[str, Any],
    sec_excavation_j_per_kg: float,
    electrolysis: dict[str, Any],
    sec_sub_j_per_kg_value: float | None,
    cryocooler_power_w: float,
    sabatier: dict[str, float] | None,
) -> list[dict[str, float | str]]:
    mdot_product_kg_per_s = params["targetKgPerDay"] / SECONDS_PER_DAY
    cryo_j_per_kg = params["secLiquefaction"] * J_PER_KWH + (
        cryocooler_power_w / mdot_product_kg_per_s if mdot_product_kg_per_s > 0 else 0
    )

    if params["site"] == "equatorial":
        return [
            {"from": "mine", "to": "melt", "jPerKg": sec_excavation_j_per_kg},
            {"from": "melt", "to": "electrolysis", "jPerKg": electrolysis["secThermal_JPerKg"]},
            {"from": "electrolysis", "to": "product", "jPerKg": electrolysis["secElec_JPerKg"]},
            {"from": "electrolysis", "to": "parasitic", "jPerKg": electrolysis["secParasitic_JPerKg"]},
            {"from": "cryo", "to": "product", "jPerKg": cryo_j_per_kg},
        ]

    sublimation_j_per_kg = 0 if sec_sub_j_per_kg_value is None else sec_sub_j_per_kg_value
    lines = [
        {"from": "mine", "to": "sublimation", "jPerKg": sec_excavation_j_per_kg},
        {"from": "sublimation", "to": "product", "jPerKg": sublimation_j_per_kg},
        {"from": "sublimation", "to": "parasitic", "jPerKg": params["fDistill"] * sublimation_j_per_kg},
        {"from": "cryo", "to": "product", "jPerKg": cryo_j_per_kg},
    ]

    if sabatier is not None:
        lines.append(
            {
                "from": "electrolysis",
                "to": "product",
                "jPerKg": sabatier["secWaterElectrolysis_JPerKg"],
            }
        )

    return lines


def simulate_timeseries(
    input_params: dict[str, Any] | None = None,
    opts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Sample lunar day/night cycles. Hours, W, kg, and kg/day match the TS API."""
    params, _ = normalize_params(input_params)
    result = simulate(params)
    options = {} if opts is None else opts
    cycles = max(1, int(options.get("cycles", 1)))
    samples_per_cycle = max(2, int(options.get("samplesPerCycle", 96)))
    t_day = c("tDay")
    t_night = c("tNight")
    cycle_hours = t_day + t_night
    steps = cycles * samples_per_cycle
    dt_hours = cycle_hours / samples_per_cycle
    load_nominal_w = result["energy"]["gridPowerW"]
    p_array_w = load_nominal_w / params["etaWire"] + (load_nominal_w * t_night) / (
        t_day * params["etaRoundTrip"]
    )
    reserve_soc = 1 - params["DoD"]
    net_production_nominal_kg_per_day = max(
        0,
        result["production"]["targetKgPerDay"] - result["cryo"]["boiloffKgPerDay"],
    )
    points: list[dict[str, Any]] = []
    delivered_wh = 0.0
    requested_wh = load_nominal_w * steps * dt_hours

    for step in range(steps + 1):
        t_hours = step * dt_hours
        in_cycle = t_hours % cycle_hours
        daylight = in_cycle < t_day
        solar_output_w = 0.0
        battery_soc = 1.0
        load_w = load_nominal_w

        if result["power"]["architecture"] == "solar":
            solar_output_w = p_array_w if daylight else 0
            if daylight:
                battery_soc = min(1, reserve_soc + params["DoD"] * (in_cycle / t_day))
            else:
                battery_soc = max(reserve_soc, 1 - params["DoD"] * ((in_cycle - t_day) / t_night))
            if not daylight and battery_soc <= reserve_soc and params["DoD"] <= 0:
                load_w = 0
        else:
            solar_output_w = 0
            battery_soc = 1

        if step < steps:
            delivered_wh += load_w * dt_hours

        load_fraction = load_w / load_nominal_w if load_nominal_w > 0 else 1
        net_production_kg_per_day = net_production_nominal_kg_per_day * load_fraction
        tank_fill_kg = max(0, (t_hours / 24) * net_production_kg_per_day)
        points.append(
            {
                "tHours": t_hours,
                "daylight": daylight,
                "solarOutputW": solar_output_w,
                "loadW": load_w,
                "batterySoC": battery_soc,
                "tankFillKg": tank_fill_kg,
                "boiloffKgPerDay": result["cryo"]["boiloffKgPerDay"],
                "netProductionKgPerDay": net_production_kg_per_day,
            }
        )

    min_soc = min(point["batterySoC"] for point in points)
    tank_peak_kg = max(point["tankFillKg"] for point in points)
    duty_cycle = delivered_wh / requested_wh if load_nominal_w > 0 else 1
    curtailed_raw = max(0, 1 - duty_cycle)
    curtailed_fraction = 0 if curtailed_raw < 1e-12 else curtailed_raw

    return {
        "points": points,
        "summary": {
            "minSoC": min_soc,
            "dutyCycle": duty_cycle,
            "tankPeakKg": tank_peak_kg,
            "curtailedFraction": curtailed_fraction,
        },
    }


def sample_uncertainty(
    base: dict[str, Any],
    spec: list[dict[str, Any]],
    opts: dict[str, Any],
) -> dict[str, Any]:
    """Return deterministic splitmix64/Box-Muller percentile bands for headline KPIs."""
    n = max(1, int(opts["n"]))
    rng = SplitMix64(int(opts["seed"]))
    base_params, _ = normalize_params(base)
    samples: dict[str, list[float]] = {
        "paybackDays": [],
        "secTotal": [],
        "nMissions": [],
        "leverageL": [],
    }

    for _ in range(n):
        params = dict(base_params)
        for item in spec:
            key = item["key"]
            base_value = base_params.get(key)
            if not isinstance(base_value, (int, float)) or isinstance(base_value, bool) or not math.isfinite(base_value):
                continue
            rel = item["rel"] if isinstance(item.get("rel"), (int, float)) and math.isfinite(item["rel"]) else 0
            params[key] = base_value * (1 + rel * rng.gaussian())

        result = simulate(params)
        samples["paybackDays"].append(result["logistics"]["paybackDays"])
        samples["secTotal"].append(result["energy"]["secTotal_kWhPerKg"])
        samples["nMissions"].append(result["logistics"]["nMissions"])
        samples["leverageL"].append(result["logistics"]["leverageL"])

    return {
        "paybackDays": _summarize(samples["paybackDays"]),
        "secTotal": _summarize(samples["secTotal"]),
        "nMissions": _summarize(samples["nMissions"]),
        "leverageL": _summarize(samples["leverageL"]),
    }


class SplitMix64:
    def __init__(self, seed: int) -> None:
        self.state = seed & U64_MASK

    def next_double(self) -> float:
        bits = self.next_u64() >> 11
        return bits / DOUBLE_UNIT

    def gaussian(self) -> float:
        u1 = max(self.next_double(), sys.float_info.min)
        u2 = self.next_double()
        return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)

    def next_u64(self) -> int:
        self.state = (self.state + 0x9E3779B97F4A7C15) & U64_MASK
        z = self.state
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & U64_MASK
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & U64_MASK
        return (z ^ (z >> 31)) & U64_MASK


def _summarize(values: list[float]) -> dict[str, float]:
    sorted_values = sorted(values)
    total = sum(values)
    return {
        "p10": _percentile(sorted_values, 0.1),
        "p50": _percentile(sorted_values, 0.5),
        "p90": _percentile(sorted_values, 0.9),
        "mean": total / len(values),
    }


def _percentile(sorted_values: list[float], p: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (len(sorted_values) - 1) * p
    lower = math.floor(rank)
    upper = math.ceil(rank)
    lower_value = sorted_values[lower]
    upper_value = sorted_values[upper]
    return lower_value + (upper_value - lower_value) * (rank - lower)
