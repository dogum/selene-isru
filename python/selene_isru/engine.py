from __future__ import annotations

import math
import sys
from typing import Any

from .modules.construction import simulate_construction
from .modules.cryo import simulate_cryo
from .modules.energy_ledger import energy_ledger
from .modules.electrolysis import simulate_electrolysis
from .modules.excavation import simulate_excavation
from .modules.logistics import simulate_logistics
from .modules.materials import material_ledger
from .modules.power import simulate_power
from .modules.sabatier import simulate_sabatier
from .modules.site_profile import resolve_polar_profile, sample_polar_profile
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
    site_profile = resolve_polar_profile(params)
    sabatier = simulate_sabatier(params, params["targetKgPerDay"]) if params["site"] == "polar" and params["enableSabatier"] else None

    production = _production_state(params, excavation["regolithPerKgProduct"], sabatier)
    cryo = simulate_cryo(params, _storage_demands(params, production), site_profile["profile"])
    energy_lines = _energy_line_items(
        params,
        excavation["secExcavation_JPerKg"],
        electrolysis,
        thermal["secSub_JPerKg"],
        cryo["conditioningSecKWhPerKg"],
        cryo["cryocoolerPowerW"],
        sabatier,
    )
    flows = [{"from": line["from"], "to": line["to"], "kWhPerKg": line["jPerKg"] / J_PER_KWH} for line in energy_lines]
    sec_total_j_per_kg = sum(line["jPerKg"] for line in energy_lines)
    sec_total_kwh_per_kg = sec_total_j_per_kg / J_PER_KWH
    grid_power_w = params["targetKgPerDay"] / SECONDS_PER_DAY * sec_total_j_per_kg
    energy_accounting = energy_ledger(params, grid_power_w, energy_lines, excavation["mechPowerW"], electrolysis, cryo, sabatier)
    power = simulate_power(params, grid_power_w, site_profile["profile"])
    reactor_mass_kg = params["kReactorMass"] * params["targetKgPerDay"] if params["site"] == "equatorial" or params["enableSabatier"] else 0
    logistics = simulate_logistics(
        params,
        excavation["fleetMassKg"],
        reactor_mass_kg,
        power["selectedPowerMassKg"],
        cryo["cryoMassKg"],
    )
    construction = simulate_construction(params, production["slagKgPerDay"] if params["site"] == "equatorial" else 0)
    materials = material_ledger(params, production)
    warnings = [
        *param_warnings,
        *site_profile["warnings"],
        *(electrolysis["warnings"] if params["site"] == "equatorial" else []),
        *cryo["warnings"],
        *power["warnings"],
        *construction["warnings"],
    ]
    if materials["maxAbsResidualKgPerDay"] > 1e-6:
        warnings.append({"id": "material-balance", "severity": "alarm", "module": "materials", "message": "A process-node material balance exceeds the conservation tolerance.", "value": materials["maxAbsResidualKgPerDay"], "limit": 1e-6})
    if energy_accounting["maxAbsResidualW"] > 1e-6:
        warnings.append({"id": "energy-balance", "severity": "alarm", "module": "energy", "message": "A process-node energy balance or grid allocation exceeds the conservation tolerance.", "value": energy_accounting["maxAbsResidualW"], "limit": 1e-6})
    if params["site"] == "equatorial" and params["oxideModel"]:
        oxide_sum = sum(params[key] for key in ("oxideSiO2", "oxideTiO2", "oxideAl2O3", "oxideFeO", "oxideMgO", "oxideCaO"))
        if abs(oxide_sum - 1) > 0.05:
            warnings.append({"id": "oxide-composition-sum", "severity": "caution", "module": "electrolysis", "message": "Oxide fractions differ from unity by more than five percentage points; the model normalizes them.", "value": oxide_sum, "limit": 1})

    return {
        "site": params["site"],
        "production": production,
        "energy": {
            "secTotal_kWhPerKg": sec_total_kwh_per_kg,
            "flows": flows,
            "gridPowerW": grid_power_w,
            "balances": energy_accounting["balances"],
            "maxAbsResidualW": energy_accounting["maxAbsResidualW"],
            "gridAllocationResidualW": energy_accounting["gridAllocationResidualW"],
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
            "reversibleVoltageV": electrolysis["reversibleVoltageV"],
            "activationOverpotentialV": electrolysis["activationOverpotentialV"],
            "ohmicOverpotentialV": electrolysis["ohmicOverpotentialV"],
            "concentrationOverpotentialV": electrolysis["concentrationOverpotentialV"],
            "unallocatedVoltageV": electrolysis["unallocatedVoltageV"],
            "voltageMarginV": electrolysis["voltageMarginV"],
            "electrodeAreaM2": electrolysis["electrodeAreaM2"],
            "currentUtilization": electrolysis["currentUtilization"],
            "electricalInputW": electrolysis["electricalInputW"],
            "chemicalPowerW": electrolysis["chemicalPowerW"],
            "modeledLossPowerW": electrolysis["modeledLossPowerW"],
        },
        "thermal": thermal,
        "cryo": {
            "stream": cryo["stream"],
            "controlMode": cryo["controlMode"],
            "densityKgPerM3": cryo["densityKgPerM3"],
            "storageTemperatureK": cryo["storageTemperatureK"],
            "conditioningSecKWhPerKg": cryo["conditioningSecKWhPerKg"],
            "qLeakW": cryo["qLeakW"],
            "qRemovedW": cryo["qRemovedW"],
            "qResidualW": cryo["qResidualW"],
            "unmitigatedBoiloffKgPerDay": cryo["unmitigatedBoiloffKgPerDay"],
            "boiloffKgPerDay": cryo["boiloffKgPerDay"],
            "cryocoolerPowerW": cryo["cryocoolerPowerW"],
            "mliFlux_WPerM2": cryo["mliFlux_WPerM2"],
            "inventories": cryo["inventories"],
            "totalStorageMassKg": cryo["cryoMassKg"],
            "totalReserveVolumeM3": cryo["totalReserveVolumeM3"],
            "totalConditioningPowerW": cryo["totalConditioningPowerW"],
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
            "beamDeliveryMarginW": power["beamDeliveryMarginW"],
            "solarDeliveredCapacityW": power["solarDeliveredCapacityW"],
            "siteDayHours": power["siteDayHours"],
            "siteNightHours": power["siteNightHours"],
            "siteProfile": power["siteProfile"],
        },
        "logistics": logistics,
        "materials": materials,
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
            "grossH2KgPerDay": 0,
            "h2KgPerDay": 0,
            "co2ImportedKgPerDay": 0,
            "ch4KgPerDay": 0,
            "waterRecycleKgPerDay": 0,
        }

    return {
        "targetKgPerDay": params["targetKgPerDay"],
        "regolithKgPerDay": regolith_kg_per_day,
        "slagKgPerDay": 0,
        "o2KgPerDay": 0 if sabatier is None else sabatier["o2KgPerDay"],
        "waterKgPerDay": params["targetKgPerDay"],
        "grossH2KgPerDay": 0 if sabatier is None else sabatier["grossH2KgPerDay"],
        "h2KgPerDay": 0 if sabatier is None else sabatier["h2UnreactedKgPerDay"],
        "co2ImportedKgPerDay": 0 if sabatier is None else sabatier["co2ImportedKgPerDay"],
        "ch4KgPerDay": 0 if sabatier is None else sabatier["ch4KgPerDay"],
        "waterRecycleKgPerDay": 0 if sabatier is None else sabatier["waterRecycleKgPerDay"],
    }


def _storage_demands(params: dict[str, Any], production: dict[str, float]) -> list[dict[str, Any]]:
    if params["storageStream"] != "auto":
        return [{"id": "selected-primary", "stream": params["storageStream"], "role": "custom" if params["storageStream"] == "custom" else "product", "rateKgPerDay": params["targetKgPerDay"]}]
    if params["site"] == "equatorial":
        return [{"id": "oxygen-product", "stream": "lox", "role": "product", "rateKgPerDay": production["o2KgPerDay"]}]
    if not params["enableSabatier"]:
        return [{"id": "water-product", "stream": "water-ice", "role": "product", "rateKgPerDay": production["waterKgPerDay"]}]
    return [
        {"id": "water-feed-buffer", "stream": "water-ice", "role": "buffer", "rateKgPerDay": production["waterKgPerDay"]},
        {"id": "oxygen-product", "stream": "lox", "role": "product", "rateKgPerDay": production["o2KgPerDay"]},
        {"id": "hydrogen-product", "stream": "lh2", "role": "product", "rateKgPerDay": production["h2KgPerDay"]},
        {"id": "methane-product", "stream": "lch4", "role": "product", "rateKgPerDay": production["ch4KgPerDay"]},
        {"id": "carbon-dioxide-feed", "stream": "co2-feed", "role": "feed", "rateKgPerDay": production["co2ImportedKgPerDay"]},
    ]


def _energy_line_items(
    params: dict[str, Any],
    sec_excavation_j_per_kg: float,
    electrolysis: dict[str, Any],
    sec_sub_j_per_kg_value: float | None,
    conditioning_sec_kwh_per_kg: float,
    cryocooler_power_w: float,
    sabatier: dict[str, float] | None,
) -> list[dict[str, float | str]]:
    mdot_product_kg_per_s = params["targetKgPerDay"] / SECONDS_PER_DAY
    cryo_j_per_kg = conditioning_sec_kwh_per_kg * J_PER_KWH + (
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
    t_day = result["power"]["siteDayHours"]
    t_night = result["power"]["siteNightHours"]
    cycle_hours = result["power"]["siteProfile"]["cycleHours"] if params["site"] == "polar" else t_day + t_night
    steps = cycles * samples_per_cycle
    dt_hours = cycle_hours / samples_per_cycle
    load_nominal_w = result["energy"]["gridPowerW"]
    p_array_w = result["power"]["solarDeliveredCapacityW"]
    reserve_soc = 1 - params["DoD"]
    net_production_nominal_kg_per_day = max(
        0,
        result["production"]["targetKgPerDay"] - result["cryo"]["boiloffKgPerDay"],
    )
    points: list[dict[str, Any]] = []
    delivered_wh = 0.0
    battery_soc = 1.0
    tank_fill_kg = 0.0
    storage_capacity_wh = max(1e-9, load_nominal_w * t_night / (params["DoD"] * params["etaDischarge"]))
    requested_wh = load_nominal_w * steps * dt_hours

    for step in range(steps + 1):
        t_hours = step * dt_hours
        in_cycle = t_hours % cycle_hours
        if params["site"] == "polar":
            profile_point = sample_polar_profile(result["power"]["siteProfile"], in_cycle)
        else:
            profile_point = {"hour": in_cycle, "illumination": 1 if in_cycle < t_day else 0, "receiverVisibility": 1, "surfaceTemperatureK": params["Tsurface"] if in_cycle < t_day else params["Tpsr"]}
        daylight = profile_point["illumination"] > 0.05
        solar_output_w = 0.0
        load_w = load_nominal_w

        if result["power"]["architecture"] == "solar":
            solar_output_w = p_array_w * profile_point["illumination"] * profile_point["receiverVisibility"]
            if step < steps:
                net_w = solar_output_w - load_nominal_w
                if net_w >= 0:
                    battery_soc = min(1, battery_soc + net_w * dt_hours * params["etaRoundTrip"] / storage_capacity_wh)
                else:
                    available_wh = max(0, battery_soc - reserve_soc) * storage_capacity_wh
                    required_wh = -net_w * dt_hours / params["etaDischarge"]
                    if available_wh + 1e-9 >= required_wh:
                        battery_soc = max(reserve_soc, battery_soc - required_wh / storage_capacity_wh)
                    else:
                        battery_delivered_w = available_wh * params["etaDischarge"] / dt_hours
                        load_w = max(0, min(load_nominal_w, solar_output_w + battery_delivered_w))
                        battery_soc = reserve_soc
        else:
            solar_output_w = 0
            battery_soc = 1

        if step < steps:
            delivered_wh += load_w * dt_hours

        load_fraction = load_w / load_nominal_w if load_nominal_w > 0 else 1
        net_production_kg_per_day = net_production_nominal_kg_per_day * load_fraction
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
                "illumination": profile_point["illumination"],
                "receiverVisibility": profile_point["receiverVisibility"],
                "surfaceTemperatureK": profile_point["surfaceTemperatureK"],
            }
        )
        if step < steps:
            tank_fill_kg = max(0, tank_fill_kg + net_production_kg_per_day * dt_hours / 24)

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
        "plantMassThroughputDays": [],
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
        samples["plantMassThroughputDays"].append(result["logistics"]["plantMassThroughputDays"])
        samples["secTotal"].append(result["energy"]["secTotal_kWhPerKg"])
        samples["nMissions"].append(result["logistics"]["nMissions"])
        samples["leverageL"].append(result["logistics"]["leverageL"])

    return {
        "plantMassThroughputDays": _summarize(samples["plantMassThroughputDays"]),
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
