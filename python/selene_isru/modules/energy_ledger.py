from __future__ import annotations

import sys
from typing import Any

from ..constants import c


def _balance(node_id: str, label: str, electrical: float, coupled: float, useful: float, rejected: float, accumulation: float) -> dict[str, Any]:
    raw = electrical + coupled - useful - rejected - accumulation
    scale = max(1, abs(electrical), abs(coupled), abs(useful), abs(rejected), abs(accumulation))
    roundoff_tolerance_w = 64 * sys.float_info.epsilon * scale
    return {
        "id": node_id, "label": label, "electricalInputW": electrical, "coupledInputW": coupled,
        "usefulOutputW": useful, "rejectedHeatW": rejected, "accumulationW": accumulation,
        "residualW": 0 if abs(raw) <= roundoff_tolerance_w else raw,
    }


def energy_ledger(
    params: dict[str, Any],
    grid_power_w: float,
    lines: list[dict[str, Any]],
    excavation_mech_power_w: float,
    electrolysis: dict[str, Any],
    cryo: dict[str, Any],
    water_electrolysis: dict[str, Any] | None,
    ilmenite: dict[str, float] | None = None,
) -> dict[str, Any]:
    mass_flow = params["targetKgPerDay"] / 86400

    def power_for(source: str, target: str) -> float:
        line = next((item for item in lines if item["from"] == source and item["to"] == target), None)
        return 0 if line is None else line["jPerKg"] * mass_flow

    balances: list[dict[str, Any]] = []
    excavation_target = "beneficiation" if ilmenite is not None else "melt" if params["site"] == "equatorial" else "sublimation"
    excavation_input = power_for("mine", excavation_target)
    excavation_useful = min(excavation_input, max(0, excavation_mech_power_w))
    balances.append(_balance("excavation-energy", "Excavation drive", excavation_input, 0, excavation_useful, excavation_input - excavation_useful, 0))

    def water_electrolysis_balance() -> dict[str, Any]:
        electrolysis_input = power_for("electrolysis", "product")
        fraction = min(1, c("VthermoneutralWater") * params["etaFaradayEl"] / params["Vel"])
        chemical = electrolysis_input * fraction
        return _balance("water-electrolysis-energy", "Water electrolysis", electrolysis_input, 0, chemical, electrolysis_input - chemical, 0)

    if ilmenite is not None:
        beneficiation = power_for("beneficiation", "reduction")
        balances.append(_balance("ilmenite-beneficiation-energy", "Soil sizing and separation", beneficiation, 0, 0, beneficiation, 0))
        # The reduction heat leaves as chemical energy in the water; the feed
        # heat not recovered leaves with the spent solids.
        reactor = power_for("reduction", "electrolysis")
        reaction = min(reactor, ilmenite["secReaction_JPerKg"] * mass_flow)
        balances.append(_balance("ilmenite-reactor-energy", "Ilmenite feed heat and reduction", reactor, 0, reaction, reactor - reaction, 0))
        reactor_loss = power_for("reduction", "parasitic")
        balances.append(_balance("ilmenite-aux-energy", "Reactor heat loss and gas recycle", reactor_loss, 0, 0, reactor_loss, 0))
        balances.append(water_electrolysis_balance())
    elif params["site"] == "equatorial":
        melt_input = power_for("melt", "electrolysis")
        balances.append(_balance("mre-melt-energy", "Regolith melt duty", melt_input, 0, 0, 0, melt_input))
        electrolysis_input = power_for("electrolysis", "product")
        chemical = min(electrolysis_input, max(0, electrolysis["chemicalPowerW"]))
        balances.append(_balance("mre-electrolysis-energy", "MRE voltage and reaction", electrolysis_input, 0, chemical, electrolysis_input - chemical, 0))
        auxiliaries = power_for("electrolysis", "parasitic")
        balances.append(_balance("mre-aux-energy", "MRE radiation and auxiliaries", auxiliaries, 0, 0, auxiliaries, 0))
    else:
        sublimation_input = power_for("sublimation", "product")
        balances.append(_balance("sublimation-energy", "Polar heating and sublimation", sublimation_input, 0, 0, 0, sublimation_input))
        distillation = power_for("sublimation", "parasitic")
        balances.append(_balance("polar-aux-energy", "Heater loss, vapor handling, and process allowance", distillation, 0, 0, distillation, 0))
        if water_electrolysis is not None:
            balances.append(water_electrolysis_balance())
    balances.append(_balance("storage-conditioning-energy", "Product conditioning", cryo["totalConditioningPowerW"], 0, 0, 0, cryo["totalConditioningPowerW"]))
    balances.append(_balance("storage-cooling-energy", "Storage heat lift", cryo["cryocoolerPowerW"], cryo["qRemovedW"], 0, cryo["cryocoolerPowerW"] + cryo["qRemovedW"], 0))
    allocated = sum(item["electricalInputW"] for item in balances)
    raw_grid_residual = grid_power_w - allocated
    allocation_scale = max(1, abs(grid_power_w), abs(allocated))
    grid_residual = 0 if abs(raw_grid_residual) <= 64 * sys.float_info.epsilon * allocation_scale else raw_grid_residual
    maximum = max([abs(grid_residual), *(abs(item["residualW"]) for item in balances)])
    return {"balances": balances, "maxAbsResidualW": maximum, "gridAllocationResidualW": grid_residual}
