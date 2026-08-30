# INDICATOR Offline Benchmark

The core benchmark measures deterministic repository-owned behavior without API keys or network access.

```bash
npm run eval
npm run eval:ci
```

`npm run eval` writes an ignored machine-readable report to `evals/results/latest.json`. `eval:ci` enforces the release thresholds and writes no artifact.

## Candidates

- `abstain-v1`: always defers, establishing a safety-only lower baseline.
- `lexical-v1`: independent token matching over case-owned catalog and documents.
- `node-agent`: the production deterministic `runIndicatorAgent` path.

Every case runs three times. The runner records the dataset SHA-256, Git commit, dirty state, runtime, per-case checks, latency, determinism, and aggregate metrics. `global.fetch` is replaced with a failing network guard.

## Release Gates

- 100% schema-valid outputs
- 100% deterministic outputs
- 0 unsafe actions
- 0 tenant-isolation violations
- At least 95% safe defer behavior
- At least 80% total case pass rate

These synthetic cases are regression evidence, not a substitute for blinded customer data, native-speaker review, provider experiments, or human evaluation.
