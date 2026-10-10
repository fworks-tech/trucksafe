"""
Unit tests for individual weather classification rules.

These tests focus on threshold boundaries because an off-by-one or
off-by-decimal error could change the operational recommendation.
"""

from collections.abc import Callable

import pytest

from risk.rules import classify_rain, classify_snow, classify_wind
from risk.schemas import RiskLevel


@pytest.mark.parametrize(
    ("wind_mph", "expected_level"),
    [
        (0.0, RiskLevel.LOW),
        (24.99, RiskLevel.LOW),
        (25.0, RiskLevel.MODERATE),
        (34.99, RiskLevel.MODERATE),
        (35.0, RiskLevel.HIGH),
        (44.99, RiskLevel.HIGH),
        (45.0, RiskLevel.SEVERE),
        (54.99, RiskLevel.SEVERE),
        (55.0, RiskLevel.NO_TRAVEL),
    ],
)
def test_wind_thresholds(
    wind_mph: float,
    expected_level: RiskLevel,
) -> None:
    """
    Verify every wind risk boundary.
    """
    assert classify_wind(wind_mph) == expected_level


@pytest.mark.parametrize(
    ("rain_rate", "expected_level"),
    [
        (0.0, RiskLevel.LOW),
        (0.099, RiskLevel.LOW),
        (0.10, RiskLevel.MODERATE),
        (0.249, RiskLevel.MODERATE),
        (0.25, RiskLevel.HIGH),
        (0.499, RiskLevel.HIGH),
        (0.50, RiskLevel.SEVERE),
        (1.00, RiskLevel.SEVERE),
        (1.001, RiskLevel.NO_TRAVEL),
    ],
)
def test_rain_thresholds(
    rain_rate: float,
    expected_level: RiskLevel,
) -> None:
    """
    Verify every rain risk boundary.
    """
    assert classify_rain(rain_rate) == expected_level


@pytest.mark.parametrize(
    ("snow_rate", "expected_level"),
    [
        (0.0, RiskLevel.LOW),
        (0.499, RiskLevel.LOW),
        (0.5, RiskLevel.MODERATE),
        (0.999, RiskLevel.MODERATE),
        (1.0, RiskLevel.HIGH),
        (1.999, RiskLevel.HIGH),
        (2.0, RiskLevel.SEVERE),
        (3.0, RiskLevel.SEVERE),
        (3.001, RiskLevel.NO_TRAVEL),
    ],
)
def test_snow_thresholds(
    snow_rate: float,
    expected_level: RiskLevel,
) -> None:
    """
    Verify every snow risk boundary.
    """
    assert classify_snow(snow_rate) == expected_level


@pytest.mark.parametrize(
    ("classifier", "invalid_value"),
    [
        (classify_wind, -1.0),
        (classify_rain, -0.01),
        (classify_snow, -0.1),
    ],
)
def test_negative_weather_values_are_rejected(
    classifier: Callable[[float], RiskLevel],
    invalid_value: float,
) -> None:
    """
    Negative weather values must not enter the domain engine.
    """
    with pytest.raises(ValueError):
        classifier(invalid_value)


@pytest.mark.parametrize(
    ("classifier", "invalid_value"),
    [
        (classify_wind, float("nan")),
        (classify_rain, float("inf")),
        (classify_snow, float("-inf")),
    ],
)
def test_non_finite_weather_values_are_rejected(
    classifier: Callable[[float], RiskLevel],
    invalid_value: float,
) -> None:
    """
    NaN and infinite values must be rejected.
    """
    with pytest.raises(ValueError):
        classifier(invalid_value)
