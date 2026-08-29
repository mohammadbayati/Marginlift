# Data intake kit

Transfer method: `BUYER_CONFIRMATION_REQUIRED`. Preferred format: CSV/batch. File names should include buyer, use case, snapshot date and version; exact convention is agreed during scoping.

Validation sequence: header/schema check → hashed-ID/PII guard → null/type/timestamp validation → duplicate and lineage checks → canonical buyer readiness audit → result `SCHEMA_VALID`, `SCHEMA_VALID_WITH_WARNINGS` or `SCHEMA_INVALID`; then `DIAGNOSTIC_DATA_READY` or `DIAGNOSTIC_DATA_NOT_READY`.

Row-level failures are reported, not silently dropped. Unknown fields remain unresolved. A data snapshot ID is retained for Metric Contract and Evidence Package lineage.
