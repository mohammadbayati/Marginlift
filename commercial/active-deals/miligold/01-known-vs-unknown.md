# MilliGold known vs unknown

| Field | Classification | Current state / question |
|---|---|---|
| Buyer identity/contact | BUYER_INPUT_REQUIRED | No named contact supplied |
| Use case | KNOWN_FROM_SOURCE | First purchase → second purchase |
| Repeat continuity | PRODUCT_DEFAULT | Future template only; not active initial pilot |
| First purchase event/index | BUYER_INPUT_REQUIRED | Define canonical event and index date |
| Second purchase event | BUYER_INPUT_REQUIRED | Define event and exclusions |
| Cohort/exclusions | BUYER_INPUT_REQUIRED | One cohort; buyer must define eligibility |
| Outcome window | BUYER_INPUT_REQUIRED | Proposed only; freeze in Metric Contract |
| Current policy/treatment | BUYER_INPUT_REQUIRED | Confirm CRM intervention and no-action control |
| Holdout | BUYER_INPUT_REQUIRED | Confirm preservable randomized holdout |
| Purchase/action/outcome history | BUYER_INPUT_REQUIRED | Availability, depth and volume unknown |
| CRM/Marketing owner | BUYER_INPUT_REQUIRED | Owns execution and delivery logging |
| Data owner | BUYER_INPUT_REQUIRED | Owns event/assignment/outcome data |
| Finance owner/formula/costs | BUYER_INPUT_REQUIRED | Contribution margin, discounts, message/channel costs |
| Outcome owner | BUYER_INPUT_REQUIRED | Nominate accountable owner |
| Security owner/path | SECURITY_REVIEW_REQUIRED | Transfer and deployment review pending |
| Timeline/budget/currency/payment | BUYER_INPUT_REQUIRED / INTERNAL_DECISION_REQUIRED | No silent defaults |
| Procurement/legal | BUYER_INPUT_REQUIRED / LEGAL_REVIEW_REQUIRED | Approver and terms unknown |
