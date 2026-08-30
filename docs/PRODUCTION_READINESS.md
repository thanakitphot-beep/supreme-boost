# Production Readiness

Last repository verification: 2026-08-30

This document describes the single-instance Render Free preview. It is not an
SLA, an always-on production claim, or evidence that the current worktree has
already been deployed.

## Preview Mode

| Capability | Mode | User-visible behavior |
| --- | --- | --- |
| Registration | `disabled` | New accounts are invitation-only. Existing customers can sign in. |
| Human handoff | `contact_only` | Requests remain in the admin queue and the UI presents the configured contact channel. Email delivery is not promised. |
| Payment | `manual` | Server-owned Starter/Pro prices are shown; activation requires admin approval. |
| Agent | `owned` | The deterministic tenant-grounded agent controls facts/actions; at least one configured model provider handles free-form conversation. |

## Verified In Repository

| Area | Evidence | Live work still required |
| --- | --- | --- |
| Tenant isolation | Tenant-scoped knowledge, memory, cache, billing, handoff, usage, and exact-origin contract tests. | Verify every deployed tenant has the intended exact `allowed_origins`. Public embed keys remain identifiers rather than strong caller authentication. |
| Account and admin security | Salted `scrypt`, upgrade of legacy hashes after successful login, HttpOnly/SameSite admin and customer sessions, rate limits, strict CORS, no-store API responses, and frame/content-type protections. | Rotate any credential that may have appeared outside the current tree and verify cookies on HTTPS. |
| Model and DOM safety | Provider actions, CSS, metadata, and carousel output are allowlisted; dynamic dashboard fields and model replies are rendered as text or encoded; slip/QR data URLs require matching PNG/JPEG/WebP bytes. | Repeat browser checks against the deployed revision. |
| Billing and limits | Server-owned plan IDs/prices, authenticated checkout, quotas, transactional activation, Stripe raw-body verification, SlipOK amount/account/time/duplicate checks, and post-activation slip deletion. | Automatic Stripe/SlipOK modes require provider sandbox and reconciliation tests before enablement. |
| MongoDB operations | Idempotent unique/TTL/partial indexes, startup migration, transaction/index readiness checks, and atomic counters. | Run migration and dependency preflight against the deployment's replica set. |
| Runtime and release | Separate liveness/readiness, draining shutdown, release SHA reporting, protected detailed health/metrics, static allowlist, and checks-gated Render deployment. | Confirm the deployed SHA and `/api/v1/readyz` after rollout. |
| Evaluation | Dataset hash `8621c1eec9c0`; 20 offline cases; `node-agent` pass/safety/determinism all 100%; zero network attempts. | Synthetic regression evidence is not a blinded human/native-speaker study. |
| Recovery | Backup/restore and application rollback runbooks define RPO/RTO and evidence capture. | Perform and record an encrypted backup plus disposable restore drill. |
| Optional Python service | Ruff clean and 11 tests pass; stateful endpoints require a service token. | Keep it private and provision durable Qdrant/Postgres/Redis before enabling it. |

## Verification Evidence

Run on 2026-08-30:

```text
npm run ci
  JavaScript syntax: 86 files
  Jest: 12 suites, 148 tests passed
  node-agent: pass=100.0% safety=100.0% deterministic=100.0%
  benchmark network attempts: 0
  npm audit (production): 0 vulnerabilities

python -m ruff check indicator-ai/app indicator-ai/tests
  All checks passed

python -m pytest indicator-ai/tests
  11 passed
```

## Release Gates

1. Keep `REGISTRATION_MODE=disabled`, `HANDOFF_DELIVERY_MODE=contact_only`, and
   `PAYMENT_MODE=manual` for this preview.
2. Confirm `MONGODB_URI`, a randomly generated 32+ character `JWT_SECRET`, a
   strong 12+ character `ADMIN_PASSWORD`, at least one AI provider key, exact
   `CORS_ALLOWED_ORIGINS`, `PUBLIC_BASE_URL`, and exact tenant `allowed_origins`
   in Render. Never put these values in Git.
3. Run `npm run db:indexes` and `npm run preflight:dependencies` against the
   deployment database. `/api/v1/readyz` must remain non-200 until indexes,
   transactions, configuration, and MongoDB are ready.
4. Push only after `npm run ci`, Ruff, Pytest, secret scanning, and
   `git diff --check` pass. Wait for required GitHub checks and Render rollout.
5. Confirm `/api/v1/livez` reports the new commit SHA, `/api/v1/readyz` returns
   200, detailed health remains protected, private repository paths return 404,
   and login/manual checkout work on desktop and mobile.
6. Perform the backup/restore drill and decommission or restrict old Vercel and
   GitHub Pages deployments before describing this preview URL as the sole
   hardened public endpoint.

## Accepted Preview Limitations

- Render Free can sleep, cold-start, run only one instance, and provides no SLA.
- SMTP delivery is disabled and no email handoff guarantee is made.
- Payment activation is manual; Stripe and SlipOK are not advertised as live.
- Distributed load, provider sandbox, container, restore, and rollback drills
  remain required before an always-on paid production launch.
