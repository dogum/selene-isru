from __future__ import annotations

import pytest

from selene_isru import sample_uncertainty, simulate, simulate_timeseries
from selene_isru.constants import DEFAULTS
from selene_isru.modules.construction import shield_full_balance_m, simulate_construction
from selene_isru.modules.electrolysis import melt_heat_j_per_kg, oxide_model_yield, sec_elec_j_per_kg
from selene_isru.modules.logistics import payload_per_mission_kg
from selene_isru.modules.power import p_crit_kw, simulate_power
from selene_isru.modules.sabatier import sabatier_kp
from selene_isru.modules.thermal import sec_sub_j_per_kg

J_PER_KWH = 3_600_000


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
    # v0.6 moved these from 24.78 kWh/kg and 1,032 kW (LOX conditioning 2.2 -> 1.32 kWh/kg).
    assert_rel(result["energy"]["secTotal_kWhPerKg"], 23.9, 0.03)
    assert_rel(result["energy"]["gridPowerW"] / 1000, 996, 0.03)
    assert_rel(p_crit_kw(1500, 250, 30), 6.818, 0.001)
    assert_rel(sec_sub_j_per_kg(0.005, 800, 40, 263) / J_PER_KWH, 10.7, 0.01)
    assert_rel(sec_sub_j_per_kg(0.05, 800, 40, 263) / J_PER_KWH, 1.78, 0.01)
    assert result["logistics"]["nMissions"] == 1
    assert result["logistics"]["totalInfraMassKg"] / 1000 == result["logistics"]["plantMassThroughputDays"]
    assert 55 <= result["logistics"]["plantMassThroughputDays"] <= 62
    assert_rel(shield_full_balance_m(101325, 3000), 20.85, 0.005)
    assert 95_000 <= payload_per_mission_kg(DEFAULTS) <= 107_000
    assert 1.8 <= result["construction"]["padsPerYear"] <= 2.2
    assert sabatier_kp(523) > sabatier_kp(723) > 0


def test_polar_chain_charges_capture_heater_and_extractor_v04() -> None:
    # v0.4 deliberately moved these from 2.814 kWh/kg and 19.5 t.
    polar = simulate({"site": "polar"})
    assert polar["production"]["regolithKgPerDay"] == pytest.approx(1000 / (0.05 * 0.75), rel=1e-12)
    assert_rel(polar["thermal"]["extractorMassKg"], 4800, 1e-9)
    assert_rel(polar["thermal"]["secSub_JPerKg"] / J_PER_KWH, 1.78 / 0.75, 0.01)
    assert_rel(polar["energy"]["secTotal_kWhPerKg"], 7.24, 0.01)
    assert_rel(polar["logistics"]["totalInfraMassKg"] / 1000, 29.85, 0.01)
    assert polar["materials"]["maxAbsResidualKgPerDay"] == 0


def test_campaign_ledger_equatorial_payback_v05() -> None:
    # v0.5 adds the ledger; no earlier number moves.
    result = simulate({})
    logistics, campaign = result["logistics"], result["campaign"]
    leo_per_kg = DEFAULTS["M0leo"] / (DEFAULTS["etaPack"] * logistics["payloadPerMissionKg"])
    net_per_day = (
        DEFAULTS["gearRatio"] * DEFAULTS["targetKgPerDay"] * DEFAULTS["plantAvailability"]
        - leo_per_kg * DEFAULTS["sparesFracPerYear"] * logistics["totalInfraMassKg"] / 365
    )
    assert_rel(campaign["paybackDays"], DEFAULTS["commissioningDays"] + DEFAULTS["M0leo"] / net_per_day, 1e-12)
    assert_rel(campaign["paybackDays"], 242.0, 0.001)
    assert_rel(campaign["returnRatio"], 6.63, 0.001)
    assert campaign["paysBackInCampaign"] is True
    sabatier = simulate({"site": "polar", "enableSabatier": True})["campaign"]
    assert sabatier["paybackDays"] is None
    assert_rel(sabatier["returnRatio"], 0.793, 0.001)


def test_polar_propellant_mode_v06() -> None:
    result = simulate({"site": "polar", "polarProduct": "propellant"})
    production = result["production"]
    assert_rel(production["propellantKgPerDay"], 7 * production["h2KgPerDay"], 1e-12)
    assert_rel(production["excessO2KgPerDay"], production["o2KgPerDay"] - 6 * production["h2KgPerDay"], 1e-12)
    assert [item["stream"] for item in result["cryo"]["inventories"]] == ["water-ice", "lox", "lh2"]
    assert_rel(result["energy"]["secTotal_kWhPerKg"], 20.78, 0.001)
    assert_rel(result["logistics"]["totalInfraMassKg"] / 1000, 82.35, 0.001)
    assert_rel(result["campaign"]["paybackDays"], 311.3, 0.001)
    assert result["logistics"]["productKgPerDay"] == production["propellantKgPerDay"]
    assert_rel(result["logistics"]["leverageL"], 103.4, 0.001)
    sabatier = simulate({"site": "polar", "enableSabatier": True})
    assert_rel(sabatier["logistics"]["leverageL"], 186.0, 0.001)


def test_refuelling_demand_v07() -> None:
    crew = simulate({"refuelDemand": "lander"})
    assert_rel(crew["refuel"]["propellantPerSortieKg"], 42_595, 0.001)
    assert_rel(crew["refuel"]["demandO2KgPerDay"], 100.0, 0.001)
    assert_rel(crew["logistics"]["totalInfraMassKg"] / 1000, 61.69, 0.001)
    assert crew["campaign"]["paysBackInCampaign"] is False
    assert_rel(crew["campaign"]["returnRatio"], 0.732, 0.001)
    matched = simulate({"refuelDemand": "lander", "sortiesPerYear": 9})
    assert_rel(matched["campaign"]["paybackDays"], 242.2, 0.001)


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
        "alphaSpecific": 90,
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
    assert_rel(result["plantMassThroughputDays"]["p50"], 60.3325320797489, 1e-12)
    assert_rel(result["secTotal"]["p50"], 23.897402251765627, 1e-12)


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
    power_params.update({"alphaSpecific": 1000})
    power = simulate_power(power_params, 1000)
    assert "beta-le-alpha" in {warning["id"] for warning in power["warnings"]}
