from __future__ import annotations

import json
import math
from typing import Any


def _scalar_profile(params: dict[str, Any]) -> dict[str, Any]:
    equatorial = params["site"] == "equatorial"
    shadow = 354 if equatorial else params["polarLongestShadowHours"]
    fraction = 0.5 if equatorial else params["polarIlluminationFraction"]
    day = shadow * fraction / (1 - fraction)
    cycle = day + shadow
    transition = min(1e-6, shadow / 1000)
    return {
        "mode": "scalar",
        "name": "Equatorial lunar day/night cycle" if equatorial else "Scalar polar assumptions",
        "cycleHours": cycle,
        "averageIllumination": fraction,
        "averageReceiverVisibility": 1,
        "averageDeliveredFraction": fraction,
        "longestShadowHours": shadow,
        "longestReceiverOutageHours": shadow,
        "minimumSurfaceTemperatureK": params["Tpsr"],
        "maximumSurfaceTemperatureK": params["Tsurface"],
        "points": [
            {"hour": 0, "illumination": 1, "receiverVisibility": 1, "surfaceTemperatureK": params["Tsurface"]},
            {"hour": day, "illumination": 1, "receiverVisibility": 1, "surfaceTemperatureK": params["Tsurface"]},
            {"hour": day + transition, "illumination": 0, "receiverVisibility": 1, "surfaceTemperatureK": params["Tpsr"]},
            {"hour": cycle, "illumination": 0, "receiverVisibility": 1, "surfaceTemperatureK": params["Tpsr"]},
        ],
    }


def _sample_points(points: list[dict[str, float]], hour: float) -> dict[str, float]:
    cycle = points[-1]["hour"]
    t = ((hour % cycle) + cycle) % cycle
    index = 0
    while index < len(points) - 2 and points[index + 1]["hour"] < t:
        index += 1
    a = points[index]
    b = points[index + 1] if index + 1 < len(points) else a
    span = max(1e-12, b["hour"] - a["hour"])
    fraction = min(1, max(0, (t - a["hour"]) / span))

    def lerp(x: float, y: float) -> float:
        return x + (y - x) * fraction

    return {
        "hour": t,
        "illumination": lerp(a["illumination"], b["illumination"]),
        "receiverVisibility": lerp(a["receiverVisibility"], b["receiverVisibility"]),
        "surfaceTemperatureK": lerp(a["surfaceTemperatureK"], b["surfaceTemperatureK"]),
    }


def _longest_circular_outage(points: list[dict[str, float]], include_visibility: bool) -> float:
    cycle = points[-1]["hour"]
    bins = 1024
    dark: list[bool] = []
    for index in range(bins):
        point = _sample_points(points, ((index + 0.5) / bins) * cycle)
        delivered = point["illumination"] * (point["receiverVisibility"] if include_visibility else 1)
        dark.append(delivered <= 0.05)
    longest = 0
    run = 0
    for index in range(bins * 2):
        if dark[index % bins]:
            run = min(bins, run + 1)
            longest = max(longest, run)
        else:
            run = 0
    return longest / bins * cycle


def _parse_imported(params: dict[str, Any]) -> dict[str, Any] | None:
    payload = params["polarProfileData"]
    if not isinstance(payload, str) or not payload or len(payload) > 100_000:
        return None
    try:
        parsed = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        return None
    raw_points = parsed.get("points") if isinstance(parsed, dict) else None
    if not isinstance(raw_points, list) or not 2 <= len(raw_points) <= 512:
        return None
    points: list[dict[str, float]] = []
    for raw in raw_points:
        if not isinstance(raw, dict):
            return None
        hour = raw.get("hour")
        illumination = raw.get("illumination")
        visibility = raw.get("receiverVisibility", 1)
        temperature = raw.get("surfaceTemperatureK", params["Tsurface"])
        values = (hour, illumination, visibility, temperature)
        if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) for value in values):
            return None
        if hour < 0 or not 0 <= illumination <= 1 or not 0 <= visibility <= 1 or not 20 <= temperature <= 450:
            return None
        if points and hour <= points[-1]["hour"]:
            return None
        points.append({"hour": float(hour), "illumination": float(illumination), "receiverVisibility": float(visibility), "surfaceTemperatureK": float(temperature)})
    if abs(points[0]["hour"]) > 1e-9 or points[-1]["hour"] <= 0:
        return None
    cycle = points[-1]["hour"]
    illumination_integral = 0.0
    visibility_integral = 0.0
    delivered_integral = 0.0
    for a, b in zip(points, points[1:]):
        dt = b["hour"] - a["hour"]
        illumination_integral += 0.5 * (a["illumination"] + b["illumination"]) * dt
        visibility_integral += 0.5 * (a["receiverVisibility"] + b["receiverVisibility"]) * dt
        delivered_integral += dt / 6 * (
            2 * a["illumination"] * a["receiverVisibility"]
            + a["illumination"] * b["receiverVisibility"]
            + b["illumination"] * a["receiverVisibility"]
            + 2 * b["illumination"] * b["receiverVisibility"]
        )
    name = parsed.get("name")
    return {
        "mode": "profile",
        "name": name.strip()[:80] if isinstance(name, str) and name.strip() else "Imported polar profile",
        "cycleHours": cycle,
        "averageIllumination": illumination_integral / cycle,
        "averageReceiverVisibility": visibility_integral / cycle,
        "averageDeliveredFraction": delivered_integral / cycle,
        "longestShadowHours": _longest_circular_outage(points, False),
        "longestReceiverOutageHours": _longest_circular_outage(points, True),
        "minimumSurfaceTemperatureK": min(point["surfaceTemperatureK"] for point in points),
        "maximumSurfaceTemperatureK": max(point["surfaceTemperatureK"] for point in points),
        "points": points,
    }


def resolve_polar_profile(params: dict[str, Any]) -> dict[str, Any]:
    if params["site"] != "polar" or params["polarProfileMode"] == "scalar":
        return {"profile": _scalar_profile(params), "warnings": []}
    imported = _parse_imported(params)
    if imported is not None:
        return {"profile": imported, "warnings": []}
    return {
        "profile": _scalar_profile(params),
        "warnings": [{"id": "polar-profile-invalid", "severity": "alarm", "module": "power", "message": "The imported polar site profile is invalid; scalar assumptions are active.", "value": 0, "limit": 1}],
    }


def sample_polar_profile(profile: dict[str, Any], hour: float) -> dict[str, float]:
    return _sample_points(profile["points"], hour)
