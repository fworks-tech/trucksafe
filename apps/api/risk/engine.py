"""
Weather and load risk calculation engine.

This module contains the main domain operation used to calculate the final
risk level for a route checkpoint.

The engine follows these steps:

1. Classify wind, rain, and snow independently.
2. Select the highest weather severity.
3. Apply load-specific rules.
4. Preserve all relevant reasons.
5. Return an immutable RiskResult.

The module does not perform HTTP requests, database access, logging, or
framework-specific operations.
"""

from math import isfinite

from .rules import classify_rain, classify_snow, classify_wind
from .schemas import RiskLevel, RiskResult, WeatherObservation


def _validate_load_weight(load_weight_lb: float) -> None:
    """
    Validate truck load weight.

    Args:
        load_weight_lb: Truck load weight in pounds.

    Raises:
        ValueError: If the value is negative, NaN, or infinite.
    """
    if not isfinite(load_weight_lb):
        raise ValueError("load_weight_lb must be finite.")

    if load_weight_lb < 0:
        raise ValueError("load_weight_lb cannot be negative.")


def calculate_risk(
    weather: WeatherObservation,
    load_weight_lb: float,
) -> RiskResult:
    """
    Calculate final checkpoint risk.

    Weather conditions are classified independently. The highest weather
    severity is selected before applying load-specific rules.

    Load rules from the assessment:

    - Wind >= 55 mph results in No Travel for every load.
    - Wind from 45 to less than 55 mph and load > 30,000 lb results in
      No Travel.
    - Wind from 35 to less than 45 mph and load > 40,000 lb results in
      Severe.

    Load rules may increase risk severity but can never lower it.

    Args:
        weather: Normalized weather observations.
        load_weight_lb: Truck load weight in pounds.

    Returns:
        A RiskResult containing the final level and explanatory reasons.

    Raises:
        ValueError: If any weather or load value is invalid.
    """
    _validate_load_weight(load_weight_lb)

    weather_levels = {
        "wind": classify_wind(weather.wind_mph),
        "rain": classify_rain(weather.rain_inches_per_hour),
        "snow": classify_snow(weather.snow_inches_per_hour),
    }

    final_level = max(weather_levels.values())

    reasons = {
        condition for condition, level in weather_levels.items() if level == final_level
    }

    if weather.wind_mph >= 55:
        final_level = max(final_level, RiskLevel.NO_TRAVEL)
        reasons.add("wind >= 55 mph")

    elif 45 <= weather.wind_mph < 55 and load_weight_lb > 30_000:
        final_level = max(final_level, RiskLevel.NO_TRAVEL)
        reasons.add("wind 45-54 mph with load > 30,000 lb")

    elif 35 <= weather.wind_mph < 45 and load_weight_lb > 40_000:
        final_level = max(final_level, RiskLevel.SEVERE)
        reasons.add("wind 35-44 mph with load > 40,000 lb")

    return RiskResult(
        level=final_level,
        reasons=tuple(sorted(reasons)),
    )
