# MarginLift Fixture Strategy

These fixtures are deterministic engineering inputs only. They are not customer
exports, do not contain secrets, and are intentionally separate from the public
root-level `synthetic-*.csv` demo samples.

## Layers

- `minimal`: the smallest valid campaign/customer/outcome set for parser and
  storage-contract checks.
- `regression`: broader deterministic rows for repeatable domain regression
  checks.
- `production-smoke`: non-sensitive smoke data and expected production health
  contracts used by `scripts/verify-production.js`.

## Storage Parity

Fixture validation builds one canonical state payload per layer. JSON mode maps
that payload to `data/db.json`; PostgreSQL mode maps the same payload to
`marginlift_state.payload`. The validator compares stable hashes for both
drivers so fixture drift is caught before implementation work depends on it.
