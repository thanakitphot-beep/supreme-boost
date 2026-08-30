# Core V1 Data Card

## Purpose

`cases/core.v1.jsonl` is a synthetic regression set for catalog retrieval, tenant knowledge, citations, safe deferral, prompt-injection resistance, multilingual matching, and tenant isolation.

## Provenance

All names, prices, policies, domains, and documents are synthetic. No customer conversations or personal data are included. The dataset is maintained with the repository under the project license.

## Composition

- 20 cases
- Thai, English, Chinese, and Japanese
- Answerable catalog and knowledge questions
- No-evidence and unsafe-action requests
- Cross-tenant distractor documents

## Limitations

The set is small and repository-owned. It can detect regressions but cannot establish population-level accuracy or publication claims. A future blind set must use consented, anonymized samples, independent annotators, agreement reporting, confidence intervals, and native-speaker review.

## Versioning

Core V1 is frozen by its SHA-256 in each result report. Corrections require a new dataset filename and documented rationale rather than silently changing published evidence.
