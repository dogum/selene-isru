from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from selene_isru import (
    cable_design,
    cable_mass_kg,
    fission_efficiency,
    fission_shield_kg,
    horizon_km,
    line_efficiency,
    nuclear_mass_at_kwe,
    radiator_flux_w_per_m2,
    radiator_m2_per_kw,
    shield_mass_kg,
    simulate,
)
from selene_isru.constants import DEFAULTS, PARAM_META, c
from selene_isru.modules.electrolysis import sec_elec_j_per_kg
from selene_isru.modules.thermal import sec_sub_j_per_kg

ROOT = Path(__file__).resolve().parents[2]
SUITE = json.loads((ROOT / "packages" / "engine" / "test" / "fixtures" / "external-benchmarks.json").read_text(encoding="utf-8"))
J_PER_KWH = 3_600_000


def item(benchmark_id: str) -> dict:
    return next(row for row in SUITE["benchmarks"] if row["id"] == benchmark_id)


def assert_benchmark(actual: float, benchmark_id: str) -> None:
    row = item(benchmark_id)
    assert actual == pytest.approx(row["expected"], rel=row["relativeTolerance"])


def test_faraday_anchor() -> None:
    row = item("faraday-o2-default")
    assert_benchmark(sec_elec_j_per_kg(row["inputs"]["cellVoltageV"], row["inputs"]["currentEfficiency"]) / J_PER_KWH, row["id"])


@pytest.mark.parametrize("benchmark_id", ["polar-sublimation-5wt", "polar-sublimation-0p5wt"])
def test_sublimation_anchors(benchmark_id: str) -> None:
    row = item(benchmark_id)
    values = row["inputs"]
    assert_benchmark(sec_sub_j_per_kg(values["iceMassFraction"], values["regolithHeatCapacity"], values["startTemperatureK"], values["sublimationTemperatureK"]) / J_PER_KWH, benchmark_id)


def test_site_profile_anchor_and_open_mli_status() -> None:
    expected = item("shackleton-rim-profile")["expected"]
    assert DEFAULTS["polarIlluminationFraction"] == expected["illuminationFraction"]
    assert DEFAULTS["polarLongestShadowHours"] == expected["longestShadowHours"]
    assert item("mli-layer-density-units")["kind"] == "open"


def test_polar_defaults_inside_best_site_darkness_range() -> None:
    expected = item("connecting-ridge-best-site")["expected"]
    assert DEFAULTS["polarLongestShadowHours"] <= expected["longestDarknessDaysMax"] * 24
    assert DEFAULTS["polarIlluminationFraction"] < expected["illuminationFraction2m"]


def test_polar_extraction_calibration_reproduces_nasa_baseline() -> None:
    row = item("kleinhenz-paz-2020-polar-water")
    result = simulate({"site": "polar", **row["inputs"]})
    thermal = result["thermal"]
    heater_power_kw = (thermal["secSub_JPerKg"] + thermal["heaterLoss_JPerKg"]) * row["inputs"]["targetKgPerDay"] / 86_400 / 1000
    assert thermal["extractorMassKg"] == pytest.approx(row["expected"]["extractorMassKg"], rel=row["relativeTolerance"])
    assert heater_power_kw == pytest.approx(row["expected"]["heaterPowerKW"], rel=row["relativeTolerance"])


def test_polar_propellant_calibration_reproduces_nasa_baseline() -> None:
    row = item("kleinhenz-paz-2020-polar-propellant")
    result = simulate({"site": "polar", "polarProduct": "propellant", **row["inputs"]})
    streams = {inventory["stream"]: inventory for inventory in result["cryo"]["inventories"]}
    plant = next(entry["massKg"] for entry in result["logistics"]["manifest"] if entry["subsystem"] == "reactor/plant")
    electrolysis = next(entry for entry in result["energy"]["balances"] if entry["id"] == "water-electrolysis-energy")
    actual = {
        "electrolysisPowerKW": electrolysis["electricalInputW"] / 1000,
        "h2LiquefactionPowerKW": streams["lh2"]["conditioningPowerW"] / 1000,
        "o2LiquefactionPowerKW": streams["lox"]["conditioningPowerW"] / 1000,
        "electrolyzerMassKg": plant - result["thermal"]["extractorMassKg"],
        "h2LiquefierMassKg": streams["lh2"]["liquefierMassKg"],
        "o2LiquefierMassKg": streams["lox"]["liquefierMassKg"],
    }
    for key, value in row["expected"].items():
        assert actual[key] == pytest.approx(value, rel=row["relativeTolerance"]), key


def test_fission_slope_from_nasa_surface_brayton_scaling_v019() -> None:
    row = item("mason-2001-surface-brayton-scaling")
    assert row["kind"] == "calibration"
    i = row["inputs"]
    mass_100 = i["power100Kwe"] * i["specificMass100KgPerKwe"]
    mass_500 = i["power500Kwe"] * i["specificMass500KgPerKwe"]
    marginal = (mass_500 - mass_100) / (i["power500Kwe"] - i["power100Kwe"])
    assert marginal == pytest.approx(row["expected"], rel=1e-9)
    # v0.21: the shield grows with power, so the model's marginal mass between the
    # two systems, shield included, is Mason's. v0.22: so does the reactor and
    # conversion's economy of scale; the model lands 2.55 t lighter at both.
    # v0.24: the radiator spans the gas cooler, so the refit lands 2.52 t lighter.
    # v0.25: the shield at its 1 km separation and the cable to the outpost; 2.55 t.
    # v0.27: the cable designed for its power; 2.46 t.
    # v0.28: the cable's fixed mass refitted to Mason 2025's 3 kVac cable; 2.53 t.
    def model_kg(kwe: float) -> float:
        return nuclear_mass_at_kwe(DEFAULTS, kwe)

    model_marginal = (model_kg(i["power500Kwe"]) - model_kg(i["power100Kwe"])) / (i["power500Kwe"] - i["power100Kwe"])
    assert model_marginal == pytest.approx(marginal, rel=0.001)
    assert mass_100 - model_kg(i["power100Kwe"]) == pytest.approx(2532, rel=0.01)
    assert mass_500 - model_kg(i["power500Kwe"]) == pytest.approx(2532, rel=0.01)


def test_fission_economy_of_scale_from_nasa_spacecraft_brayton_v022() -> None:
    row = item("mason-2001-spacecraft-brayton-scaling")
    assert row["kind"] == "calibration"
    i = row["inputs"]
    mass = [i["power100Kwe"] * i["specificMass100KgPerKwe"], i["power1000Kwe"] * i["specificMass1000KgPerKwe"],
            i["power10000Kwe"] * i["specificMass10000KgPerKwe"]]
    exponent = math.log10((mass[2] - mass[1]) / (mass[1] - mass[0]))
    assert exponent == pytest.approx(row["expected"], rel=1e-3)
    assert DEFAULTS["bFissionScale"] == pytest.approx(exponent, rel=0.005)
    # Not fitted: the model's mass without its shield grows 9.4 times from 1 to
    # 10 MWe, against Mason's 8.9: its radiator stays linear.
    def variable_kg(kwe: float) -> float:
        heat_kw = kwe / fission_efficiency(DEFAULTS)
        shield = shield_mass_kg(DEFAULTS["MshieldKg"], DEFAULTS["QshieldRefKwt"], DEFAULTS["nShield"], heat_kw)
        return nuclear_mass_at_kwe(DEFAULTS, kwe) - shield

    fixed = mass[0] - (mass[1] - mass[0]) / (i["power1000Kwe"] ** exponent - i["power100Kwe"] ** exponent) * i["power100Kwe"] ** exponent
    mason_ratio = (mass[2] - fixed) / (mass[1] - fixed)
    assert mason_ratio == pytest.approx(8.88, rel=0.002)
    assert variable_kg(10000) / variable_kg(1000) == pytest.approx(mason_ratio, rel=0.08)


def test_fission_shield_and_cable_with_separation_v025() -> None:
    row = item("mason-2025-fsp-separation")
    assert row["kind"] == "calibration"
    i = row["inputs"]
    exponent = math.log(i["shield05Kg"] / i["shield2Kg"]) / math.log(i["separation2Km"] / i["separation05Km"])
    assert DEFAULTS["nShieldDistance"] == pytest.approx(exponent, rel=0.005)
    assert DEFAULTS["MshieldKg"] == i["shield1Kg"]

    # v0.28: Mason's own cable, 3 kVac: an AC line whose peak voltage to ground is 3 kV x sqrt(2/3).
    mason_cable = {"cableForm": "ac", "VCableMaxV": 2 * i["cableVoltsAc"] * math.sqrt(2 / 3)}

    def at(km: float) -> dict:
        return {**DEFAULTS, **mason_cable, "dSeparationKm": km}

    def cable(km: float) -> float:
        return cable_mass_kg(at(km), i["userPowerKwe"] / line_efficiency(at(km)))

    assert cable_design(at(1), i["userPowerKwe"])["voltageV"] == pytest.approx(i["cableVoltsAc"], rel=1e-9)

    for km, shield in ((i["separation05Km"], i["shield05Kg"]), (i["separation2Km"], i["shield2Kg"])):
        assert fission_shield_kg(at(km), i["reactorThermalKwt"]) == pytest.approx(shield, rel=0.01)
    # The cable grows as Mason's user interface pallet does: 385 kg/km by least squares.
    xs = [i["separation05Km"], i["separation1Km"], i["separation2Km"]]
    ys = [i["pallet05Kg"], i["pallet1Kg"], i["pallet2Kg"]]
    mx, my = sum(xs) / 3, sum(ys) / 3
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    assert cable(1) == pytest.approx(slope, rel=0.005)
    assert cable(2) - cable(0.5) == pytest.approx(i["pallet2Kg"] - i["pallet05Kg"], rel=0.02)

    # Not fitted: the shield-plus-cable minimum, against Mason's 1.8 km.
    def system(km: float) -> float:
        return fission_shield_kg(at(km), i["reactorThermalKwt"]) + cable(km)

    best = min((k / 100 for k in range(20, 500)), key=system)
    assert best == pytest.approx(i["optimumSeparationKm"], rel=0.05)


def test_cable_voltage_from_nasa_transmission_studies_v027() -> None:
    row = item("barth-pike-2022-cable-voltage")
    assert row["kind"] == "documentation-only"
    i = row["inputs"]

    def design(kw: float, km: float, efficiency: float) -> dict[str, float]:
        params = {**DEFAULTS, "fCableLossPerKm": (1 - efficiency) / km, "VCableMaxV": 30000}
        return cable_design(params, kw)

    barth = design(i["barthPowerKw"], i["barthLengthKm"], i["barthEfficiency"])
    assert barth["voltageV"] / 2 == pytest.approx(row["expected"], rel=0.02)
    # v0.28: the three-phase AC line, insulated for its peak voltage, and heavier than the DC line.
    ac_params = {**DEFAULTS, "cableForm": "ac", "fCableLossPerKm": (1 - i["barthEfficiency"]) / i["barthLengthKm"], "VCableMaxV": 30000}
    barth_ac = cable_design(ac_params, i["barthPowerKw"])
    assert barth_ac["voltageV"] / math.sqrt(3) == pytest.approx(i["barthAcOptimumVoltsToNeutral"], rel=0.02)

    def per_km(d: dict[str, float]) -> float:
        return d["conductorKgPerKm"] + d["insulationKgPerKm"] + d["jacketKgPerKm"]

    assert per_km(barth_ac) > per_km(barth)
    oleson = design(i["olesonPowerKwe"], i["olesonLengthKm"], i["olesonEfficiency"])
    assert oleson["conductorAreaM2"] == c("AConductorMinM2")
    assert oleson["voltageV"] / 2 == pytest.approx(i["olesonOptimumVoltsToNeutral"], rel=0.12)
    mass = (oleson["conductorKgPerKm"] + oleson["insulationKgPerKm"] + oleson["jacketKgPerKm"]) * i["olesonLengthKm"]
    assert mass == pytest.approx(i["olesonCableMassKg"], rel=0.15)


def test_lunar_horizon_from_nasa_transmission_study_v029() -> None:
    row = item("barth-pike-2022-lunar-horizon")
    assert row["kind"] == "documentation-only"
    i = row["inputs"]
    assert DEFAULTS["hOutpostM"] == i["eyeHeightM"]
    assert DEFAULTS["hReactorM"] == 0
    # A crew member's eyes see 2.4 km over a smooth Moon; 3 km puts the reactor beyond it.
    assert horizon_km(DEFAULTS) == pytest.approx(i["horizonKm"], rel=0.02)
    far = simulate({"dSeparationKm": i["separationKm"]})
    assert any(w["id"] == "outpost-beyond-horizon" for w in far["warnings"])
    # Disclosed: terrain shielding is not credited; the shield is the same as without the note.
    far_params = {**DEFAULTS, "dSeparationKm": i["separationKm"]}
    assert far["power"]["shieldMassKg"] == fission_shield_kg(far_params, far["power"]["fissionThermalW"] / 1000)


def test_buried_fission_shield_from_nasa_fsp_v026() -> None:
    row = item("mason-2008-fsp-emplaced-shield")
    assert row["kind"] == "calibration"
    i = row["inputs"]
    assert DEFAULTS["MshieldBuriedKg"] == row["expected"] == i["shieldKg"]
    assert DEFAULTS["QshieldRefKwt"] == i["reactorThermalKwt"]
    buried = {**DEFAULTS, "fissionSiting": "buried"}
    # The regolith shields the outpost, so separation does not size the shield.
    for km in (i["separationKm"], 1, 5):
        assert fission_shield_kg({**buried, "dSeparationKm": km}, i["reactorThermalKwt"]) == i["shieldKg"]
    # Not reproduced: older on-board shields made landed systems about twice as heavy; the model's
    # surface shield is Mason 2025's directional shield, lighter at 1 km than the buried one.
    surface = fission_shield_kg(DEFAULTS, i["reactorThermalKwt"])
    assert surface / i["shieldKg"] == pytest.approx(0.817, rel=0.002)


def test_fission_design_point_and_50_kwe_cross_check_v019() -> None:
    row = item("mason-2006-lunar-brayton-50kwe")
    assert row["kind"] == "documentation-only"
    i = row["inputs"]
    assert DEFAULTS["Tsource"] == i["hotEndK"]
    assert DEFAULTS["Tsink"] == i["coldEndK"]
    assert fission_efficiency(DEFAULTS) == pytest.approx(i["converterEfficiency"], rel=0.002)
    # v0.24: the radiator spans the gas cooler; its approach is fitted to Mason's flux,
    # 158.6 kWt over 140 m^2 before margin.
    mason_flux = (i["reactorThermalKwt"] - i["converterOutputKwe"]) * 1000 / (i["radiatorAreaWithMarginM2"] / (1 + i["areaMargin"]))
    assert radiator_flux_w_per_m2(DEFAULTS) == pytest.approx(mason_flux, rel=0.02)
    # Not calibrated: the model rejects less heat at 50 kWe, so sizes 126 m^2 against 140.
    area_m2 = radiator_m2_per_kw(DEFAULTS) * i["outputKwe"]
    assert area_m2 == pytest.approx(i["radiatorAreaWithMarginM2"] / (1 + i["areaMargin"]), rel=0.15)
    mass_kg = nuclear_mass_at_kwe(DEFAULTS, i["outputKwe"])
    assert i["systemMassWithMarginKg"] / (1 + i["massMargin"]) == pytest.approx(row["expected"], rel=0.001)
    # v0.21: 3.0 t against 3.49 t, 14% light (10% before the shield scaled with power).
    # v0.22: 3.09 t, 12% light, with the small reactor's diseconomy of scale.
    # v0.24: 3.11 t, 11% light, with the radiator over the gas span.
    assert mass_kg == pytest.approx(row["expected"], rel=0.15)
    assert mass_kg < row["expected"]


def test_fission_radiator_mass_per_area_from_nasa_fsp() -> None:
    row = item("mason-2008-fsp-radiator")
    assert row["kind"] == "calibration"
    i = row["inputs"]
    fsp_area_m2 = i["radiatingAreaWithMarginM2"] / (1 + i["areaMargin"])
    areal = i["heatRejectionMassKg"] / fsp_area_m2
    assert areal == pytest.approx(row["expected"], rel=0.001)
    assert DEFAULTS["kRadiatorKgPerM2"] == pytest.approx(areal, rel=0.002)
    # FSP is a Stirling: its 27.4% gross conversion as a fraction of Carnot, rejecting at
    # its 380 K effective radiator (v0.24; v0.20-v0.23 pinned it through a Brayton cycle).
    temps = {"Tsource": i["stirlingHotK"], "Tsink": i["radiatorEffectiveK"], "Tenv": i["sinkK"]}
    carnot = 1 - i["radiatorEffectiveK"] / i["stirlingHotK"]
    fsp = {**temps, "fissionConverter": "stirling", "fCarnotStirling": i["grossPowerKwe"] / i["reactorThermalKw"] / carnot}
    area_m2 = radiator_m2_per_kw({**DEFAULTS, **fsp}) * i["userPowerKwe"]
    assert area_m2 == pytest.approx(fsp_area_m2, rel=0.05)
    assert area_m2 * DEFAULTS["kRadiatorKgPerM2"] == pytest.approx(i["heatRejectionMassKg"], rel=0.05)
    fsp_reactor_share = i["reactorMassKg"] / (i["reactorMassKg"] + i["conversionMassKg"] + i["powerManagementMassKg"])
    reactor_per_kwe = DEFAULTS["kReactorKgPerKwt"] / fission_efficiency(DEFAULTS)
    assert reactor_per_kwe / (reactor_per_kwe + DEFAULTS["kConversionKgPerKwe"]) == pytest.approx(fsp_reactor_share, rel=0.005)
    power = simulate(fsp)["power"]
    assert power["radiatorMassKg"] == pytest.approx(power["radiatorM2"] * DEFAULTS["kRadiatorKgPerM2"], rel=1e-12)


def test_electrolysis_bop_against_doe_pem_targets() -> None:
    row = item("doe-pem-electrolysis-bop")
    assert row["kind"] == "documentation-only"
    i = row["inputs"]
    bop = [
        i["system2022KWhPerKg"] / i["stack2022KWhPerKg"] - 1,
        i["system2026KWhPerKg"] / i["stack2026KWhPerKg"] - 1,
        i["systemUltimateKWhPerKg"] / i["stackUltimateKWhPerKg"] - 1,
    ]
    assert bop[0] == pytest.approx(row["expected"], rel=0.01)
    assert all(0.05 < value < DEFAULTS["fElectrolysisBop"] for value in bop)
    assert DEFAULTS["fElectrolysisBop"] / bop[0] < 2
    stack_only = simulate({"site": "polar", "polarProduct": "propellant", "targetKgPerDay": 67.26, "fElectrolysisBop": 0})
    stack = next(entry for entry in stack_only["energy"]["balances"] if entry["id"] == "water-electrolysis-energy")
    assert stack["electricalInputW"] / 1000 * (1 + DEFAULTS["fElectrolysisBop"]) == pytest.approx(17.5, rel=0.005)
    with_bop = simulate({"site": "polar", "polarProduct": "propellant", "targetKgPerDay": 67.26})
    full = next(entry for entry in with_bop["energy"]["balances"] if entry["id"] == "water-electrolysis-energy")
    assert full["usefulOutputW"] == pytest.approx(stack["usefulOutputW"], rel=1e-12)
    assert full["rejectedHeatW"] - stack["rejectedHeatW"] == pytest.approx(
        full["electricalInputW"] - stack["electricalInputW"], rel=1e-9
    )
    assert full["residualW"] == 0


def test_polar_excavation_compares_with_nasa_mine() -> None:
    row = item("kleinhenz-paz-2020-polar-excavation")
    assert row["kind"] == "documentation-only"
    expected = row["expected"]
    excavation = simulate({"site": "polar", **row["inputs"]})["excavation"]
    assert excavation["soilMovedKgPerDay"] == pytest.approx(67.26 / (0.05 * 0.75) * 1.667, rel=1e-12)
    # The model lands the study's two whole RASSORs (v0.12); its 20% growth margin closes the gap.
    assert excavation["excavatorCount"] == 2
    assert excavation["fleetMassKg"] == 132
    assert excavation["fleetMassKg"] * 1.2 == pytest.approx(expected["excavatorMassKg"], rel=0.05)
    mining_power_w = DEFAULTS["eMining"] * excavation["soilMovedKgPerDay"] / 86_400
    assert 0.5 < mining_power_w / expected["excavatorPowerW"] < 2


def test_sabatier_block_from_nasa_mars_plant() -> None:
    block = item("kleinhenz-paz-2017-sabatier-block")
    assert block["kind"] == "calibration"
    i = block["inputs"]
    methane = i["methaneKg"] / i["productionDays"]
    derived = (i["atmosphereProcessingKg"] + i["methaneDryerKg"]) / methane
    assert derived == pytest.approx(block["expected"], rel=block["relativeTolerance"])
    assert DEFAULTS["kLiquefierCh4"] == pytest.approx(i["methaneLiquefactionKg"] / methane, rel=0.05)
    assert DEFAULTS["kSabatierMass"] == pytest.approx(block["expected"], rel=block["relativeTolerance"])
    reactor = item("pnnl-2005-sabatier-reactor")
    r = reactor["inputs"]
    reactor_methane = r["propellantKg"] / (1 + r["oxygenToMethane"]) / r["productionDays"]
    assert r["reactorKg"] / reactor_methane == pytest.approx(reactor["expected"], rel=0.05)
    assert PARAM_META["kSabatierMass"]["min"] < reactor["expected"]
    result = simulate({"site": "polar", "enableSabatier": True})
    plant = next(row["massKg"] for row in result["logistics"]["manifest"] if row["subsystem"] == "reactor/plant")
    expected = (
        result["thermal"]["extractorMassKg"]
        + DEFAULTS["kElectrolyzerMass"] * DEFAULTS["targetKgPerDay"]
        + DEFAULTS["kSabatierMass"] * result["production"]["ch4KgPerDay"]
    )
    assert plant == pytest.approx(expected, rel=1e-12)
    store = next(item for item in result["cryo"]["inventories"] if item["stream"] == "lch4")
    assert store["liquefierMassKg"] == pytest.approx(DEFAULTS["kLiquefierCh4"] * result["production"]["ch4KgPerDay"], rel=1e-12)


def test_one_rassor_moves_guerrero_zabel_rate() -> None:
    row = item("guerrero-zabel-2023-rassor-rate")
    assert row["kind"] == "calibration"
    for key, value in row["inputs"].items():
        assert DEFAULTS[key] == value, key
    excavation = simulate(row["inputs"])["excavation"]
    assert excavation["excavatorTripsPerDay"] == 34
    assert excavation["excavatorKgPerDay"] == pytest.approx(row["expected"], rel=row["relativeTolerance"])


def test_ilmenite_bed_mass_reproduces_eagle_no_separation_trade() -> None:
    row = item("eagle-1988-no-separation-trade")
    inputs = row["inputs"]

    def reactor(grade: float) -> float:
        result = simulate(
            {
                "equatorialProcess": "ilmenite",
                "targetKgPerDay": inputs["targetKgPerDay"],
                "fIlmenite": inputs["soilGrade"],
                "ilmConcentrateGrade": grade,
            }
        )
        return result["ilmenite"]["reactorMassKg"]

    assert_benchmark(reactor(inputs["soilGrade"]) - reactor(inputs["concentrateGrade"]), row["id"])


def test_ilmenite_activation_energy_default_and_range() -> None:
    expected = item("ilmenite-reduction-activation-energy")["expected"]
    assert DEFAULTS["EaIlmReduction"] / 1000 == pytest.approx(expected["zhaoShadmanKJPerMol"], abs=0.05)
    from_times = c("R") * math.log(2 / 0.25) / (1 / 873 - 1 / 1073) / 1000
    assert from_times == pytest.approx(expected["eagleCitedTimesKJPerMol"], rel=0.005)
    from_equilibrium = c("R") * math.log(10.5 / 7) / (1 / 1173 - 1 / 1273) / 1000
    assert from_equilibrium == pytest.approx(expected["gasLimitedBedKJPerMol"], rel=0.01)
    bounds = PARAM_META["EaIlmReduction"]
    for value in (from_equilibrium, from_times, expected["zhaoShadmanKJPerMol"], expected["briggsSaccoKJPerMol"]):
        assert bounds["min"] <= value * 1000 <= bounds["max"]


def test_basalt_chain_reproduces_eagle_basalt_plants() -> None:
    row = item("eagle-1988-basalt-feed")
    o2 = row["inputs"]["runningO2KgPerDay"]
    ilmenite = simulate({"equatorialProcess": "ilmenite", "ilmFeed": "basalt", "targetKgPerDay": o2})["ilmenite"]
    actual = {
        "basaltFedPerKgO2": ilmenite["basaltFedKgPerDay"] / o2,
        "minedPerKgO2": ilmenite["soilPerKgO2"],
        "beneficiationKW": ilmenite["secBeneficiation_JPerKg"] * o2 / 86_400 / 1000,
        "beneficiationMassKg": ilmenite["beneficiationMassKg"],
    }
    for key, value in row["expected"].items():
        assert actual[key] == pytest.approx(value, rel=row["relativeTolerance"]), key


def test_basalt_against_soil_power_ratio() -> None:
    expected = item("eagle-1988-basalt-vs-soil")["expected"]

    def run(feed: str) -> dict:
        return simulate({"equatorialProcess": "ilmenite", "ilmFeed": feed, "targetKgPerDay": 3044.1})

    soil, basalt = run("soil"), run("basalt")
    assert basalt["energy"]["gridPowerW"] / soil["energy"]["gridPowerW"] == pytest.approx(expected["powerRatio"], rel=0.05)
    ratio = basalt["logistics"]["totalInfraMassKg"] / soil["logistics"]["totalInfraMassKg"]
    assert expected["landedMassRatio"] < ratio < 1


def test_stirling_efficiency_from_nasa_lunar_stirling_v023() -> None:
    row = item("mason-2006-lunar-stirling")
    assert row["kind"] == "calibration"
    i = row["inputs"]
    nak = i["nakEfficiency"] / (1 - i["nakColdK"] / i["nakHotK"])
    lithium = i["lithiumEfficiency"] / (1 - i["lithiumColdK"] / i["lithiumHotK"])
    assert math.sqrt(nak * lithium) == pytest.approx(row["expected"], rel=0.001)
    assert DEFAULTS["fCarnotStirling"] == pytest.approx(row["expected"], rel=0.005)
    for hot, cold, eta in ((i["nakHotK"], i["nakColdK"], i["nakEfficiency"]), (i["lithiumHotK"], i["lithiumColdK"], i["lithiumEfficiency"])):
        stirling = {**DEFAULTS, "fissionConverter": "stirling", "Tsource": hot, "Tsink": cold}
        assert fission_efficiency(stirling) == pytest.approx(eta, rel=0.05)


def test_stirling_mass_from_nasa_stirling_scaling_v023() -> None:
    row = item("mason-2001-stirling-scaling")
    assert row["kind"] == "calibration"
    i = row["inputs"]
    marginal = (500 * i["surface500SpecificKgPerKwe"] - 100 * i["surface100SpecificKgPerKwe"]) / 400
    assert marginal == pytest.approx(row["expected"], rel=1e-9)
    stirling = {**DEFAULTS, "fissionConverter": "stirling", "Tsource": 1050, "Tsink": 500}
    model_marginal = (nuclear_mass_at_kwe(stirling, 500) - nuclear_mass_at_kwe(stirling, 100)) / 400
    assert model_marginal == pytest.approx(marginal, rel=0.001)
    mass = [100 * i["spacecraft100SpecificKgPerKwe"], 1000 * i["spacecraft1000SpecificKgPerKwe"], 10000 * i["spacecraft10000SpecificKgPerKwe"]]
    exponent = math.log10((mass[2] - mass[1]) / (mass[1] - mass[0]))
    assert exponent == pytest.approx(0.996, rel=0.001)
    assert DEFAULTS["bStirlingScale"] == pytest.approx(exponent, rel=0.005)
    # Not used in calibration: NASA FSP's Stirling conversion and power management per kWe.
    fsp = (i["fspConversionKg"] + i["fspPowerManagementKg"]) / i["fspUserPowerKwe"]
    # v0.25: 21.06 kg/kWe, 7% under FSP's 22.6, with v0.25's heavy 3 kV conductor charged on its own.
    # v0.27: the cable designed for its power is lighter, so 21.96 kg/kWe, back within 5%.
    assert DEFAULTS["kConversionStirlingKgPerKwe"] == pytest.approx(fsp, rel=0.05)
    # Stirling is heavier than Brayton at megawatt scale, as Mason 2001 finds above 50 kWe.
    assert nuclear_mass_at_kwe(stirling, 500) / nuclear_mass_at_kwe(DEFAULTS, 500) == pytest.approx(1.20, rel=0.01)
