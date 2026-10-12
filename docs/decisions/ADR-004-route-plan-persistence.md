# ADR-004: Route Plan Persistence in the POST Slice

## Status

Accepted

## Context

POST /api/v1/route-plans returns a plan `id` and the documented API
includes plan retrieval. The vertical slice (PR 3) therefore persists
successful plans instead of recomputing them on every identical request.

## Decision

Persist each successful plan as one immutable `RoutePlan` row:

- The primary key is the deterministic plan id: SHA-256 hex over the
  canonical request (`sort_keys`, compact separators, departure
  normalized to UTC ISO, addresses lowercased/stripped, coordinates as
  exact floats). Identical normalized requests hash identically.
- POST is get-or-create on that key: first request returns `201` with
  the computed payload; repeats return `200` with the stored payload.
- Nothing is written before orchestration succeeds. Persistence is a
  single atomic `get_or_create`, so failures leave no partial records
  and concurrent identical requests converge on one row via the primary
  key (verified by the repeat-request test asserting a single row).
- Only successful plans are stored. Provider and validation failures
  return the error envelope without a record.
- SQLite remains the storage backend in this phase: it is the scaffold
  default in `config/settings.py` and sufficient for deterministic
  single-process development and tests. PostgreSQL arrives with
  deployment work per the architecture; the model carries no
  backend-specific fields.

## Consequences

Plan retrieval (`GET /route-plans/{id}`) can build directly on these
records in a later slice. The stored `response` JSON is the exact
payload returned, so reads never recompute risk.
