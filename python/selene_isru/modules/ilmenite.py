from __future__ import annotations

from typing import Any

from ..constants import c
from .sabatier import simulate_water_electrolysis


def ilmenite_oxygen_fraction() -> float:
    """Oxygen removed per kg of ilmenite reduced, FeTiO3 + H2 -> Fe + TiO2 + H2O."""
    return (c("M_O2") / 2) / (c("M_FeO") + c("M_TiO2"))


def reduces_ilmenite(params: dict[str, Any]) -> bool:
    return params["site"] == "equatorial" and params["equatorialProcess"] == "ilmenite"


def ilmenite_separates(params: dict[str, Any]) -> bool:
    """True when magnetic separation enriches the feed; mirrors `ilmeniteSeparates`."""
    return params["ilmConcentrateGrade"] > params["fIlmenite"]


def ilmenite_soil_per_kg_o2(params: dict[str, Any]) -> float:
    """Soil mined per kg of oxygen; mirrors `ilmeniteSoilPerKgO2`."""
    recovery = params["etaIlmRecovery"] if ilmenite_separates(params) else 1
    return 1 / (params["fIlmenite"] * params["fIlmSized"] * recovery * params["fIlmConversion"] * ilmenite_oxygen_fraction())


def simulate_ilmenite(params: dict[str, Any], o2_kg_per_day: float) -> dict[str, float]:
    """Hydrogen reduction of ilmenite; mirrors `simulateIlmenite`."""
    reduced_per_kg_o2 = 1 / ilmenite_oxygen_fraction()
    fed_ilmenite_per_kg_o2 = reduced_per_kg_o2 / params["fIlmConversion"]
    soil_per_kg_o2 = ilmenite_soil_per_kg_o2(params)
    sized_soil_per_kg_o2 = soil_per_kg_o2 * params["fIlmSized"]
    # Without enrichment the reactor takes the whole sized stream.
    concentrate_per_kg_o2 = (
        fed_ilmenite_per_kg_o2 / params["ilmConcentrateGrade"] if ilmenite_separates(params) else sized_soil_per_kg_o2
    )
    water_per_kg_o2 = c("M_H2O") / (c("M_O2") / 2)
    iron_per_kg_o2 = reduced_per_kg_o2 * (c("M_FeO") - c("M_O2") / 2) / (c("M_FeO") + c("M_TiO2"))

    sec_sensible = (
        concentrate_per_kg_o2
        * c("cpIlmeniteFeed")
        * (params["TIlmReactor"] - params["Tambient"])
        * (1 - params["etaIlmHeatRecovery"])
    )
    sec_reaction = c("dHIlmeniteReduction") * reduced_per_kg_o2
    water = simulate_water_electrolysis(params, o2_kg_per_day * water_per_kg_o2)
    soil_kg_per_day = o2_kg_per_day * soil_per_kg_o2
    concentrate_kg_per_day = o2_kg_per_day * concentrate_per_kg_o2

    return {
        "soilPerKgO2": soil_per_kg_o2,
        "soilKgPerDay": soil_kg_per_day,
        "sizedSoilKgPerDay": o2_kg_per_day * sized_soil_per_kg_o2,
        "concentrateKgPerDay": concentrate_kg_per_day,
        "concentrateGrade": fed_ilmenite_per_kg_o2 / concentrate_per_kg_o2,
        "tailingsKgPerDay": soil_kg_per_day - concentrate_kg_per_day,
        "ilmeniteReducedKgPerDay": o2_kg_per_day * reduced_per_kg_o2,
        "waterKgPerDay": o2_kg_per_day * water_per_kg_o2,
        "hydrogenRecycleKgPerDay": water["grossH2KgPerDay"],
        "spentSolidsKgPerDay": concentrate_kg_per_day - o2_kg_per_day,
        "ironKgPerDay": o2_kg_per_day * iron_per_kg_o2,
        "secMining_JPerKg": params["eMining"] * soil_per_kg_o2,
        "secBeneficiation_JPerKg": params["eIlmBeneficiation"] * soil_per_kg_o2,
        "secSensible_JPerKg": sec_sensible,
        "secReaction_JPerKg": sec_reaction,
        "secReactorLoss_JPerKg": params["fIlmHeatLoss"] * (sec_sensible + sec_reaction),
        "secWaterElectrolysis_JPerKg": water["secWaterElectrolysis_JPerKg"] * water_per_kg_o2,
        "miningMassKg": params["kMiningMass"] * soil_kg_per_day,
        "beneficiationMassKg": params["kIlmBeneficiationMass"] * soil_kg_per_day,
        "reactorMassKg": params["kIlmReactorMass"] * o2_kg_per_day,
        "electrolyzerMassKg": params["kElectrolyzerMass"] * o2_kg_per_day * water_per_kg_o2,
    }
