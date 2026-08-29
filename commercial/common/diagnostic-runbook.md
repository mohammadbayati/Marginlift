# Diagnostic execution runbook

| Stage | Input / action | Output / owner | Blocker |
|---|---|---|---|
| Intake | Scope and handoff | Intake record / MarginLift | Missing scope |
| Schema validation | CSV + PII guard | Validation result / Data | Invalid schema or PII |
| Data quality | Nulls, dates, linkage | Gap register / MarginLift + Data | Unusable linkage |
| Policy mapping | Current actions/no-action | Policy map / CRM | Policy unresolved |
| Cohort validation | Eligibility/exclusions | Population summary / Buyer | No meaningful cohort |
| Outcome definition | KPI/window | Draft outcome / Buyer + Outcome | Outcome undefined |
| Financial readiness | Formula and costs | Finance gap status / Finance | Formula unavailable |
| Shadow analysis | Historical/non-sending analysis | Descriptive findings / MarginLift | Evidence insufficient |
| Contact/contamination | Caps, overlap, exclusions | Risk findings / CRM | Unsafe execution |
| Experiment feasibility | Holdout, MDE, owners | Feasibility / MarginLift | Control impossible |
| Metric Contract | Draft canonical contract | Reviewable contract / joint | Required fields missing |
| Integrity review | Canonical checks | Diagnostic assessment / MarginLift | Blocking integrity |
| Evidence handoff | Package generation | Buyer Evidence Package / MarginLift | Unresolved trust |
| Buyer review | Decision meeting | GO / CAVEATS / NO-GO / Buyer | Acceptance pending |

Do not recalculate truth outside canonical engines.
