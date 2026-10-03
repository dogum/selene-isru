from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from selene_isru import DEFAULTS, PARAM_META, campaign_timeline, sample_uncertainty, simulate, simulate_timeseries  # noqa: E402
from selene_isru.normalize import normalize_params  # noqa: E402

OUT_PATH = ROOT / "packages" / "engine" / "test" / "golden_vectors.json"
DYNAMICS_OUT_PATH = ROOT / "packages" / "engine" / "test" / "dynamics_vectors.json"
SEED = 42
N_SAMPLES = 200
FIXTURE_SIGNIFICANT_DIGITS = 14


def canonicalize_numbers(value: Any) -> Any:
    """Remove platform-specific last-bit noise from committed JSON fixtures."""
    if isinstance(value, float):
        if value == 0:
            return 0.0
        return float(format(value, f".{FIXTURE_SIGNIFICANT_DIGITS}g"))
    if isinstance(value, list):
        return [canonicalize_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: canonicalize_numbers(item) for key, item in value.items()}
    return value


def numeric_param_keys() -> list[str]:
    keys: list[str] = []
    for key, meta in PARAM_META.items():
        default = DEFAULTS[key]
        if isinstance(default, (int, float)) and not isinstance(default, bool):
            if isinstance(meta.get("min"), (int, float)) and isinstance(meta.get("max"), (int, float)):
                keys.append(key)
    return keys


def latin_hypercube_samples() -> list[dict[str, Any]]:
    rng = random.Random(SEED)
    keys = numeric_param_keys()
    columns: dict[str, list[float]] = {}

    for key in keys:
        meta = PARAM_META[key]
        lower = float(meta["min"])
        upper = float(meta["max"])
        if lower == upper:
            values = [lower for _ in range(N_SAMPLES)]
        else:
            values = [lower + ((i + rng.random()) / N_SAMPLES) * (upper - lower) for i in range(N_SAMPLES)]
            rng.shuffle(values)
        columns[key] = values

    samples: list[dict[str, Any]] = []
    for i in range(N_SAMPLES):
        params = {key: columns[key][i] for key in keys}
        params["site"] = "equatorial" if i % 2 == 0 else "polar"
        params["enableSabatier"] = i % 3 == 0
        samples.append(params)

    return samples


def named_scenarios() -> list[tuple[str, dict[str, Any]]]:
    scenarios: list[tuple[str, dict[str, Any]]] = []
    profiles = {
        "default": _profile_default,
        "min": _profile_min,
        "max": _profile_max,
        "mixed": _profile_mixed,
    }
    for site in ("equatorial", "polar"):
        for name, build in profiles.items():
            params = build(site)
            scenarios.append((f"{site}-{name}", params))
    imported_profile = json.dumps({
        "version": 1,
        "name": "Parity ridge cycle",
        "points": [
            {"hour": 0, "illumination": 1, "receiverVisibility": 1, "surfaceTemperatureK": 210},
            {"hour": 12, "illumination": 0, "receiverVisibility": 0, "surfaceTemperatureK": 50},
            {"hour": 24, "illumination": 1, "receiverVisibility": 1, "surfaceTemperatureK": 210},
        ],
    }, separators=(",", ":"))
    scenarios.append(("polar-imported-profile", {"site": "polar", "polarProfileMode": "profile", "polarProfileData": imported_profile}))
    # Campaign ledger: multi-lander deployment, and a pilot charged by mass share.
    scenarios.append(("equatorial-campaign-multi-lander", {"targetKgPerDay": 10000, "landingsPerYear": 2}))
    scenarios.append(("polar-campaign-shared-pilot", {"site": "polar", "targetKgPerDay": 10, "deploymentManifest": "shared"}))
    # Propellant mode: the NASA baseline rate and a richer mixture ratio.
    scenarios.append(("polar-propellant-baseline", {"site": "polar", "polarProduct": "propellant", "targetKgPerDay": 67.26}))
    scenarios.append(("polar-propellant-of55", {"site": "polar", "polarProduct": "propellant", "mixtureRatio": 5.5, "chiIce": 0.02}))
    return scenarios


CAMPAIGN_VECTORS: list[tuple[str, dict[str, Any], float]] = [
    ("equatorial-multi-lander-timeline", {"targetKgPerDay": 10000, "landingsPerYear": 2}, 90),
    ("polar-shared-pilot-timeline", {"site": "polar", "targetKgPerDay": 10, "deploymentManifest": "shared"}, 120),
]


def _campaign_vector(name: str, params: dict[str, Any], step_days: float) -> dict[str, Any]:
    normalized, _ = normalize_params(params)
    return {"name": name, "params": params, "stepDays": step_days, "result": campaign_timeline(normalized, simulate(normalized), step_days)}


def _profile_default(site: str) -> dict[str, Any]:
    return {"site": site, "enableSabatier": site == "polar"}


def _profile_min(site: str) -> dict[str, Any]:
    params: dict[str, Any] = {"site": site, "enableSabatier": False}
    for key, meta in PARAM_META.items():
        if key in ("site", "enableSabatier"):
            continue
        if isinstance(DEFAULTS[key], (int, float)) and not isinstance(DEFAULTS[key], bool):
            params[key] = meta.get("min", DEFAULTS[key])
    return params


def _profile_max(site: str) -> dict[str, Any]:
    params: dict[str, Any] = {"site": site, "enableSabatier": site == "polar"}
    for key, meta in PARAM_META.items():
        if key in ("site", "enableSabatier"):
            continue
        if isinstance(DEFAULTS[key], (int, float)) and not isinstance(DEFAULTS[key], bool):
            params[key] = meta.get("max", DEFAULTS[key])
    return params


def _profile_mixed(site: str) -> dict[str, Any]:
    params: dict[str, Any] = {"site": site, "enableSabatier": site == "polar"}
    flip = False
    for key, meta in PARAM_META.items():
        if key in ("site", "enableSabatier"):
            continue
        if isinstance(DEFAULTS[key], (int, float)) and not isinstance(DEFAULTS[key], bool):
            params[key] = meta.get("max" if flip else "min", DEFAULTS[key])
            flip = not flip
    return params


def main() -> None:
    vectors: list[dict[str, Any]] = []
    for i, params in enumerate(latin_hypercube_samples()):
        vectors.append({"name": f"lhs-{i:03d}", "params": params, "result": simulate(params)})
    for name, params in named_scenarios():
        vectors.append({"name": name, "params": params, "result": simulate(params)})

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as handle:
        golden = canonicalize_numbers({"schemaVersion": 1, "seed": SEED, "vectors": vectors})
        json.dump(golden, handle, indent=2, allow_nan=False)
        handle.write("\n")

    dynamics = {
        "schemaVersion": 1,
        "seed": SEED,
        "timeseries": [
            {
                "name": "default-solar-cycle",
                "params": {},
                "opts": {"cycles": 1, "samplesPerCycle": 12},
                "result": simulate_timeseries({}, {"cycles": 1, "samplesPerCycle": 12}),
            },
            {
                "name": "polar-cycle",
                "params": {"site": "polar", "targetKgPerDay": 500},
                "opts": {"cycles": 2, "samplesPerCycle": 8},
                "result": simulate_timeseries({"site": "polar", "targetKgPerDay": 500}, {"cycles": 2, "samplesPerCycle": 8}),
            },
            {
                "name": "polar-imported-profile-cycle",
                "params": {"site": "polar", "polarProfileMode": "profile", "polarProfileData": dict(named_scenarios())["polar-imported-profile"]["polarProfileData"]},
                "opts": {"cycles": 1, "samplesPerCycle": 12},
                "result": simulate_timeseries({"site": "polar", "polarProfileMode": "profile", "polarProfileData": dict(named_scenarios())["polar-imported-profile"]["polarProfileData"]}, {"cycles": 1, "samplesPerCycle": 12}),
            },
        ],
        "uncertainty": [
            {
                "name": "default-target-mining",
                "base": {},
                "spec": [{"key": "targetKgPerDay", "rel": 0.08}, {"key": "eMining", "rel": 0.15}],
                "opts": {"n": 32, "seed": SEED},
                "result": sample_uncertainty(
                    {},
                    [{"key": "targetKgPerDay", "rel": 0.08}, {"key": "eMining", "rel": 0.15}],
                    {"n": 32, "seed": SEED},
                ),
            },
            {
                "name": "polar-ice",
                "base": {"site": "polar"},
                "spec": [{"key": "chiIce", "rel": 0.2}, {"key": "secLiquefaction", "rel": 0.1}],
                "opts": {"n": 32, "seed": 7},
                "result": sample_uncertainty(
                    {"site": "polar"},
                    [{"key": "chiIce", "rel": 0.2}, {"key": "secLiquefaction", "rel": 0.1}],
                    {"n": 32, "seed": 7},
                ),
            },
        ],
        "campaign": [_campaign_vector(name, params, step) for name, params, step in CAMPAIGN_VECTORS],
    }
    with DYNAMICS_OUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(canonicalize_numbers(dynamics), handle, indent=2, allow_nan=False)
        handle.write("\n")


if __name__ == "__main__":
    main()
