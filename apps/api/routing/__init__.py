"""
Route planning domain package.

This package contains the business rules used to generate route checkpoints
and calculate checkpoint estimated arrival times.

The implementation is intentionally independent from Django, HTTP clients,
databases, and external API providers.

This package is not a registered Django application because it owns no
models. Add an AppConfig and migrations/ if that changes.
"""
