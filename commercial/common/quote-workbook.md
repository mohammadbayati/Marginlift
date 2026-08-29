# Internal quote workbook

Status values: `QUOTE_DRAFT`, `QUOTE_NEEDS_INPUT`, `QUOTE_READY_FOR_INTERNAL_APPROVAL`, `FINAL_QUOTE_READY`.

Required inputs: buyer, use case, stage, scope, data-source count/complexity, cohort/product count, KPI count, financial complexity, integration/security complexity, Diagnostic/Pilot duration, Evidence Package scope, currency, payment structure and commercial decision owner.

Outputs: LOW / TARGET / HIGH quote scenarios, price confidence, assumptions, inclusions, exclusions, adjusters and milestones.

Rule: missing required inputs produce `QUOTE_NOT_READY`; no silent defaults. A final quote is not buyer-approved until externally accepted.

Base scope is one use case, one cohort, one primary KPI, one data snapshot and one Evidence Package. Adjusters are additive only after approval: extra cohort/product/source/KPI, custom integration, security work, custom financial model or extended duration.
