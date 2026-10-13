"""
Unit tests for the complete weather and load risk engine.
"""

import pytest

from risk.engine import calculate_risk
from risk.schemas import RiskLevel, WeatherObservation


def make_clear_weather() -> WeatherObservation:
    """
    Return a low-risk weather observation used by multiple tests.
    """
    return WeatherObservation(
        wind_mph=0.0,
        rain_inches_per_hour=0.0,
        snow_inches_per_hour=0.0,
    )


def test_clear_weather_with_normal_load_is_low() -> None:
    """
    Clear weather and a valid load should result in Low risk.
    """
    result = calculate_risk(
        weather=make_clear_weather(),
        load_weight_lb=20_000,
    )

    assert result.level == RiskLevel.LOW
    assert result.score == 1


def test_wind_at_55_mph_is_no_travel_for_any_load() -> None:
    """
    Wind at or above 55 mph always results in No Travel.
    """
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=55.0,
            rain_inches_per_hour=0.0,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=0.0,
    )

    assert result.level == RiskLevel.NO_TRAVEL
    assert "wind >= 55 mph" in result.reasons


def test_heavy_load_with_45_mph_wind_is_no_travel() -> None:
    """
    A load above 30,000 lb and wind from 45 to below 55 mph
    results in No Travel.
    """
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=45.0,
            rain_inches_per_hour=0.0,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=30_001.0,
    )

    assert result.level == RiskLevel.NO_TRAVEL
    assert "wind 45-54 mph with load > 30,000 lb" in result.reasons


def test_load_at_30000_lb_does_not_trigger_45_mph_rule() -> None:
    """
    The assessment specifies a load strictly greater than 30,000 lb.
    """
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=45.0,
            rain_inches_per_hour=0.0,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=30_000.0,
    )

    assert result.level == RiskLevel.SEVERE


def test_heavy_load_with_35_mph_wind_is_severe() -> None:
    """
    A load above 40,000 lb and wind from 35 to below 45 mph
    results in Severe risk.
    """
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=35.0,
            rain_inches_per_hour=0.0,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=40_001.0,
    )

    assert result.level == RiskLevel.SEVERE
    assert "wind 35-44 mph with load > 40,000 lb" in result.reasons


def test_load_at_40000_lb_does_not_trigger_35_mph_rule() -> None:
    """
    The assessment specifies a load strictly greater than 40,000 lb.
    """
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=35.0,
            rain_inches_per_hour=0.0,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=40_000.0,
    )

    assert result.level == RiskLevel.HIGH


def test_highest_weather_severity_wins() -> None:
    """
    The highest severity among wind, rain, and snow must be selected.
    """
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=10.0,
            rain_inches_per_hour=1.1,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=10_000.0,
    )

    assert result.level == RiskLevel.NO_TRAVEL
    assert "rain" in result.reasons


def test_multiple_conditions_with_same_highest_level_are_preserved() -> None:
    """
    Reasons should include all weather conditions tied at the final
    weather severity.
    """
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=35.0,
            rain_inches_per_hour=0.30,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=10_000.0,
    )

    assert result.level == RiskLevel.HIGH
    assert "rain" in result.reasons
    assert "wind" in result.reasons


def test_negative_load_weight_is_rejected() -> None:
    """
    A truck load cannot be negative.
    """
    with pytest.raises(ValueError, match="load_weight_lb cannot be negative"):
        calculate_risk(
            weather=make_clear_weather(),
            load_weight_lb=-1.0,
        )


@pytest.mark.parametrize(
    "load_weight_lb",
    [float("nan"), float("inf"), float("-inf")],
)
def test_non_finite_load_weight_is_rejected(load_weight_lb: float) -> None:
    """
    NaN and infinite load values must be rejected.
    """
    with pytest.raises(ValueError, match="load_weight_lb must be finite"):
        calculate_risk(
            weather=make_clear_weather(),
            load_weight_lb=load_weight_lb,
        )


def test_load_30_lb_does_not_trigger_45_mph_rule() -> None:
    """Thirty pounds is a light load, not thirty thousand: the >30,000 lb
    rule must not fire. Catches unit confusion between lb and thousands."""
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=45.0,
            rain_inches_per_hour=0.0,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=30.0,
    )

    assert result.level == RiskLevel.SEVERE


def test_load_30000_01_lb_triggers_45_mph_rule() -> None:
    """The >30,000 lb boundary is exclusive: 30,000.01 activates it."""
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=45.0,
            rain_inches_per_hour=0.0,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=30_000.01,
    )

    assert result.level == RiskLevel.NO_TRAVEL


def test_load_40000_01_lb_triggers_35_mph_rule() -> None:
    """The >40,000 lb boundary is exclusive: 40,000.01 activates it."""
    result = calculate_risk(
        weather=WeatherObservation(
            wind_mph=35.0,
            rain_inches_per_hour=0.0,
            snow_inches_per_hour=0.0,
        ),
        load_weight_lb=40_000.01,
    )

    assert result.level == RiskLevel.SEVERE
