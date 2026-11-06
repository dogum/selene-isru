from __future__ import annotations

import math

import pytest

from selene_isru import (
    cable_design,
    cable_mass_kg,
    fission_shield_kg,
    horizon_km,
    line_efficiency,
    fission_scale_factor,
    nuclear_mass_at_kwe,
    sample_uncertainty,
    shield_mass_kg,
    shield_ref_kwe,
    simulate,
    simulate_timeseries,
    size_to_demand,
)
from selene_isru.constants import DEFAULTS
from selene_isru.modules.construction import shield_full_balance_m, simulate_construction
from selene_isru.modules.electrolysis import melt_heat_j_per_kg, oxide_model_yield, sec_elec_j_per_kg
from selene_isru.modules.logistics import payload_per_mission_kg
from selene_isru.modules.power import (
    brayton_cycle,
    brayton_cycle_at,
    fission_efficiency,
    p_crit_kw,
    radiator_flux_w_per_m2,
    radiator_temperatures_k,
    simulate_power,
)
from selene_isru.modules.sabatier import sabatier_kp
from selene_isru.modules.thermal import sec_sub_j_per_kg

J_PER_KWH = 3_600_000

# v0.22 scales the reactor and conversion with size; the v0.21 anchors pin the linear ones.
# v0.25 rebases the shield on Mason 2025 at 1 km; the pins keep the 1,676 kg FSP shield they were written for.
V021_FISSION = {"kReactorKgPerKwt": 1.75, "kConversionKgPerKwe": 6.58, "bFissionScale": 1, "MshieldKg": 1676}


def assert_rel(actual: float, expected: float, rel_tol: float) -> None:
    assert abs(actual - expected) <= abs(expected) * rel_tol


def warning_ids(result: dict) -> set[str]:
    return {warning["id"] for warning in result["warnings"]}


def test_regression_anchors() -> None:
    result = simulate({})

    assert_rel(sec_elec_j_per_kg(4.2, 0.9) / J_PER_KWH, 15.63, 0.005)
    assert_rel(result["electrolysis"]["xO2Effective"], 0.225, 1e-9)
    assert_rel(
        sum(row["o2KgPerKg"] for row in result["electrolysis"]["oxideYield"]),
        result["electrolysis"]["xO2Effective"],
        1e-12,
    )
    assert all(row["decomposed"] for row in result["electrolysis"]["oxideYield"])
    assert_rel(melt_heat_j_per_kg(DEFAULTS), 2_099_805, 1e-9)
    # v0.6 moved these from 24.78 kWh/kg and 1,032 kW (LOX conditioning 2.2 -> 1.32 kWh/kg);
    # v0.9 from 23.89 and 996 kW (mining 120 -> 10.1 kJ per kg of soil).
    assert_rel(result["energy"]["secTotal_kWhPerKg"], 23.76, 0.001)
    assert_rel(result["energy"]["gridPowerW"] / 1000, 990.0, 0.001)
    assert_rel(p_crit_kw(1500, 250, 30), 6.818, 0.001)
    assert_rel(sec_sub_j_per_kg(0.005, 800, 40, 263) / J_PER_KWH, 10.7, 0.01)
    assert_rel(sec_sub_j_per_kg(0.05, 800, 40, 263) / J_PER_KWH, 1.78, 0.01)
    assert result["logistics"]["nMissions"] == 1
    assert result["logistics"]["totalInfraMassKg"] / 1000 == result["logistics"]["plantMassThroughputDays"]
    # v0.9 moved this from 60.4: the excavation fleet is sized on soil moved (8.5 t -> 108 kg).
    assert_rel(result["logistics"]["plantMassThroughputDays"], 50.35, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.25: shield at its separation, cable to the outpost; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(shield_full_balance_m(101325, 3000), 20.85, 0.005)
    assert 95_000 <= payload_per_mission_kg(DEFAULTS) <= 107_000
    assert 1.8 <= result["construction"]["padsPerYear"] <= 2.2
    assert sabatier_kp(523) > sabatier_kp(723) > 0


def test_polar_chain_charges_capture_heater_and_extractor_v04() -> None:
    # v0.4 deliberately moved these from 2.814 kWh/kg and 19.5 t; v0.9 from 7.24 kWh/kg and
    # 29.85 t (mining and fleet on soil moved, overburden included).
    polar = simulate({"site": "polar"})
    assert polar["production"]["regolithKgPerDay"] == pytest.approx(1000 / (0.05 * 0.75), rel=1e-12)
    assert_rel(polar["thermal"]["extractorMassKg"], 4800, 1e-9)
    assert_rel(polar["thermal"]["secSub_JPerKg"] / J_PER_KWH, 1.78 / 0.75, 0.01)
    assert_rel(polar["energy"]["secTotal_kWhPerKg"], 6.478, 0.001)
    # v0.12: 17 whole RASSORs, 1,122 kg against 1,085, move landed mass from 21.48 t.
    assert_rel(polar["logistics"]["totalInfraMassKg"] / 1000, 21.98, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert polar["materials"]["maxAbsResidualKgPerDay"] == 0


def test_campaign_ledger_equatorial_payback_v05() -> None:
    # v0.5 adds the ledger; no earlier number moves. v0.9 moved payback from day 242.0 and the
    # return from 6.63 with the lighter excavation fleet.
    result = simulate({})
    logistics, campaign = result["logistics"], result["campaign"]
    leo_per_kg = DEFAULTS["M0leo"] / (DEFAULTS["etaPack"] * logistics["payloadPerMissionKg"])
    net_per_day = (
        DEFAULTS["gearRatio"] * DEFAULTS["targetKgPerDay"] * DEFAULTS["plantAvailability"]
        - leo_per_kg * DEFAULTS["sparesFracPerYear"] * logistics["totalInfraMassKg"] / 365
    )
    assert_rel(campaign["paybackDays"], DEFAULTS["commissioningDays"] + DEFAULTS["M0leo"] / net_per_day, 1e-12)
    assert_rel(campaign["paybackDays"], 240.8, 0.001)
    assert_rel(campaign["returnRatio"], 6.924, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power
    assert campaign["paysBackInCampaign"] is True
    sabatier = simulate({"site": "polar", "enableSabatier": True})["campaign"]
    assert sabatier["paybackDays"] is None
    # v0.13: the loop's own plant mass is lighter, so the return moves from 0.796.
    assert_rel(sabatier["returnRatio"], 0.7968, 0.001)  # v0.14: electrolysis balance of plant


def test_polar_propellant_mode_v06() -> None:
    result = simulate({"site": "polar", "polarProduct": "propellant"})
    production = result["production"]
    assert_rel(production["propellantKgPerDay"], 7 * production["h2KgPerDay"], 1e-12)
    assert_rel(production["excessO2KgPerDay"], production["o2KgPerDay"] - 6 * production["h2KgPerDay"], 1e-12)
    assert [item["stream"] for item in result["cryo"]["inventories"]] == ["water-ice", "lox", "lh2"]
    # v0.9 moved these from 20.78 kWh/kg, 82.35 t, day 311.3, 103.4x and 186.0x.
    assert_rel(result["energy"]["secTotal_kWhPerKg"], 20.62, 0.001)  # v0.14: electrolysis balance of plant
    assert_rel(result["logistics"]["totalInfraMassKg"] / 1000, 73.78, 0.001)  # v0.14: electrolysis balance of plant; v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.25: shield at its separation, cable to the outpost
    assert_rel(result["campaign"]["paybackDays"], 309.4, 0.001)  # v0.14: electrolysis balance of plant
    assert result["logistics"]["productKgPerDay"] == production["propellantKgPerDay"]
    assert_rel(result["logistics"]["leverageL"], 115.4, 0.001)  # v0.14: electrolysis balance of plant; v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.25: shield at its separation, cable to the outpost
    sabatier = simulate({"site": "polar", "enableSabatier": True})
    # v0.13: no longer borrows the MRE reactor mass, so leverage moves from 213.4x.
    assert_rel(sabatier["logistics"]["leverageL"], 222.5, 0.001)  # v0.14: electrolysis balance of plant; v0.19: fission calibrated to Mason and FSP; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable


def test_refuelling_demand_v07() -> None:
    crew = simulate({"refuelDemand": "lander"})
    assert_rel(crew["refuel"]["propellantPerSortieKg"], 42_595, 0.001)
    assert_rel(crew["refuel"]["demandO2KgPerDay"], 100.0, 0.001)
    # v0.9 moved these from 61.69 t and 0.732.
    assert_rel(crew["logistics"]["totalInfraMassKg"] / 1000, 51.72, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.25: shield at its separation, cable to the outpost
    assert crew["campaign"]["paysBackInCampaign"] is False
    assert_rel(crew["campaign"]["returnRatio"], 0.765, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power
    matched = simulate({"refuelDemand": "lander", "sortiesPerYear": 9})
    assert_rel(matched["campaign"]["paybackDays"], 273.3, 0.001)


def test_ilmenite_reduction_v08() -> None:
    ilmenite = simulate({"equatorialProcess": "ilmenite"})
    assert_rel(ilmenite["ilmenite"]["soilPerKgO2"], 327.3, 0.001)
    assert_rel(ilmenite["energy"]["secTotal_kWhPerKg"], 20.49, 0.001)  # v0.14: electrolysis balance of plant
    assert_rel(ilmenite["energy"]["gridPowerW"] / 1000, 853.6, 0.001)
    assert_rel(ilmenite["logistics"]["totalInfraMassKg"] / 1000, 93.62, 0.001)  # v0.14: electrolysis balance of plant; v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power
    assert_rel(ilmenite["campaign"]["paybackDays"], 585.8, 0.001)  # v0.14: electrolysis balance of plant
    high_ti = simulate({"equatorialProcess": "ilmenite", "fIlmenite": 0.15})
    assert_rel(high_ti["campaign"]["paybackDays"], 243.3, 0.001)


def test_excavation_on_soil_moved_v09() -> None:
    # Mining energy and fleet scale with the soil moved, from the RASSOR fleet of
    # Guerrero-Gonzalez & Zabel 2023; the polar pit mine also strips Kleinhenz & Paz's
    # 20 cm of overburden over 30 cm of icy regolith.
    equatorial = simulate({})
    soil = equatorial["production"]["regolithKgPerDay"]
    assert equatorial["excavation"]["soilMovedKgPerDay"] == soil
    assert equatorial["excavation"]["overburdenKgPerDay"] == 0
    # v0.12: whole RASSORs (2 x 66 kg) replace the continuous 108.4 kg fleet.
    assert equatorial["excavation"]["fleetMassKg"] == 132
    polar = simulate({"site": "polar"})
    ore = polar["production"]["regolithKgPerDay"]
    assert_rel(polar["excavation"]["overburdenKgPerDay"], 0.667 * ore, 1e-12)
    assert_rel(polar["excavation"]["soilMovedKgPerDay"], 1.667 * ore, 1e-12)
    assert polar["excavation"]["fleetMassKg"] == 1122
    assert_rel(simulate({"site": "polar", "chiIce": 0.01})["energy"]["secTotal_kWhPerKg"], 20.72, 0.001)


def test_ilmenite_kinetics_and_bed_hold_up_v010() -> None:
    # New and deliberate; Eagle's design point is unchanged, so v0.8's anchors hold.
    def at(patch: dict) -> dict:
        return simulate({"equatorialProcess": "ilmenite", **patch})

    base = at({})
    assert_rel(base["ilmenite"]["conversion"], 0.9, 1e-12)
    assert_rel(base["ilmenite"]["reactorMassKg"] / 1000, 18.60, 0.001)
    cool = at({"TIlmReactor": 1173})
    assert_rel(cool["ilmenite"]["conversion"], 0.7286, 0.001)
    assert_rel(cool["energy"]["secTotal_kWhPerKg"], 22.82, 0.001)  # v0.14: electrolysis balance of plant
    assert_rel(at({"tIlmResidenceH": 1})["ilmenite"]["conversion"], 0.5327, 0.001)
    long = at({"tIlmResidenceH": 8})
    assert_rel(long["ilmenite"]["conversion"], 0.9724, 0.001)
    assert_rel(long["logistics"]["totalInfraMassKg"] / 1000, 90.80, 0.001)  # v0.14: electrolysis balance of plant; v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power
    unseparated = at({"ilmConcentrateGrade": 0.075})
    assert_rel(unseparated["ilmenite"]["reactorMassKg"] / 1000, 31.48, 0.001)
    assert_rel(unseparated["energy"]["secTotal_kWhPerKg"], 45.01, 0.001)  # v0.14: electrolysis balance of plant


def test_basalt_feed_v011() -> None:
    basalt = simulate({"equatorialProcess": "ilmenite", "ilmFeed": "basalt"})
    ilmenite = basalt["ilmenite"]
    assert_rel(ilmenite["soilPerKgO2"], 186.3, 0.001)
    assert_rel(ilmenite["basaltFedKgPerDay"] / 1000, 88.49, 0.001)
    assert_rel(basalt["excavation"]["overburdenKgPerDay"], 1.1 * ilmenite["soilKgPerDay"], 1e-12)
    assert_rel(basalt["energy"]["secTotal_kWhPerKg"], 16.91, 0.001)  # v0.14: electrolysis balance of plant
    assert_rel(basalt["energy"]["gridPowerW"] / 1000, 704.6, 0.001)
    assert_rel(basalt["logistics"]["totalInfraMassKg"] / 1000, 84.61, 0.001)  # v0.14: electrolysis balance of plant; v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.27: cable voltage designed for its power
    assert basalt["logistics"]["nMissions"] == 1
    assert_rel(basalt["campaign"]["paybackDays"], 245.6, 0.001)  # v0.14: electrolysis balance of plant
    unseparated = simulate({"equatorialProcess": "ilmenite", "ilmFeed": "basalt", "ilmConcentrateGrade": 0.33})
    assert_rel(unseparated["ilmenite"]["soilPerKgO2"], 118.1, 0.001)
    assert_rel(unseparated["ilmenite"]["reactorMassKg"] / 1000, 20.62, 0.001)


def test_v1_aggregate_electrolysis_path_stays_reachable() -> None:
    fallback = simulate({"oxideModel": False})
    direct = oxide_model_yield({**DEFAULTS, "oxideModel": False})
    assert_rel(fallback["electrolysis"]["xO2Effective"], DEFAULTS["xO2"] * DEFAULTS["fExtract"], 1e-12)
    assert fallback["electrolysis"]["xO2Effective"] == direct["xO2Effective"]
    assert_rel(fallback["energy"]["secTotal_kWhPerKg"], simulate({})["energy"]["secTotal_kWhPerKg"], 1e-9)


def test_timeseries_solar_selected_cycle_anchor() -> None:
    solar_params = {
        "targetKgPerDay": 10,
        "MshieldKg": 8000,
        "Rarray": 5,
        "SEstorage": 1500,
        "kConversionKgPerKwe": 60,
    }
    result = simulate_timeseries(solar_params, {"cycles": 1, "samplesPerCycle": 12})
    assert len(result["points"]) == 13
    assert_rel(result["summary"]["minSoC"], 1 - DEFAULTS["DoD"], 1e-12)
    assert_rel(result["summary"]["dutyCycle"], 1, 1e-12)
    assert_rel(result["summary"]["curtailedFraction"], 0, 1e-12)
    assert result["summary"]["tankPeakKg"] > 0


def test_fixed_seed_uncertainty_anchor() -> None:
    result = sample_uncertainty(
        {},
        [{"key": "targetKgPerDay", "rel": 0.08}, {"key": "eMining", "rel": 0.15}],
        {"n": 32, "seed": 42},
    )
    assert result["plantMassThroughputDays"]["p10"] <= result["plantMassThroughputDays"]["p50"] <= result["plantMassThroughputDays"]["p90"]
    assert result["secTotal"]["p10"] <= result["secTotal"]["p50"] <= result["secTotal"]["p90"]
    # v0.12: whole excavators.
    # v0.17: the radiator charged by its area; alphaSpecific 30 -> 28 kg/kW rounds off 0.02 kg/kW.
    # v0.18: alphaSpecific split into reactor per kWt and conversion per kWe (28.003 kg/kWe at defaults).
    assert_rel(result["plantMassThroughputDays"]["p50"], 50.27825260507181, 1e-12)  # v0.19: fission calibrated to Mason and FSP; v0.20: Brayton cycle efficiency; v0.21: shield scales with power; v0.22: fission economy of scale; v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(result["secTotal"]["p50"], 23.758063285514478, 1e-12)


def test_public_warning_paths() -> None:
    assert "anode-current" in warning_ids(simulate({"jOperating": 10000, "Dox": 1e-11}))
    assert "thermal-stress" in warning_ids(simulate({"castDeltaT": 200}))
    assert "param-clamped" in warning_ids(simulate({"targetKgPerDay": 1}))
    assert "lander-no-payload" in warning_ids(simulate({"M0leo": 500_000, "dvTotal": 6500, "IspLander": 310, "MdryLander": 200_000}))


def test_direct_warning_branches_unreachable_by_bounded_public_params() -> None:
    params = dict(DEFAULTS)
    params.update({"rhoGasPlume": 0.1, "vGasPlume": 4000, "Cf": 0.02, "tauAllowable": 100, "FS": 4})
    construction = simulate_construction(params, 1000)
    assert "pad-shear" in {warning["id"] for warning in construction["warnings"]}

    power_params = dict(DEFAULTS)
    power_params.update({"kConversionKgPerKwe": 1000, "bFissionScale": 1})
    power = simulate_power(power_params, 1000)
    assert "beta-le-alpha" in {warning["id"] for warning in power["warnings"]}


def test_whole_excavators_from_rassor_kinematics_v012() -> None:
    # New and deliberate: 34 whole 300 m loops in a 16 h shift, 2.72 t/day per
    # RASSOR (Guerrero-Gonzalez & Zabel 2023), and only whole vehicles land.
    equatorial = simulate({})
    assert equatorial["excavation"]["excavatorTripsPerDay"] == 34
    assert equatorial["excavation"]["excavatorKgPerDay"] == 2720
    assert equatorial["excavation"]["excavatorCount"] == 2
    assert_rel(equatorial["logistics"]["totalInfraMassKg"] / 1000, 50.35, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.25: shield at its separation, cable to the outpost; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    small = simulate({"targetKgPerDay": 100})
    assert small["excavation"]["excavatorCount"] == 1
    assert small["excavation"]["fleetMassKg"] == 66
    far = simulate({"haulDistanceM": 500})
    assert far["excavation"]["excavatorTripsPerDay"] == 9
    assert far["excavation"]["excavatorCount"] == 7
    assert far["energy"]["secTotal_kWhPerKg"] == equatorial["energy"]["secTotal_kWhPerKg"]
    ilmenite = simulate({"equatorialProcess": "ilmenite"})
    assert ilmenite["excavation"]["excavatorCount"] == 121
    assert ilmenite["ilmenite"]["miningMassKg"] == ilmenite["excavation"]["fleetMassKg"]
    assert_rel(ilmenite["campaign"]["paybackDays"], 585.8, 0.001)  # v0.14: electrolysis balance of plant


def test_sabatier_plant_mass_on_methane_v013() -> None:
    # New and deliberate: water electrolyzer, a 33 kg per kg/day-of-methane
    # Sabatier block, and a methane liquefier (Kleinhenz & Paz 2017) replace the
    # borrowed MRE coefficient.
    result = simulate({"site": "polar", "enableSabatier": True})
    plant = next(row["massKg"] for row in result["logistics"]["manifest"] if row["subsystem"] == "reactor/plant")
    assert_rel(result["production"]["ch4KgPerDay"], 211.1, 0.001)
    assert_rel(plant / 1000, 13.23, 0.001)
    assert_rel(result["logistics"]["totalInfraMassKg"] / 1000, 54.41, 0.001)  # v0.14: electrolysis balance of plant; v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(simulate({})["logistics"]["totalInfraMassKg"] / 1000, 50.35, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.25: shield at its separation, cable to the outpost; v0.28: cable fixed mass refitted to Mason's 3 kVac cable


def test_stirling_converter_v023() -> None:
    # New and deliberate: a Stirling converter at 0.59 of Carnot with its own conversion mass.
    # Brayton stays the default, and the default plant does not move.
    assert_rel(simulate({})["logistics"]["totalInfraMassKg"] / 1000, 50.35, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    lithium = simulate({"fissionConverter": "stirling", "Tsource": 1050, "Tsink": 500})
    assert_rel(lithium["power"]["fissionThermalW"] / (lithium["energy"]["gridPowerW"] + lithium["power"]["cableLossW"]), 1 / 0.3090, 0.001)
    assert_rel(lithium["power"]["radiatorM2"], 938, 0.002)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(lithium["power"]["nuclearMassKg"] / 1000, 36.69, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(lithium["logistics"]["totalInfraMassKg"] / 1000, 57.36, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert lithium["logistics"]["nMissions"] == 1
    assert "stirling-hot-end" not in warning_ids(lithium)
    # Above NASA's 1,050 K Stirling hot end it cautions; the Brayton alarm does not apply.
    hot = simulate({"fissionConverter": "stirling"})
    assert [w["severity"] for w in hot["warnings"] if w["id"] == "stirling-hot-end"] == ["caution"]
    assert "fission-no-net-work" not in warning_ids(simulate({"fissionConverter": "stirling", "Tsink": 650}))

    # Disclosed limit: with a fixed fraction of Carnot the model's lightest Stirling
    # radiator runs near 540 K behind a 1,050 K hot end, against Mason's 500 K design.
    def at(tsink: float) -> float:
        return simulate({"fissionConverter": "stirling", "Tsource": 1050, "Tsink": tsink})["power"]["nuclearMassKg"]

    assert at(540) < at(500)
    assert at(540) < at(580)


def test_fission_economy_of_scale_v022() -> None:
    # New and deliberate: reactor and conversion scale as reactor heat^0.95 about 1 MWt
    # (Mason 2001, Table 4), recalibrated so Mason 2001's surface marginal mass holds.
    assert fission_scale_factor(DEFAULTS, DEFAULTS["QscaleRefKwt"]) == 1
    base = simulate({})
    assert_rel(base["power"]["nuclearMassKg"] / 1000, 29.72, 0.001)  # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(base["power"]["nuclearSpecificKgPerKw"], 25.46, 0.001)  # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power
    assert_rel(base["logistics"]["totalInfraMassKg"] / 1000, 50.35, 0.001)  # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert base["logistics"]["nMissions"] == 1
    # The engine's fission mass is the curve the power chart draws.
    kw = base["energy"]["gridPowerW"] / 1000
    assert_rel(nuclear_mass_at_kwe(DEFAULTS, kw), base["power"]["nuclearMassKg"], 1e-12)
    # The crossover is where the solar line meets that curve.
    p_crit = base["power"]["pCritW"] / 1000
    beta = base["power"]["solarMassKg"] / kw
    assert_rel(beta * p_crit, nuclear_mass_at_kwe(DEFAULTS, p_crit), 1e-9)
    assert_rel(p_crit, 2.050, 0.001)  # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    # A 10 t/day plant gains most: 261.4 t of fission system becomes 245.5 t.
    big = simulate({"targetKgPerDay": 10000})
    assert_rel(big["power"]["nuclearMassKg"] / 1000, 246.6, 0.001)  # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power
    assert big["logistics"]["nMissions"] == 6
    # A linear scale (bFissionScale 1) with v0.21's masses is the v0.21 model
    # (since v0.24, with the v0.24 cycle and radiator).
    assert_rel(simulate(V021_FISSION)["logistics"]["totalInfraMassKg"] / 1000, 49.13, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable


def test_fission_shield_scales_with_power_v021() -> None:
    # New and deliberate: the shield is MshieldKg up to FSP's 175 kWt and grows as
    # power^0.33 above it, the exponent of Mason 2025's 1,370 and 1,500 kg shields.
    assert_rel(shield_mass_kg(1370, 175, DEFAULTS["nShield"], 230) / 1500, 1, 0.005)
    assert shield_mass_kg(1676, 175, 0.33, 100) == 1676
    # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span: the pinned v0.21 masses on the v0.24 cycle and radiator move
    # the shield from 4.615 t, the fission system from 29.82 t, the slope from 25.46 kg/kW,
    # landed mass from 50.46 t, and the crossover from 2.077 kW.
    base = simulate(V021_FISSION)
    assert_rel(base["power"]["shieldMassKg"] / 1000, 4.639, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(base["power"]["nuclearMassKg"] / 1000, 28.50, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(base["power"]["nuclearSpecificKgPerKw"], 23.37, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power
    assert_rel(base["logistics"]["totalInfraMassKg"] / 1000, 49.13, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert base["logistics"]["nMissions"] == 1
    # The crossover satisfies the scaled shield (and, since v0.25, the cable's fixed mass).
    kw = base["power"]["pCritW"] / 1000
    beta = base["power"]["solarMassKg"] / (base["energy"]["gridPowerW"] / 1000)
    pinned = {**DEFAULTS, **V021_FISSION}
    shield = shield_mass_kg(pinned["MshieldKg"], shield_ref_kwe(pinned), pinned["nShield"], kw)
    # v0.27: the whole cable, designed for the crossover's power.
    cable = cable_mass_kg(pinned, kw / line_efficiency(pinned))
    assert_rel(beta * kw, shield + cable + base["power"]["nuclearSpecificKgPerKw"] * kw, 1e-9)
    assert_rel(kw, 2.410, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    # A fixed shield (nShield 0) is the v0.20 model's.
    fixed = simulate({**V021_FISSION, "nShield": 0})
    assert fixed["power"]["shieldMassKg"] == V021_FISSION["MshieldKg"]


def test_reactor_line_of_sight_horizon_v029() -> None:
    # New and deliberate: a diagnostic only. The horizon between the reactor's core and the outpost over a
    # smooth Moon, Barth & Pike's 2.4 km for a crew member's eyes; no mass depends on it.
    base = simulate({})
    assert_rel(base["power"]["horizonKm"], math.sqrt(2 * 1_737_400 * 1.7) / 1000, 1e-12)
    assert_rel(base["power"]["horizonKm"], 2.430, 0.001)
    assert horizon_km(DEFAULTS) == base["power"]["horizonKm"]
    assert "outpost-beyond-horizon" not in warning_ids(base)
    # Beyond it the shield is still charged in full, and the plant is told so.
    far = simulate({"dSeparationKm": 3})
    beyond = [w for w in far["warnings"] if w["id"] == "outpost-beyond-horizon"]
    assert [w["severity"] for w in beyond] == ["info"]
    assert far["power"]["shieldMassKg"] == fission_shield_kg({**DEFAULTS, "dSeparationKm": 3}, far["power"]["fissionThermalW"] / 1000)
    # A reactor raised on its lander deck sees farther; a buried one sits at the surface whatever its height.
    assert_rel(simulate({"hReactorM": 4})["power"]["horizonKm"], 6.158, 0.001)
    assert simulate({"fissionSiting": "buried", "hReactorM": 4})["power"]["horizonKm"] == base["power"]["horizonKm"]
    # No mass moves with either height.
    raised = simulate({"hReactorM": 10, "hOutpostM": 20})
    assert raised["logistics"]["totalInfraMassKg"] == base["logistics"]["totalInfraMassKg"]
    # A solar plant has no reactor to see.
    assert simulate({"site": "polar", "targetKgPerDay": 10})["power"]["architecture"] == "solar"
    assert "outpost-beyond-horizon" not in warning_ids(simulate({"site": "polar", "targetKgPerDay": 10, "dSeparationKm": 3}))


def test_ac_transmission_v028() -> None:
    # New and deliberate: a three-phase AC cable, insulated for its peak voltage to ground, held to the same
    # peak as the DC line. DC stays the default; the fixed mass per km is refitted to Mason's 3 kVac cable.
    assert DEFAULTS["cableForm"] == "dc"
    dc = simulate({})
    ac = simulate({"cableForm": "ac"})
    assert_rel(ac["power"]["cableVoltageV"], DEFAULTS["VCableMaxV"] * 0.5 / math.sqrt(2 / 3), 1e-12)
    assert_rel(ac["power"]["cableVoltageV"], 4899, 0.001)
    assert_rel(ac["power"]["cableMassKg"], 1110, 0.001)
    assert ac["power"]["cableLossW"] == pytest.approx(dc["power"]["cableLossW"], rel=1e-12)
    assert_rel(ac["logistics"]["totalInfraMassKg"] / 1000, 50.74, 0.001)
    # The same peak voltage to ground means the same insulation thickness on both lines.
    sent_kw = (dc["energy"]["gridPowerW"] + dc["power"]["cableLossW"]) / 1000
    assert_rel(
        cable_design({**DEFAULTS, "cableForm": "ac"}, sent_kw)["insulationM"], cable_design(DEFAULTS, sent_kw)["insulationM"], 1e-12
    )
    assert_rel(simulate({"cableForm": "ac", "targetKgPerDay": 10000})["logistics"]["totalInfraMassKg"] / 1000, 455.8, 0.001)
    # An unsupported form resets to DC and says so.
    reset = simulate({"cableForm": "hvdc"})
    assert reset["power"]["cableMassKg"] == dc["power"]["cableMassKg"]
    assert "param-clamped" in warning_ids(reset)


def test_cable_voltage_designed_for_its_power_v027() -> None:
    # New and deliberate: the cable's voltage minimizes conductor, insulation, and jacket mass for the
    # power it carries, capped at VCableMaxV, in place of v0.25's fixed 3 kV conductor.
    base = simulate({})
    power = base["power"]
    assert power["cableVoltageV"] == DEFAULTS["VCableMaxV"] == 8000
    assert_rel(power["cableMassKg"], 726, 0.001)  # v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    sent_kw = (base["energy"]["gridPowerW"] + power["cableLossW"]) / 1000
    design = cable_design(DEFAULTS, sent_kw)
    assert_rel(design["conductorKgPerKm"], 286.9, 0.001)
    assert_rel(design["insulationKgPerKm"], 112.2, 0.001)
    assert_rel(design["jacketKgPerKm"], 83.8, 0.001)
    designed = design["conductorKgPerKm"] + design["insulationKgPerKm"] + design["jacketKgPerKm"]
    assert_rel(power["cableMassKg"], DEFAULTS["dSeparationKm"] * (DEFAULTS["kCableKgPerKm"] + designed), 1e-12)
    assert_rel(base["logistics"]["totalInfraMassKg"] / 1000, 50.35, 0.001)  # v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    # Below the cap a small plant's cable runs at its own optimum.
    assert cable_design(DEFAULTS, 40)["voltageV"] < DEFAULTS["VCableMaxV"]
    # The cap binds a megawatt plant: uncapped it would run near 18 kV; at v0.25's 3 kV it is 3.3 times heavier.
    uncapped = simulate({"VCableMaxV": 30000})["power"]
    assert_rel(uncapped["cableVoltageV"], 17887, 0.001)
    assert uncapped["cableMassKg"] < power["cableMassKg"]
    assert_rel(simulate({"VCableMaxV": 3000})["power"]["cableMassKg"], 2571, 0.001)  # v0.28: cable fixed mass refitted to Mason's 3 kVac cable


def test_buried_fission_reactor_v026() -> None:
    # New and deliberate: a buried reactor's shield is FSP 2008's 1,676 kg emplaced shield, grown with
    # heat and independent of separation. Surface siting stays the default, and the default plant does not move.
    assert_rel(simulate({})["logistics"]["totalInfraMassKg"] / 1000, 50.35, 0.001)  # v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    buried = {"fissionSiting": "buried", "dSeparationKm": 0.1}
    base = simulate(buried)
    power = base["power"]
    assert_rel(power["shieldMassKg"], 4616, 0.001)
    assert_rel(power["cableMassKg"], 72, 0.002)  # v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(power["cableLossW"] / 1000, 1.65, 0.01)
    assert_rel(power["nuclearMassKg"] / 1000, 29.53, 0.001)  # v0.27: cable voltage designed for its power
    assert_rel(base["logistics"]["totalInfraMassKg"] / 1000, 50.16, 0.001)  # v0.27: cable voltage designed for its power
    # Separation no longer sizes the shield, so a buried reactor is lightest next to the outpost.
    heat_kw = power["fissionThermalW"] / 1000
    far = {**DEFAULTS, **buried, "dSeparationKm": 2}
    assert fission_shield_kg(far, heat_kw) == fission_shield_kg({**DEFAULTS, **buried}, heat_kw)
    assert base["logistics"]["totalInfraMassKg"] < simulate({**buried, "dSeparationKm": 0.5})["logistics"]["totalInfraMassKg"]
    # A 10 t/day plant saves most of its cable (20.7 t at v0.26's 3 kV; 3.7 t since v0.27).
    assert_rel(simulate({**buried, "targetKgPerDay": 10000})["logistics"]["totalInfraMassKg"] / 1000, 447.7, 0.001)  # v0.27: cable voltage designed for its power
    # An unsupported siting resets to the surface and says so.
    reset = simulate({"fissionSiting": "underground"})
    assert reset["power"]["shieldMassKg"] == simulate({})["power"]["shieldMassKg"]
    assert "param-clamped" in warning_ids(reset)


def test_fission_shield_and_cable_with_separation_v025() -> None:
    # New and deliberate: the shield is Mason 2025's 1,370 kg at 1 km and goes as separation^-0.97,
    # and a cable to the outpost is charged by its length, with a conductor sized for its loss.
    base = simulate({})
    power = base["power"]
    assert_rel(power["shieldMassKg"], 3792, 0.001)
    assert_rel(power["cableMassKg"], 726, 0.001)  # v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    # v0.27 retired v0.25's fixed 3 kV conductor (2.026 kg per kW and km): the cable is designed at 8 kV.
    sent_kw = (base["energy"]["gridPowerW"] + base["power"]["cableLossW"]) / 1000
    assert cable_design(DEFAULTS, sent_kw)["voltageV"] == DEFAULTS["VCableMaxV"] == base["power"]["cableVoltageV"]
    sent_w = base["energy"]["gridPowerW"] / line_efficiency(DEFAULTS)
    assert_rel(power["cableLossW"], sent_w - base["energy"]["gridPowerW"], 1e-12)
    assert_rel(power["cableLossW"] / sent_w, 0.0167, 1e-12)
    assert_rel(power["nuclearMassKg"] / 1000, 29.72, 0.001)  # v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(base["logistics"]["totalInfraMassKg"] / 1000, 50.35, 0.001)  # v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    # Half the separation nearly doubles the shield; the cable halves.
    near = simulate({"dSeparationKm": 0.5})["power"]
    assert_rel(near["shieldMassKg"] / power["shieldMassKg"], 2**0.97, 0.005)
    assert near["cableMassKg"] < power["cableMassKg"] / 2

    # The lightest separation falls with plant size, as Mason 2001's optimized separations do.
    # v0.27: with the cable designed for its power, about 1.75 km for the default plant (1.15 km at
    # v0.25's 3 kV), 1 km at 10 t/day (0.6 km), and 2 km at the pole (1.5 km).
    def landed(params: dict[str, float], km: float) -> float:
        return simulate({**params, "dSeparationKm": km})["logistics"]["totalInfraMassKg"]

    assert landed({}, 1.75) < min(landed({}, 1.25), landed({}, 2.25))
    assert landed({"targetKgPerDay": 10000}, 1) < min(landed({"targetKgPerDay": 10000}, 0.7), landed({"targetKgPerDay": 10000}, 1.4))
    assert landed({"site": "polar"}, 2) < min(landed({"site": "polar"}, 1.5), landed({"site": "polar"}, 2.5))


def test_brayton_optimum_pressure_ratio_and_radiator_span_v024() -> None:
    # New and deliberate: the cycle runs at its best pressure ratio, and the radiator
    # spans the gas cooler instead of sitting at the compressor inlet.
    cycle = brayton_cycle(DEFAULTS)
    assert_rel(cycle["pressureRatio"], 1.866, 0.001)
    assert_rel(cycle["coolerInletK"], 576.0, 0.001)
    held = brayton_cycle_at(DEFAULTS, 2.0)
    assert held["netWorkK"] / held["heatInK"] < cycle["netWorkK"] / cycle["heatInK"]
    assert radiator_temperatures_k(DEFAULTS) == pytest.approx((350, 526.0), rel=0.001)
    base = simulate({})
    assert_rel(base["power"]["radiatorEffectiveK"], 419.9, 0.001)
    assert_rel(base["power"]["radiatorM2"], 2534, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(base["power"]["radiatorMassKg"] / 1000, 9.808, 0.001)  # v0.25: shield at its separation, cable to the outpost
    rejected_w = base["power"]["fissionThermalW"] - base["energy"]["gridPowerW"] - base["power"]["cableLossW"]
    assert_rel(base["power"]["radiatorM2"] * radiator_flux_w_per_m2(DEFAULTS), rejected_w, 1e-9)
    # The lightest radiator cold end, against Mason 2006's 400 K and 380 K.
    def at(params: dict[str, float]) -> float:
        return simulate(params)["power"]["nuclearMassKg"]

    assert at({"Tsink": 410}) < min(at({"Tsink": 400}), at({"Tsink": 430}))
    assert at({"Tsource": 900, "Tsink": 374}) < min(at({"Tsource": 900, "Tsink": 360}), at({"Tsource": 900, "Tsink": 390}))
    # A Stirling radiator still sits at its cold end.
    assert simulate({"fissionConverter": "stirling"})["power"]["radiatorEffectiveK"] == DEFAULTS["Tsink"]
    # A radiator loop that reaches its environment cannot reject heat.
    cold = simulate({"Tsink": 300, "dTGasCoolerK": 100})
    assert [w["severity"] for w in cold["warnings"] if w["id"] == "radiator-temperature"] == ["alarm"]


# v0.21 scales the shield with power and recalibrates the reactor and conversion
# masses; the v0.19 and v0.20 anchors pin the fission inputs they were written for.
V020_FISSION = {"kReactorKgPerKwt": 2.25, "kConversionKgPerKwe": 8.47, "nShield": 0, "bFissionScale": 1, "MshieldKg": 1676}


def test_fission_defaults_calibrated_to_nasa_surface_brayton_v019() -> None:
    # New and deliberate: Mason 2006's design point, FSP's shield, Mason 2001's marginal slope.
    # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span: the radiator spans the gas cooler, so with
    # the pinned v0.20 masses it moves from 3,124 m^2 and 12.09 t, the slope from 29.24 kg/kW,
    # the fission system from 30.63 t, and landed mass from 51.26 t. The design point holds.
    base = simulate(V020_FISSION)
    assert_rel(base["power"]["fissionThermalW"] / (base["energy"]["gridPowerW"] + base["power"]["cableLossW"]), 1 / 0.2630, 0.001)
    assert_rel(base["power"]["radiatorM2"], 2534, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(base["power"]["radiatorMassKg"] / 1000, 9.808, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(base["power"]["nuclearSpecificKgPerKw"], 27.22, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power
    assert_rel(base["power"]["nuclearMassKg"] / 1000, 29.35, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(base["logistics"]["totalInfraMassKg"] / 1000, 49.98, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert base["logistics"]["nMissions"] == 1

    # v0.19's disclosed 570 K optimum belonged to the fixed fraction of Carnot;
    # v0.20 replaced it with the Brayton cycle (see the v0.20 test).


def test_fission_efficiency_from_the_brayton_cycle_v020() -> None:
    # New and deliberate: Fuller 2010's components, a 5% loop pressure loss fitted to Mason 2006's 26.3%.
    # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span: the 5.15% loss is refitted at the best pressure ratio, so
    # 26.27% becomes 26.30%, and Mason's unfitted 900/380 K point moves from 15.47% to 16.62% (15.6%).
    assert_rel(fission_efficiency(DEFAULTS), 0.2630, 0.001)
    assert_rel(fission_efficiency({**DEFAULTS, "Tsource": 900, "Tsink": 380}), 0.1662, 0.001)

    def at(tsink: float) -> float:
        return simulate({**V020_FISSION, "Tsink": tsink})["power"]["nuclearMassKg"]

    # The optimum moves from v0.19's 570 K to near 420 K, against Mason's 400 K.
    # v0.24: Brayton pressure ratio at its optimum, radiator over the gas span: it moves to near 414 K, and a 570 K radiator
    # costs less than the 3 times v0.20 charged, since the radiator now runs warmer than its cold end.
    assert at(410) < at(400)
    assert at(410) < at(430)
    assert at(570) > 1.8 * at(410)
    assert_rel(at(420) / 1000, 29.23, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    dead = simulate({**V020_FISSION, "Tsink": 650})
    assert dead["power"]["architecture"] == "solar"
    assert [w["severity"] for w in dead["warnings"] if w["id"] == "fission-no-net-work"] == ["caution"]
    assert "fission-no-net-work" not in warning_ids(simulate(V020_FISSION))


# v0.19 calibrated the fission defaults to Mason 2006/2001 and NASA FSP. The v0.17
# and v0.18 anchors pin the fission inputs they were written for, so what they test holds.
# Their model was 27.5% of efficiency, a fixed 0.55 of Carnot at 1200/600 K, with the radiator
# at the sink temperature: since v0.24 that is exactly the Stirling converter's model.
V018_FISSION = {
    "fissionConverter": "stirling",
    "fCarnotStirling": 0.55,
    "Tsource": 1200,
    "Tsink": 600,
    "MshieldKg": 1500,
    "kReactorKgPerKwt": 3.87,
    "kConversionKgPerKwe": 13.93,
    "kConversionStirlingKgPerKwe": 13.93,
    "nShield": 0,
    "bFissionScale": 1,
    "bStirlingScale": 1,
}


def test_fission_radiator_charged_by_its_area_v017() -> None:
    # New and deliberate: alphaSpecific 30 -> 28 kg/kW plus kRadiatorKgPerM2 per m^2 of radiator.
    base = simulate(V018_FISSION)
    assert_rel(base["power"]["radiatorM2"], 515.4, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(base["power"]["radiatorMassKg"] / 1000, 1.995, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(base["power"]["nuclearSpecificKgPerKw"], 30.49, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power
    assert_rel(base["power"]["nuclearMassKg"] / 1000, 32.41, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(base["logistics"]["totalInfraMassKg"] / 1000, 53.04, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    # The 400 K case's 7.4 t radiator and 33.18 t fission system belonged to the
    # fixed fraction of Carnot; v0.20 retired them. A colder radiator is still charged by its area.
    cold = simulate({**V018_FISSION, "Tsink": 400})
    assert cold["power"]["radiatorM2"] > base["power"]["radiatorM2"]
    assert_rel(cold["power"]["radiatorMassKg"], DEFAULTS["kRadiatorKgPerM2"] * cold["power"]["radiatorM2"], 1e-12)


def test_fission_reactor_charged_on_its_heat_v018() -> None:
    # New and deliberate: alphaSpecific split into reactor per kWt and conversion per kWe.
    base = simulate(V018_FISSION)
    assert_rel(base["power"]["fissionThermalW"] / 1e6, 3.661, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(V018_FISSION["kReactorKgPerKwt"] * base["power"]["fissionThermalW"] / 1e6, 14.17, 0.001)  # v0.25: shield at its separation, cable to the outpost
    assert_rel(base["power"]["nuclearMassKg"] / 1000, 32.41, 0.001)  # v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    for run in (base, simulate({**V018_FISSION, "Tsink": 400})):
        kw = run["energy"]["gridPowerW"] / 1000
        # v0.25: conversion on the sent power, which covers the cable's loss.
        # v0.27: the cable leaves the slope and is charged on its own.
        sent_kw = kw + run["power"]["cableLossW"] / 1000
        slope = (
            V018_FISSION["kReactorKgPerKwt"] * (run["power"]["fissionThermalW"] / 1000) / kw
            + V018_FISSION["kConversionKgPerKwe"] * sent_kw / kw
            + DEFAULTS["kRadiatorKgPerM2"] * run["power"]["radiatorM2"] / kw
        )
        assert_rel(run["power"]["nuclearSpecificKgPerKw"], slope, 1e-9)

    # The 520 K optimum belonged to the fixed fraction of Carnot; v0.20 retired it.


def test_sizing_the_plant_to_its_refuelling_demand_v016() -> None:
    # New and deliberate: size_to_demand finds the smallest target at which every
    # component the plant makes meets the lander's demand; simulate() does not change.
    crew = {"refuelDemand": "lander"}
    crew_size = size_to_demand(crew)
    assert_rel(crew_size["targetKgPerDay"], 111.14, 0.001)
    crew_sized = simulate({**crew, "targetKgPerDay": crew_size["targetKgPerDay"]})
    assert_rel(crew_sized["logistics"]["totalInfraMassKg"] / 1000, 14.31, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(crew_sized["campaign"]["returnRatio"], 0.9190, 0.001)  # v0.21: shield scales with power; v0.24: Brayton pressure ratio at its optimum, radiator over the gas span
    assert crew_sized["campaign"]["paysBackInCampaign"] is False
    polar = {"site": "polar", "polarProduct": "propellant", "refuelDemand": "lander"}
    polar_size = size_to_demand(polar)
    assert polar_size["limitedBy"] == "hydrogen"
    assert_rel(polar_size["targetKgPerDay"], 166.71, 0.001)
    polar_sized = simulate({**polar, "targetKgPerDay": polar_size["targetKgPerDay"]})
    assert_rel(polar_sized["logistics"]["totalInfraMassKg"] / 1000, 22.90, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.24: Brayton pressure ratio at its optimum, radiator over the gas span; v0.25: shield at its separation, cable to the outpost; v0.27: cable voltage designed for its power; v0.28: cable fixed mass refitted to Mason's 3 kVac cable
    assert_rel(polar_sized["campaign"]["returnRatio"], 1.0247, 0.001)  # v0.21: shield scales with power; v0.24: Brayton pressure ratio at its optimum, radiator over the gas span
    assert polar_sized["campaign"]["paybackDays"] == polar_sized["campaign"]["campaignEndDay"]
    assert simulate(polar)["campaign"]["paysBackInCampaign"] is False
    busy = {**polar, "sortiesPerYear": 20}
    busy_sized = simulate({**busy, "targetKgPerDay": size_to_demand(busy)["targetKgPerDay"]})
    assert_rel(busy_sized["production"]["targetKgPerDay"], 3334.3, 0.001)
    assert busy_sized["logistics"]["nMissions"] == 3
    assert_rel(busy_sized["campaign"]["returnRatio"], 5.316, 0.001)  # v0.19: fission calibrated to Mason and FSP; v0.21: shield scales with power; v0.22: fission economy of scale; v0.25: shield at its separation, cable to the outpost
    assert busy_sized["campaign"]["netLeoMassKg"] > simulate(busy)["campaign"]["netLeoMassKg"]


def test_initial_overburden_strip_runs_alongside_commissioning_v015() -> None:
    # New and deliberate: the default strips finish inside commissioning.
    polar = simulate({"site": "polar"})
    assert_rel(polar["excavation"]["initialStripDays"], 11.54, 0.001)
    assert polar["campaign"]["firstProductDay"] == DEFAULTS["commissioningDays"]
    assert simulate({})["excavation"]["initialStripDays"] == 0
    basalt = simulate({"equatorialProcess": "ilmenite", "ilmFeed": "basalt", "stripAheadDays": 90})
    assert_rel(basalt["campaign"]["firstProductDay"], 47.09, 0.001)
    assert_rel(basalt["campaign"]["paybackDays"], 262.7, 0.001)
    nasa = simulate({
        "site": "polar", "polarProduct": "propellant", "targetKgPerDay": 67.26,
        "plantAvailability": 0.611, "commissioningDays": 2, "stripAheadDays": 223,
    })
    assert_rel(nasa["campaign"]["firstProductDay"], 49.04, 0.001)
