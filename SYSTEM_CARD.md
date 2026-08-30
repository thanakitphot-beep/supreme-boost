# INDICATOR System Card

INDICATOR is a multi-tenant website assistant that retrieves tenant-owned catalog and knowledge content, returns citations, proposes bounded same-origin navigation, and can queue human handoffs.

## Intended Use

- Answer public website questions from configured evidence
- Help visitors locate products, policies, and pages
- Queue support requests
- Enforce tenant plans and usage limits

## Non-Goals

- Autonomous payment, credential, admin, or sensitive-page actions
- Legal, medical, financial, or safety-critical advice
- Treating a public widget identifier as strong caller authentication

## Controls

- Exact tenant origins and API-key lookup
- Same-origin action validation
- PII masking and action allowlists
- Mongo-backed production rate and usage limits
- Transactional billing activation
- Offline safety, citation, isolation, and determinism benchmark

## Current Limitations

The free Render deployment is a preview: it can sleep, runs one instance, has no platform SLA, uses manual payment approval, and disables public email registration. The synthetic benchmark is regression evidence rather than a blinded human study.
