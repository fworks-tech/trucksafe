"""
Shared pytest configuration for the backend test suite.

Every property-based test runs under the single profile registered here,
so execution settings stay centralized and deterministic as more
properties are added: the same examples run on every machine and every
run unless HYPOTHESIS_PROFILE selects another registered profile.
"""

import os

from hypothesis import settings as hypothesis_settings

hypothesis_settings.register_profile(
    "trucksafe",
    max_examples=300,
    deadline=None,
    derandomize=True,
)
hypothesis_settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "trucksafe"))
