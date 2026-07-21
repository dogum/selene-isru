from __future__ import annotations

import math
from typing import Any

from .constants import DEFAULTS, PARAM_META


def normalize_params(input_params: dict[str, Any] | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    source = {} if input_params is None else input_params
    params = dict(DEFAULTS)
    warnings: list[dict[str, Any]] = []

    for key, meta in PARAM_META.items():
        if key not in source:
            continue

        raw = source[key]
        default_value = DEFAULTS[key]

        if isinstance(default_value, (int, float)) and not isinstance(default_value, bool):
            next_value = float(raw) if isinstance(raw, (int, float)) and not isinstance(raw, bool) and math.isfinite(raw) else float(default_value)
            lower = meta.get("min")
            upper = meta.get("max")
            clamped = not (isinstance(raw, (int, float)) and not isinstance(raw, bool) and math.isfinite(raw))

            if isinstance(lower, (int, float)) and next_value < float(lower):
                next_value = float(lower)
                clamped = True
            if isinstance(upper, (int, float)) and next_value > float(upper):
                next_value = float(upper)
                clamped = True

            params[key] = next_value
            if clamped:
                warnings.append(
                    {
                        "id": "param-clamped",
                        "severity": "info",
                        "module": "params",
                        "message": "Parameter was clamped to its configured bounds.",
                        "value": float(raw) if isinstance(raw, (int, float)) and not isinstance(raw, bool) and math.isfinite(raw) else float(default_value),
                        "limit": next_value,
                    }
                )
            continue

        if key == "site":
            if raw in ("equatorial", "polar"):
                params["site"] = raw
            else:
                params["site"] = DEFAULTS["site"]
                warnings.append(
                    {
                        "id": "param-clamped",
                        "severity": "info",
                        "module": "params",
                        "message": "Parameter was clamped to its configured bounds.",
                        "value": 0,
                        "limit": 0,
                    }
                )
            continue

        string_options = {
            "storageStream": {"auto", "lox", "water-ice", "liquid-water", "lh2", "lch4", "co2-feed", "custom"},
            "cryoControlMode": {"zero-boiloff", "passive", "capacity-limited"},
            "polarProfileMode": {"scalar", "profile"},
        }
        if key in string_options:
            if isinstance(raw, str) and raw in string_options[key]:
                params[key] = raw
            else:
                params[key] = default_value
                warnings.append({"id": "param-clamped", "severity": "info", "module": "params", "message": "Parameter was reset to a supported option.", "value": 0, "limit": 0})
            continue

        if key == "polarProfileData":
            if isinstance(raw, str) and len(raw) <= 100_000:
                params[key] = raw
            else:
                params[key] = default_value
                warnings.append({"id": "param-clamped", "severity": "info", "module": "params", "message": "Imported profile data exceeded the supported text boundary.", "value": 0, "limit": 100_000})
            continue

        if isinstance(default_value, bool):
            if isinstance(raw, bool):
                params[key] = raw
            else:
                params[key] = default_value
                warnings.append(
                    {
                        "id": "param-clamped",
                        "severity": "info",
                        "module": "params",
                        "message": "Parameter was clamped to its configured bounds.",
                        "value": 0,
                        "limit": 0,
                    }
                )

    return params, warnings
