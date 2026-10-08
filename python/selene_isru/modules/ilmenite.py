from __future__ import annotations

import math
from typing import Any

from ..constants import c
from .sabatier import simulate_water_electrolysis


def ilmenite_oxygen_fraction() -> float:
    """Oxygen removed per kg of ilmenite reduced, FeTiO3 + H2 -> Fe + TiO2 + H2O."""
    return (c("M_O2") / 2) / (c("M_FeO") + c("M_TiO2"))


def reduces_ilmenite(params: dict[str, Any]) -> bool:
    return params["site"] == "equatorial" and params["equatorialProcess"] == "ilmenite"


def feeds_basalt(params: dict[str, Any]) -> bool:
    return params["ilmFeed"] == "basalt"


def ilmenite_feed_grade(params: dict[str, Any]) -> float:
    """Ilmenite mass fraction of the feed before separation; mirrors `ilmeniteFeedGrade`."""
    return params["fIlmBasalt"] if feeds_basalt(params) else params["fIlmenite"]


def ilmenite_separates(params: dict[str, Any]) -> bool:
    """True when magnetic separation enriches the feed; mirrors `ilmeniteSeparates`."""
    return params["ilmConcentrateGrade"] > ilmenite_feed_grade(params)


def _sized_share(params: dict[str, Any]) -> float:
    return params["fBasaltSized"] if feeds_basalt(params) else params["fIlmSized"]


def _feed_per_kg_o2(params: dict[str, Any]) -> float:
    separates = ilmenite_separates(params)
    recovery = params["etaIlmRecovery"] * (params["fIlmLiberated"] if feeds_basalt(params) else 1) if separates else 1
    return 1 / (
        ilmenite_feed_grade(params) * _sized_share(params) * recovery * ilmenite_conversion(params) * ilmenite_oxygen_fraction()
    )


def ilmenite_conversion(params: dict[str, Any]) -> float:
    """Fraction of the fed ilmenite reduced; mirrors `ilmeniteConversion`."""
    stages = c("nIlmBedStages")
    ref_rate_per_h = (stages * (math.pow(1 - c("ilmConversionRef"), -1 / stages) - 1)) / c("tIlmResidenceRefH")
    rate_per_h = ref_rate_per_h * math.exp(
        (-params["EaIlmReduction"] / c("R")) * (1 / params["TIlmReactor"] - 1 / c("TIlmReactorRef"))
    )
    return 1 - math.pow(1 + (rate_per_h * params["tIlmResidenceH"]) / stages, -stages)


def ilmenite_soil_per_kg_o2(params: dict[str, Any]) -> float:
    """Soil mined per kg of oxygen; mirrors `ilmeniteSoilPerKgO2`."""
    # A basalt mine digs a layer that is part basalt, part soil and oversize.
    return _feed_per_kg_o2(params) / params["fBasaltInMined"] if feeds_basalt(params) else _feed_per_kg_o2(params)


def ilmenite_overburden_per_kg_o2(params: dict[str, Any]) -> float:
    """Overburden stripped per kg of oxygen; mirrors `ilmeniteOverburdenPerKgO2`."""
    return params["basaltOverburdenRatio"] * ilmenite_soil_per_kg_o2(params) if feeds_basalt(params) else 0


def simulate_ilmenite(params: dict[str, Any], o2_kg_per_day: float) -> dict[str, float]:
    """Hydrogen reduction of ilmenite; mirrors `simulateIlmenite`."""
    conversion = ilmenite_conversion(params)
    reduced_per_kg_o2 = 1 / ilmenite_oxygen_fraction()
    fed_ilmenite_per_kg_o2 = reduced_per_kg_o2 / conversion
    soil_per_kg_o2 = ilmenite_soil_per_kg_o2(params)
    basalt = feeds_basalt(params)
    basalt_per_kg_o2 = _feed_per_kg_o2(params) if basalt else 0
    sized_soil_per_kg_o2 = (basalt_per_kg_o2 if basalt else soil_per_kg_o2) * _sized_share(params)
    beneficiated_per_kg_o2 = basalt_per_kg_o2 if basalt else soil_per_kg_o2
    beneficiation_j_per_kg = params["eIlmComminution"] if basalt else params["eIlmBeneficiation"]
    beneficiation_mass_coefficient = params["kIlmComminutionMass"] if basalt else params["kIlmBeneficiationMass"]
    moved_per_kg_o2 = soil_per_kg_o2 + ilmenite_overburden_per_kg_o2(params)
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
    # The bed holds the feed for its residence time; the slower the reduction
    # or the leaner the feed, the more it holds and the heavier it is.
    bed_holdup_kg = (concentrate_kg_per_day / 24) * params["tIlmResidenceH"]
    bed_mass_kg = params["kIlmBedMass"] * bed_holdup_kg

    return {
        "conversion": conversion,
        "soilPerKgO2": soil_per_kg_o2,
        "soilKgPerDay": soil_kg_per_day,
        "basaltFedKgPerDay": o2_kg_per_day * basalt_per_kg_o2,
        "sizedSoilKgPerDay": o2_kg_per_day * sized_soil_per_kg_o2,
        "concentrateKgPerDay": concentrate_kg_per_day,
        "concentrateGrade": fed_ilmenite_per_kg_o2 / concentrate_per_kg_o2,
        "tailingsKgPerDay": soil_kg_per_day - concentrate_kg_per_day,
        "ilmeniteReducedKgPerDay": o2_kg_per_day * reduced_per_kg_o2,
        "waterKgPerDay": o2_kg_per_day * water_per_kg_o2,
        "hydrogenRecycleKgPerDay": water["grossH2KgPerDay"],
        "spentSolidsKgPerDay": concentrate_kg_per_day - o2_kg_per_day,
        "ironKgPerDay": o2_kg_per_day * iron_per_kg_o2,
        "secMining_JPerKg": params["eMining"] * moved_per_kg_o2,
        "secBeneficiation_JPerKg": beneficiation_j_per_kg * beneficiated_per_kg_o2,
        "secSensible_JPerKg": sec_sensible,
        "secReaction_JPerKg": sec_reaction,
        "secReactorLoss_JPerKg": params["fIlmHeatLoss"] * (sec_sensible + sec_reaction),
        "secWaterElectrolysis_JPerKg": water["secWaterElectrolysis_JPerKg"] * water_per_kg_o2,
        "miningMassKg": params["kMiningMass"] * (o2_kg_per_day * moved_per_kg_o2),
        "beneficiationMassKg": beneficiation_mass_coefficient * o2_kg_per_day * beneficiated_per_kg_o2,
        "bedHoldupKg": bed_holdup_kg,
        "bedMassKg": bed_mass_kg,
        "reactorMassKg": params["kIlmGasLoopMass"] * o2_kg_per_day + bed_mass_kg,
        "electrolyzerMassKg": params["kElectrolyzerMass"] * o2_kg_per_day * water_per_kg_o2,
    }
