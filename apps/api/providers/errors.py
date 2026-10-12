"""Provider failure taxonomy shared by routing and weather adapters.

Transient failures (timeouts, rate limits, 5xx) may be retried with
exponential backoff. Permanent failures (validation, auth, no route)
must never be retried.
"""


class ProviderError(Exception):
    """Base class for all external provider failures."""


class ProviderTransientError(ProviderError):
    """Retryable provider failure: timeout, rate limit, or 5xx."""


class ProviderPermanentError(ProviderError):
    """Non-retryable provider failure: validation, auth, or no route."""
