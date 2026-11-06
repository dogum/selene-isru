from __future__ import annotations

import math
from typing import Any

from ..constants import c
from .site_profile import resolve_polar_profile


def shield_mass_kg(m_shield_kg: float, ref_kw: float, n_shield: float, kw: float) -> float:
    """Shield mass at a power [kg]: MshieldKg up to its reference power, then a power law above it."""
    return m_shield_kg * max(1.0, kw / ref_kw) ** n_shield


def shield_distance_factor(params: dict[str, Any]) -> float:
    """Shield mass relative to its reference separation: (dShieldRefKm / dSeparationKm)^nShieldDistance [1]."""
    return (c("dShieldRefKm") / params["dSeparationKm"]) ** params["nShieldDistance"]


def fission_shield_kg(params: dict[str, Any], thermal_kw: float) -> float:
    """Fission shield at a reactor heat and the case's siting and separation [kg].

    A surface reactor's shield casts the outpost's shadow, so it shrinks with separation. A buried reactor's
    regolith shields the outpost; its Earth-delivered shield protects the equipment above the hole, so it does
    not depend on separation."""
    if params["fissionSiting"] == "buried":
        return shield_mass_kg(params["MshieldBuriedKg"], params["QshieldRefKwt"], params["nShield"], thermal_kw)
    shield = shield_mass_kg(params["MshieldKg"], params["QshieldRefKwt"], params["nShield"], thermal_kw)
    return shield * shield_distance_factor(params)


def line_efficiency(params: dict[str, Any]) -> float:
    """Fraction of the fission plant's electrical output the cable delivers to the outpost [1]."""
    return 1 - params["fCableLossPerKm"] * params["dSeparationKm"]


CABLE_V_MIN = 10.0
CABLE_BISECTIONS = 80


def cable_design(params: dict[str, Any], sent_kwe: float) -> dict[str, float]:
    """Reactor-to-outpost cable at a sent electrical power: its voltage and its mass per km [V, m^2, m, kg/km].

    Aluminium conductors, each insulated with FEP at a fixed design stress, inside one FEP jacket. DC is a
    bipolar line: two conductors, each at half the line voltage V to ground, A = 2 rho P / (V^2 f). AC is a
    three-phase line at unity power factor: three conductors, each insulated for its peak voltage to ground
    V sqrt(2/3), A = rho P / (V^2 f). Areas are floored at the 16 AWG minimum. A higher voltage shrinks the
    conductor as 1/V^2 and thickens the insulation as V; the voltage (line to line, RMS for AC) is the one
    that minimizes their mass, found by bisection on the sign of the slope, and capped so the peak voltage to
    ground stays within VCableMaxV / 2."""
    rho = c("rhoAluminumOhmM")
    rho_m = c("densityAluminumKgPerM3")
    rho_i = c("densityFEPKgPerM3")
    stress = c("EInsulationVPerM")
    jacket = c("tCableJacketM")
    a_min = c("AConductorMinM2")
    ac = params["cableForm"] == "ac"
    conductors = 3 if ac else 2
    peak_to_ground = math.sqrt(2 / 3) if ac else 0.5
    bundle = 1 + 2 / math.sqrt(3) if ac else 2.0
    loss_per_m = params["fCableLossPerKm"] / 1000
    area_coefficient = (1 if ac else 2) * rho * max(sent_kwe, 0.0) * 1000 / loss_per_m
    v_max = params["VCableMaxV"] * 0.5 / peak_to_ground

    def slope_sign(v: float) -> float:
        area = area_coefficient / v**2
        radius = math.sqrt(area / math.pi)
        thickness = peak_to_ground * v / stress
        return -conductors * rho_m * area + rho_i * math.pi * (
            conductors * thickness**2 + bundle * jacket * (thickness - radius)
        )

    lo = CABLE_V_MIN
    hi = max(lo, min(math.sqrt(area_coefficient / a_min), v_max))
    if hi == lo or slope_sign(hi) < 0:
        voltage = hi
    else:
        for _ in range(CABLE_BISECTIONS):
            mid = math.sqrt(lo * hi)
            if slope_sign(mid) < 0:
                lo = mid
            else:
                hi = mid
        voltage = hi
    area = max(a_min, area_coefficient / voltage**2)
    radius = math.sqrt(area / math.pi)
    thickness = peak_to_ground * voltage / stress
    bundle_radius = bundle * (radius + thickness)
    return {
        "voltageV": voltage,
        "conductorAreaM2": area,
        "insulationM": thickness,
        "conductorKgPerKm": conductors * area * rho_m * 1000,
        "insulationKgPerKm": conductors * math.pi * (2 * radius * thickness + thickness**2) * rho_i * 1000,
        "jacketKgPerKm": math.pi * (2 * bundle_radius * jacket + jacket**2) * rho_i * 1000,
    }


def cable_mass_kg(params: dict[str, Any], sent_kwe: float) -> float:
    """Reactor-to-outpost cable mass at a sent electrical power [kg]: the fixed mass per km plus the designed cable."""
    design = cable_design(params, sent_kwe)
    per_km = params["kCableKgPerKm"] + design["conductorKgPerKm"] + design["insulationKgPerKm"] + design["jacketKgPerKm"]
    return params["dSeparationKm"] * per_km


def horizon_km(params: dict[str, Any]) -> float:
    """Line-of-sight distance over a smooth Moon between the reactor's core and the outpost [km].

    sqrt(2 R h_reactor) + sqrt(2 R h_outpost). A buried reactor's core is at the surface or below it."""
    reactor_m = 0.0 if params["fissionSiting"] == "buried" else params["hReactorM"]
    radius = c("rMoonM")
    return (math.sqrt(2 * radius * reactor_m) + math.sqrt(2 * radius * params["hOutpostM"])) / 1000


def shield_ref_kwe(params: dict[str, Any]) -> float:
    """Delivered output at which the shield reaches its reference heat [kW]."""
    return params["QshieldRefKwt"] * fission_efficiency(params) * line_efficiency(params)


def p_crit_kw(m_shield_kg: float, beta: float, alpha: float, shield_ref_kw: float = 1.0, n_shield: float = 0.0) -> float | None:
    """Solar/nuclear crossover [kW]: beta P = Mshield max(1, P / Pref)^n + alpha P."""
    if beta <= alpha:
        return None
    fixed = m_shield_kg / (beta - alpha)
    if fixed <= shield_ref_kw or n_shield == 0:
        return fixed
    return (m_shield_kg / ((beta - alpha) * shield_ref_kw**n_shield)) ** (1 / (1 - n_shield))


def solar_slope_at_year(beta: float, d_solar: float, t_years: float) -> float:
    return beta / (1 - d_solar) ** t_years


def nuclear_slope_at_year(alpha: float, d_nuclear: float, t_years: float) -> float:
    return alpha * (1 + d_nuclear * t_years)


def p_crit_dynamic_kw(
    m_shield_kg: float,
    beta: float,
    alpha: float,
    d_solar: float,
    d_nuclear: float,
    t_years: float,
    shield_ref_kw: float = 1.0,
    n_shield: float = 0.0,
) -> float | None:
    return p_crit_kw(
        m_shield_kg,
        solar_slope_at_year(beta, d_solar, t_years),
        nuclear_slope_at_year(alpha, d_nuclear, t_years),
        shield_ref_kw,
        n_shield,
    )


RP_MIN = 1.05
RP_MAX = 8.0
RP_GRID = 48
RP_BISECTIONS = 60


def brayton_cycle_at(params: dict[str, Any], rp: float) -> dict[str, float]:
    """Recuperated closed Brayton cycle on an ideal monatomic gas at a pressure ratio, per unit heat capacity [K].

    Turbine inlet at Tsource, compressor inlet at Tsink. Returns the net work and the reactor heat per
    unit mass flow and heat capacity, and the cycle's temperatures, including the gas cooler inlet,
    where the recuperator hands the waste heat to the radiator loop."""
    k = (c("gammaHeXe") - 1) / c("gammaHeXe")
    t1 = params["Tsink"]
    t3 = params["Tsource"]
    t2 = t1 * (1 + (rp**k - 1) / params["etaCompressor"])
    expansion = max(1.0, rp * (1 - params["fPressureLoss"]))
    t4 = t3 * (1 - params["etaTurbine"] * (1 - expansion**-k))
    t5 = t2 + params["epsRecuperator"] * max(0.0, t4 - t2)
    return {
        "pressureRatio": rp,
        "compressorExitK": t2,
        "turbineExitK": t4,
        "heaterInletK": t5,
        "coolerInletK": t4 - (t5 - t2),
        "netWorkK": (t3 - t4) - (t2 - t1),
        "heatInK": t3 - t5,
    }


def _brayton_slope(params: dict[str, Any], rp: float) -> float:
    """Sign-carrying numerator of d(netWork / heatIn) / d(pressure ratio), from brayton_cycle_at's own terms."""
    k = (c("gammaHeXe") - 1) / c("gammaHeXe")
    t1 = params["Tsink"]
    t3 = params["Tsource"]
    loss = 1 - params["fPressureLoss"]
    t2 = t1 * (1 + (rp**k - 1) / params["etaCompressor"])
    dt2 = t1 * k * rp ** (k - 1) / params["etaCompressor"]
    expansion = rp * loss
    if expansion > 1:
        t4 = t3 * (1 - params["etaTurbine"] * (1 - expansion**-k))
        dt4 = -t3 * params["etaTurbine"] * k * expansion ** (-k - 1) * loss
    else:
        t4, dt4 = t3, 0.0
    if t4 > t2:
        t5 = t2 + params["epsRecuperator"] * (t4 - t2)
        dt5 = dt2 + params["epsRecuperator"] * (dt4 - dt2)
    else:
        t5, dt5 = t2, dt2
    net_work = (t3 - t4) - (t2 - t1)
    return (-dt4 - dt2) * (t3 - t5) + net_work * dt5


def brayton_cycle(params: dict[str, Any]) -> dict[str, float]:
    """The Brayton cycle at the pressure ratio that maximizes its efficiency.

    A log-spaced grid over RP_MIN..RP_MAX finds the best point; bisection on the sign of the analytic
    slope between its neighbours then finds the optimum. Bisecting a slope, unlike comparing two nearly
    equal efficiencies, converges to the same pressure ratio in any floating-point implementation."""

    def value(rp: float) -> float:
        cycle = brayton_cycle_at(params, rp)
        return cycle["netWorkK"] / cycle["heatInK"] if cycle["heatInK"] > 0 else -1e9

    grid = [RP_MIN * (RP_MAX / RP_MIN) ** (i / (RP_GRID - 1)) for i in range(RP_GRID)]
    best = 0
    best_value = value(grid[0])
    for i in range(1, RP_GRID):
        v = value(grid[i])
        if v > best_value:
            best, best_value = i, v
    lo = grid[max(0, best - 1)]
    hi = grid[min(RP_GRID - 1, best + 1)]
    for _ in range(RP_BISECTIONS):
        mid = (lo + hi) / 2
        cycle = brayton_cycle_at(params, mid)
        if cycle["netWorkK"] > 0 and cycle["heatInK"] > 0:
            rising = _brayton_slope(params, mid) > 0
        else:
            rising = mid < grid[best]
        if rising:
            lo = mid
        else:
            hi = mid
    return brayton_cycle_at(params, (lo + hi) / 2)


def fission_efficiency(params: dict[str, Any]) -> float:
    """Fission conversion efficiency, electrical output over reactor heat [1].

    Brayton: the cycle's net work over its heat input at its best pressure ratio, times the alternator
    and power conditioning efficiency. Stirling: a fixed fraction of Carnot between the hot and cold ends."""
    if params["fissionConverter"] == "stirling":
        return max(1e-9, (1 - params["Tsink"] / params["Tsource"]) * params["fCarnotStirling"])
    cycle = brayton_cycle(params)
    if cycle["netWorkK"] <= 0 or cycle["heatInK"] <= 0:
        return 1e-9
    return max(1e-9, cycle["netWorkK"] / cycle["heatInK"] * params["etaAlternator"])


def radiator_temperatures_k(params: dict[str, Any]) -> tuple[float, float]:
    """Radiator coolant's cold and hot ends [K].

    Brayton: the gas cools from the gas cooler inlet to the compressor inlet, and the radiator loop runs
    dTGasCoolerK below it. Stirling: rejects at its cold end."""
    if params["fissionConverter"] == "stirling":
        return params["Tsink"], params["Tsink"]
    cycle = brayton_cycle(params)
    cold = params["Tsink"] - params["dTGasCoolerK"]
    return cold, max(cold, cycle["coolerInletK"] - params["dTGasCoolerK"])


def _inverse_flux_integral(t: float, a: float) -> float:
    """Antiderivative of 1 / (T^4 - a^4) with respect to T, for T > a."""
    return math.log((t - a) / (t + a)) / (4 * a**3) - math.atan(t / a) / (2 * a**3)


def radiator_flux_w_per_m2(params: dict[str, Any]) -> float:
    """Net radiated flux averaged over the radiator, its coolant falling linearly in temperature [W/m^2]."""
    k = params["etaRad"] * params["epsRad"] * c("sigma")
    cold, hot = radiator_temperatures_k(params)
    a = params["Tenv"]
    if cold <= a or hot - cold < 1e-6:
        return k * (cold**4 - a**4)
    return k * (hot - cold) / (_inverse_flux_integral(hot, a) - _inverse_flux_integral(cold, a))


def _radiator_m2_per_kw_at(params: dict[str, Any], eta_therm: float) -> float:
    return (1000 * (1 / eta_therm - 1)) / max(1e-9, radiator_flux_w_per_m2(params))


def radiator_m2_per_kw(params: dict[str, Any]) -> float:
    """Fission radiating area per kW of electrical output [m^2/kW]."""
    return _radiator_m2_per_kw_at(params, fission_efficiency(params))


def fission_scale_factor(params: dict[str, Any], thermal_kw: float) -> float:
    """Reactor and conversion specific-mass factor at a reactor heat: (Q / QscaleRefKwt)^(bFissionScale - 1) [1]."""
    return (max(thermal_kw, 1e-9) / params["QscaleRefKwt"]) ** (params["bFissionScale"] - 1)


def conversion_kg_per_kwe(params: dict[str, Any], thermal_kw: float) -> float:
    """Power conversion and power management mass per kW of electrical output at a reactor heat [kg/kW].

    Brayton scales with the reactor (bFissionScale); Stirling's modular convertors by bStirlingScale."""
    if params["fissionConverter"] == "stirling":
        stirling_scale = (max(thermal_kw, 1e-9) / params["QscaleRefKwt"]) ** (params["bStirlingScale"] - 1)
        return params["kConversionStirlingKgPerKwe"] * stirling_scale
    return params["kConversionKgPerKwe"] * fission_scale_factor(params, thermal_kw)


def _specific_kg_per_kwe(params: dict[str, Any], eta: float, radiator_kg_per_kwe: float, kwe: float) -> float:
    """Per delivered kW: reactor, conversion, and radiator, all sized on the sent power."""
    line = line_efficiency(params)
    heat_kw = kwe / line / eta
    per_sent_kwe = (
        params["kReactorKgPerKwt"] / eta * fission_scale_factor(params, heat_kw)
        + conversion_kg_per_kwe(params, heat_kw)
        + radiator_kg_per_kwe
    )
    return per_sent_kwe / line


def nuclear_specific_kg_per_kw(params: dict[str, Any], kwe: float | None = None) -> float:
    """Fission specific mass per kW delivered at an output, excluding the shield and the cable [kg/kW].

    Defaults to the output at the scaling reference heat."""
    eta = fission_efficiency(params)
    at_kwe = params["QscaleRefKwt"] * eta * line_efficiency(params) if kwe is None else kwe
    return _specific_kg_per_kwe(params, eta, params["kRadiatorKgPerM2"] * _radiator_m2_per_kw_at(params, eta), at_kwe)


def _mass_curve(params: dict[str, Any]):
    """Fission mass against delivered output and age, with the efficiency and radiator evaluated once."""
    eta = fission_efficiency(params)
    line = line_efficiency(params)
    radiator_kg_per_kwe = params["kRadiatorKgPerM2"] * _radiator_m2_per_kw_at(params, eta)

    def mass(kwe: float, t_years: float) -> float:
        shield = fission_shield_kg(params, kwe / line / eta)
        cable = cable_mass_kg(params, kwe / line)
        specific = _specific_kg_per_kwe(params, eta, radiator_kg_per_kwe, kwe)
        return shield + cable + nuclear_slope_at_year(specific, params["dNuclear"], t_years) * kwe

    return mass


def nuclear_mass_at_kwe(params: dict[str, Any], kwe: float, t_years: float = 0.0) -> float:
    """Fission system mass at an electrical output after t_years of derating [kg]: the shield plus the aged rest."""
    return _mass_curve(params)(kwe, t_years)


def fission_crossover_kw(params: dict[str, Any], beta: float, t_years: float = 0.0) -> float | None:
    """Electrical output above which fission is lighter than solar [kW], by bisection on a log scale.

    Solar mass is linear and fission mass concave in output, so the gap has one root."""
    beta_t = solar_slope_at_year(beta, params["dSolar"], t_years)
    mass = _mass_curve(params)

    def gap(kw: float) -> float:
        return beta_t * kw - mass(kw, t_years)

    lo, hi = 1e-6, 1e9
    if gap(hi) <= 0:
        return None
    for _ in range(100):
        mid = math.sqrt(lo * hi)
        if gap(mid) > 0:
            hi = mid
        else:
            lo = mid
    return hi


def site_cycle_hours(params: dict[str, Any], profile: dict[str, Any] | None = None) -> tuple[float, float]:
    if params["site"] == "equatorial":
        return c("tDay"), c("tNight")
    night_hours = params["polarLongestShadowHours"] if profile is None else profile["longestReceiverOutageHours"]
    fraction = params["polarIlluminationFraction"] if profile is None else profile["averageDeliveredFraction"]
    cycle = night_hours / (1 - fraction) if profile is None else profile["cycleHours"]
    day_hours = max(1e-6, cycle * fraction)
    return day_hours, night_hours


def beam_efficiency(w0_beam: float, theta_div_beam: float, z_crater_drop: float, r_receiver: float, eta_emitter: float, eta_pv_receiver: float) -> float:
    w_beam = w0_beam + theta_div_beam * z_crater_drop
    eta_geo = 1 - math.exp(-2 * r_receiver**2 / w_beam**2)
    return eta_emitter * eta_geo * eta_pv_receiver


def beamed_power_w(p_array_rim_w: float, w0_beam: float, theta_div_beam: float, z_crater_drop: float, r_receiver: float, eta_emitter: float, eta_pv_receiver: float) -> float:
    return p_array_rim_w * beam_efficiency(w0_beam, theta_div_beam, z_crater_drop, r_receiver, eta_emitter, eta_pv_receiver)


def simulate_power(params: dict[str, Any], grid_power_w: float, profile: dict[str, Any] | None = None) -> dict[str, Any]:
    p_grid = grid_power_w
    active_profile = resolve_polar_profile(params)["profile"] if profile is None else profile
    day_hours, night_hours = site_cycle_hours(params, active_profile)
    beam_transfer = beam_efficiency(params["w0Beam"], params["thetaDivBeam"], params["zCraterDrop"], params["rReceiver"], params["etaEmitter"], params["etaPvReceiver"]) if params["site"] == "polar" else 1
    delivery_efficiency = params["etaWire"] * beam_transfer
    p_array = p_grid / delivery_efficiency + p_grid * night_hours / (day_hours * params["etaRoundTrip"] * delivery_efficiency)
    solar_delivered_capacity_w = p_array * delivery_efficiency
    solar_denominator = c("ISOLAR") * params["etaCell"] * math.cos(params["thetaSun"]) * params["Fdegrade"]
    solar_array_m2 = p_array / max(1e-9, solar_denominator)
    e_storage_wh = p_grid * night_hours / (params["DoD"] * params["etaDischarge"])
    m_storage = e_storage_wh / params["SEstorage"]
    solar_mass_kg = params["Rarray"] * (p_array / 1000) + m_storage
    beta_solar = solar_mass_kg / (p_grid / 1000)

    eta_therm = fission_efficiency(params)
    p_sent = p_grid / line_efficiency(params)
    q_fission = p_sent / eta_therm
    q_reject = q_fission - p_sent
    radiator_flux = radiator_flux_w_per_m2(params)
    radiator_m2 = q_reject / max(1e-9, radiator_flux)
    radiator_cold_k, _ = radiator_temperatures_k(params)
    radiator_effective_k = (
        (radiator_flux / (params["etaRad"] * params["epsRad"] * c("sigma")) + params["Tenv"] ** 4) ** 0.25
        if radiator_flux > 0
        else radiator_cold_k
    )
    radiator_mass_kg = params["kRadiatorKgPerM2"] * radiator_m2
    shield_kg = fission_shield_kg(params, q_fission / 1000)
    cable_kg = cable_mass_kg(params, p_sent / 1000)
    cable_voltage_v = cable_design(params, p_sent / 1000)["voltageV"]
    scale = fission_scale_factor(params, q_fission / 1000)
    nuclear_mass_kg = (
        shield_kg
        + params["kReactorKgPerKwt"] * (q_fission / 1000) * scale
        + conversion_kg_per_kwe(params, q_fission / 1000) * (p_sent / 1000)
        + radiator_mass_kg
        + cable_kg
    )
    alpha_with_radiator = nuclear_specific_kg_per_kw(params, p_grid / 1000)
    architecture = "solar" if solar_mass_kg <= nuclear_mass_kg else "nuclear"
    selected_power_mass_kg = solar_mass_kg if architecture == "solar" else nuclear_mass_kg
    p_crit = fission_crossover_kw(params, beta_solar)
    p_crit_dynamic = fission_crossover_kw(params, beta_solar, params["missionYears"])
    warnings: list[dict[str, Any]] = []
    if p_crit is None:
        warnings.append({"id": "beta-le-alpha", "severity": "caution", "module": "power", "message": "Solar stays lighter than fission at every power level.", "value": beta_solar, "limit": alpha_with_radiator})
    if params["Tsource"] <= params["Tsink"]:
        warnings.append({"id": "power-hot-side", "severity": "alarm", "module": "power", "message": "Fission hot-side temperature must exceed sink temperature.", "value": params["Tsource"], "limit": params["Tsink"]})
    cycle = brayton_cycle(params)
    if params["fissionConverter"] == "stirling" and params["Tsource"] > c("TStirlingMaxK"):
        warnings.append({"id": "stirling-hot-end", "severity": "caution", "module": "power", "message": "Stirling hot end is above NASA's 1,050 K refractory Stirling design.", "value": params["Tsource"], "limit": c("TStirlingMaxK")})
    if params["fissionConverter"] == "brayton" and params["Tsource"] > params["Tsink"] and (cycle["netWorkK"] <= 0 or cycle["heatInK"] <= 0):
        warnings.append({"id": "fission-no-net-work", "severity": "alarm" if architecture == "nuclear" else "caution", "module": "power", "message": "The Brayton cycle makes no net work at these temperatures and component efficiencies.", "value": params["Tsource"] / params["Tsink"], "limit": cycle["netWorkK"]})
    horizon = horizon_km(params)
    if architecture == "nuclear" and params["dSeparationKm"] > horizon:
        warnings.append({"id": "outpost-beyond-horizon", "severity": "info", "module": "power", "message": "The outpost is beyond the reactor's line-of-sight horizon; terrain blocks direct radiation, which the shield, sized for line of sight, does not credit.", "value": params["dSeparationKm"], "limit": horizon})
    if radiator_cold_k <= params["Tenv"]:
        warnings.append({"id": "radiator-temperature", "severity": "alarm", "module": "power", "message": "Radiator cold end must exceed its environment temperature.", "value": radiator_cold_k, "limit": params["Tenv"]})

    beamed_floor_power_w = beamed_power_w(p_array, params["w0Beam"], params["thetaDivBeam"], params["zCraterDrop"], params["rReceiver"], params["etaEmitter"], params["etaPvReceiver"]) * params["etaWire"] if params["site"] == "polar" and architecture == "solar" else None
    beam_delivery_margin_w = None if beamed_floor_power_w is None else beamed_floor_power_w - p_grid
    if beam_delivery_margin_w is not None and beam_delivery_margin_w < -1e-6:
        warnings.append({"id": "beam-power-shortfall", "severity": "alarm", "module": "power", "message": "Delivered beamed power is below the crater-floor load.", "value": beamed_floor_power_w, "limit": p_grid})

    return {
        "architecture": architecture,
        "solarMassKg": solar_mass_kg,
        "nuclearMassKg": nuclear_mass_kg,
        "solarArrayM2": solar_array_m2,
        "radiatorM2": radiator_m2,
        "radiatorMassKg": radiator_mass_kg,
        "radiatorEffectiveK": radiator_effective_k,
        "shieldMassKg": shield_kg,
        "cableMassKg": cable_kg,
        "cableLossW": p_sent - p_grid,
        "cableVoltageV": cable_voltage_v,
        "horizonKm": horizon,
        "fissionThermalW": q_fission,
        "nuclearSpecificKgPerKw": alpha_with_radiator,
        "pCritW": 0 if p_crit is None else p_crit * 1000,
        "pCritDynamicW": 0 if p_crit_dynamic is None else p_crit_dynamic * 1000,
        "beamedFloorPowerW": beamed_floor_power_w,
        "beamDeliveryMarginW": beam_delivery_margin_w,
        "solarDeliveredCapacityW": solar_delivered_capacity_w,
        "siteDayHours": day_hours,
        "siteNightHours": night_hours,
        "siteProfile": active_profile,
        "selectedPowerMassKg": selected_power_mass_kg,
        "warnings": warnings,
    }
