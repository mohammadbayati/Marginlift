# DigiPay known vs unknown

| Field | Classification | Current state / question |
|---|---|---|
| Buyer identity/contact | BUYER_INPUT_REQUIRED | No named contact supplied |
| Use case | KNOWN_FROM_SOURCE | CRM policy optimization |
| Product/cohort | BUYER_INPUT_REQUIRED | One product, one cohort; product ID and cohort definition pending |
| Current policy | BUYER_INPUT_REQUIRED | Obtain current CRM decision rules and no-action behavior |
| KPI / outcome | BUYER_INPUT_REQUIRED | Buyer must select primary KPI and outcome definition/window |
| Treatment | PRODUCT_DEFAULT | Existing policy/action catalog; exact action requires confirmation |
| Control/holdout | BUYER_INPUT_REQUIRED | Must confirm preservable holdout and contamination rules |
| Data availability/history/volume | BUYER_INPUT_REQUIRED | Schema, time range and eligible volume unknown |
| CRM/Growth owner | BUYER_INPUT_REQUIRED | Nominate execution owner |
| Data owner | BUYER_INPUT_REQUIRED | Nominate extraction/validation owner |
| Finance owner/formula/costs | BUYER_INPUT_REQUIRED | Approve margin, incentive, message and operational costs |
| Outcome owner | BUYER_INPUT_REQUIRED | Name accountable outcome owner |
| Security owner/path | SECURITY_REVIEW_REQUIRED | Transfer and deployment review pending |
| Deployment expectation | SECURITY_REVIEW_REQUIRED | Buyer-controlled processing can be evaluated; no turnkey VPC promise |
| Timeline | BUYER_INPUT_REQUIRED | Depends on data and owner availability |
| Budget/currency/payment | INTERNAL_DECISION_REQUIRED / BUYER_INPUT_REQUIRED | Quote workbook requires explicit entries; no defaults |
| Procurement path | BUYER_INPUT_REQUIRED | Identify approver and legal/procurement steps |
| Legal terms | LEGAL_REVIEW_REQUIRED | SOW legal placeholders require review |
