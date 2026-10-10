"""
Pure weather classification rules.

Each classifier accepts one normalized weather value and returns a RiskLevel.

Boundary convention:

- Lower bounds are inclusive.
- Upper bounds are exclusive.
- Explicit exceptions are documented in the function definitions.

Examples:

    25 mph wind is Moderate.
    35 mph wind is High.
    55 mph wind is No Travel.
"""

from math import isfinite

from .schemas import RiskLevel


def _validate_non_negative_finite(value: float, field_name: str) -> None:
    """
    Validate a numeric weather value.

    Args:
        value: Value to validate.
        field_name: Field name used in the error message.

    Raises:
        ValueError: If the value is negative, NaN, or infinite.
    """
    if not isfinite(value):
        raise ValueError(f"{field_name} must be finite.")

    if value < 0:
        raise ValueError(f"{field_name} cannot be negative.")


def classify_wind(wind_mph: float) -> RiskLevel:
    """
    Classify wind speed according to the assessment rules.

    Thresholds:

    - Less than 25 mph: Low
    - 25 to less than 35 mph: Moderate
    - 35 to less than 45 mph: High
    - 45 to less than 55 mph: Severe
    - 55 mph or higher: No Travel

    Args:
        wind_mph: Wind speed in miles per hour.

    Returns:
        The corresponding weather risk level.

    Raises:
        ValueError: If the value is negative, NaN, or infinite.
    """
    _validate_non_negative_finite(wind_mph, "wind_mph")

    if wind_mph < 25:
        return RiskLevel.LOW

    if wind_mph < 35:
        return RiskLevel.MODERATE

    if wind_mph < 45:
        return RiskLevel.HIGH

    if wind_mph < 55:
        return RiskLevel.SEVERE

    return RiskLevel.NO_TRAVEL


def classify_rain(rain_inches_per_hour: float) -> RiskLevel:
    """
    Classify rain intensity according to the assessment rules.

    Thresholds:

    - Less than 0.10 in/hr: Low
    - 0.10 to less than 0.25 in/hr: Moderate
    - 0.25 to less than 0.50 in/hr: High
    - 0.50 to 1.00 in/hr: Severe
    - Greater than 1.00 in/hr: No Travel

    The value 1.00 in/hr is included in the Severe range because the
    assessment describes the No Travel range as greater than 1.00 in/hr.

    Args:
        rain_inches_per_hour: Rain intensity in inches per hour.

    Returns:
        The corresponding weather risk level.

    Raises:
        ValueError: If the value is negative, NaN, or infinite.
    """
    _validate_non_negative_finite(
        rain_inches_per_hour,
        "rain_inches_per_hour",
    )

    if rain_inches_per_hour < 0.10:
        return RiskLevel.LOW

    if rain_inches_per_hour < 0.25:
        return RiskLevel.MODERATE

    if rain_inches_per_hour < 0.50:
        return RiskLevel.HIGH

    if rain_inches_per_hour <= 1.00:
        return RiskLevel.SEVERE

    return RiskLevel.NO_TRAVEL


def classify_snow(snow_inches_per_hour: float) -> RiskLevel:
    """
    Classify snow intensity according to the assessment rules.

    Thresholds:

    - Less than 0.5 in/hr: Low
    - 0.5 to less than 1.0 in/hr: Moderate
    - 1.0 to less than 2.0 in/hr: High
    - 2.0 to 3.0 in/hr: Severe
    - Greater than 3.0 in/hr: No Travel

    The value 3.0 in/hr is included in the Severe range because the
    assessment describes the No Travel range as greater than 3.0 in/hr.

    Args:
        snow_inches_per_hour: Snow intensity in inches per hour.

    Returns:
        The corresponding weather risk level.

    Raises:
        ValueError: If the value is negative, NaN, or infinite.
    """
    _validate_non_negative_finite(
        snow_inches_per_hour,
        "snow_inches_per_hour",
    )

    if snow_inches_per_hour < 0.5:
        return RiskLevel.LOW

    if snow_inches_per_hour < 1.0:
        return RiskLevel.MODERATE

    if snow_inches_per_hour < 2.0:
        return RiskLevel.HIGH

    if snow_inches_per_hour <= 3.0:
        return RiskLevel.SEVERE

    return RiskLevel.NO_TRAVEL
