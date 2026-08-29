# MilliGold data request

## Diagnostic required

- `customer_id_hash`
- event or transaction identifier where available
- purchase timestamp
- purchase sequence or fields sufficient to derive it
- transaction value
- second-purchase signal
- historical action/campaign type and timestamp
- available discount/message/channel cost fields

## Pilot required

- assignment and treatment/control label
- assignment timestamp
- exposure and delivery status/timestamp
- second-purchase timestamp/outcome
- contribution-margin inputs
- exclusions/consent/contact-cap fields where applicable
- snapshot and lineage metadata

## Optional

- product family
- campaign ID
- channel metadata
- discount detail
- additional margin enrichment

Hashed IDs and batch files are acceptable for the initial diagnostic. Raw identity PII is not required. MilliGold Marketing/CRM, Data and Finance owners must participate.
