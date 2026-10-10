"""
Property-based tests for the weather risk engine.

These tests verify the monotonicity invariants from specs/003 and
docs/testing.md: risk never decreases as wind speed or load weight
increases. Discrete unit tests only sample single points, so a regression
in a classifier boundary could otherwise slip through.

Execution settings are centralized in apps/api/conftest.py so every
property test runs deterministically under the same profile.
"""

from hypothesis import given
from hypothesis import strategies as st

from risk.engine import calculate_risk
from risk.schemas import WeatherObservation

WIND_MPH = st.floats(min_value=0.0, max_value=500.0, allow_nan=False)
LOAD_WEIGHT_LB = st.floats(min_value=0.0, max_value=200_000.0, allow_nan=False)


def clear_weather(wind_mph: float) -> WeatherObservation:
    """
    Return a weather observation with no rain or snow.
    """
    return WeatherObservation(
        wind_mph=wind_mph,
        rain_inches_per_hour=0.0,
        snow_inches_per_hour=0.0,
    )


@given(wind_mph=WIND_MPH, first_load=LOAD_WEIGHT_LB, second_load=LOAD_WEIGHT_LB)
def test_risk_never_decreases_as_load_increases(
    wind_mph: float,
    first_load: float,
    second_load: float,
) -> None:
    """
    A heavier load can only raise or keep the risk level.
    """
    lighter, heavier = sorted((first_load, second_load))

    lighter_result = calculate_risk(clear_weather(wind_mph), lighter)
    heavier_result = calculate_risk(clear_weather(wind_mph), heavier)

    assert heavier_result.level >= lighter_result.level


@given(load_weight_lb=LOAD_WEIGHT_LB, first_wind=WIND_MPH, second_wind=WIND_MPH)
def test_risk_never_decreases_as_wind_increases(
    load_weight_lb: float,
    first_wind: float,
    second_wind: float,
) -> None:
    """
    Stronger wind can only raise or keep the risk level.
    """
    slower, faster = sorted((first_wind, second_wind))

    slower_result = calculate_risk(clear_weather(slower), load_weight_lb)
    faster_result = calculate_risk(clear_weather(faster), load_weight_lb)

    assert faster_result.level >= slower_result.level


@given(wind_mph=WIND_MPH, load_weight_lb=LOAD_WEIGHT_LB)
def test_result_always_reports_at_least_one_reason(
    wind_mph: float,
    load_weight_lb: float,
) -> None:
    """
    Every risk classification carries at least one explanatory reason.
    """
    result = calculate_risk(clear_weather(wind_mph), load_weight_lb)

    assert result.level.value >= 1
    assert len(result.reasons) >= 1
