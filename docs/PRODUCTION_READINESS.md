# Production Readiness Matrix

Last verified: 2026-08-26

Percentages measure the repository's implementation and local verification,
not a claim that a production environment has been deployed. A row marked
"blocked" cannot be completed without an external account, infrastructure, or
customer-site integration.

## Target areas

| Area | Repository readiness | Current basis | Live verification still required |
| --- | ---: | --- | --- |
| Horizontal scaling | 85% | Rate limits and billing-period usage counters use conditional atomic MongoDB updates with unique/TTL indexes. Production conversations are stateless, and readiness verifies critical indexes before accepting traffic. | Run concurrent traffic against at least two replicas and a production MongoDB replica set. |
| Billing and usage limits | 82% | Server-owned plans/prices, per-tenant quotas, authenticated checkout, Stripe raw-body signature verification and transactional activation, SlipOK amount/account/time/duplicate checks, and immutable paid ledger entries are implemented. | Use provider test/live accounts to verify Stripe event delivery/order and real SlipOK response fields. |
| Production deployment workflow | 76% | Configuration/dependency/live preflight commands, Mongo migration gates, liveness/readiness separation, protected metrics, graceful shutdown, a free Render preview workflow, Compose health checks, and a Kubernetes migration Job/startup probe exist. | Move Render to an always-on paid instance, enable dependency-gated startup, then run domain, SMTP, Mongo, provider, backup/restore, and rollback checks in the target environment. |

| Area | Readiness | What works now | Evidence | Remaining blocker |
| --- | ---: | --- | --- | --- |
| Tenant-grounded AI | 85% | The default agent retrieves only the current tenant's knowledge, answers from it, and returns sources shown in the widget. | Node contracts cover tenant knowledge, source display, and cache scope. | Run against a production MongoDB corpus and measure answer quality with customer data. |
| Conversation isolation | 85% | Memory/cache keys include tenant and conversation; tenant knowledge and long-term-memory API reads/writes are tenant-scoped. | Node contracts cover cache and memory authorization. | Public embed keys are identifiers, not proof of caller identity. A tenant-hosted BFF or signed installation-token protocol is needed for strong request authentication. |
| Account security | 80% | New passwords use salted `scrypt`; legacy SHA-256/plaintext records upgrade after a successful login. Admin-created tenants receive a random initial password. | Password migration contract test. | Existing credentials in prior Git history and any deployed database must be rotated. |
| Registration verification | 80% | Registration requires a short-lived, email-bound, single-use verification grant. OTP values are not logged and SMTP absence fails closed. | Grant contract test. | Test the full SMTP/Mongo journey with real mail infrastructure. |
| Static-file safety | 85% | The local server denies data, source, test, and configuration paths; Vercel rewrites deny sensitive directories. Tracked tenant data file was removed. | Local HTTP contract test and valid `vercel.json`. | Deploy preview and confirm Vercel rewrite precedence. Rotate any key previously committed to Git. |
| Model action safety | 90% | Production always uses the owned agent; provider output is restricted to handoff/speech. The widget no longer accepts HTML injection, plugin actions, or model-triggered third-party scripts. | Validator and widget contracts. | Perform browser security testing on the deployed widget. |
| Optional Python intelligence | 80% | Node scopes its site ID to `tenantId`; Python stateful routes require a service token and are not host-published by its Compose stack. | Python tests cover missing/wrong/correct service token. | Configure a private network, service token, and durable Qdrant/Postgres stores. |
| Human handoff | 75% | Tenant-scoped idempotent ticket claims, monthly quota, PII masking, and SMTP delivery attempt are implemented. | Contracts cover demo behavior; Mongo unique index protects duplicate ticket claims. | Failed SMTP deliveries still need a durable retry worker and real SMTP verification. |
| MongoDB operations | 85% | A repeatable migration creates unique/TTL/partial indexes for tenants, usage, limits, billing, OTP, and grants; one-shot scripts close their pool and readiness checks critical index options. | Atomic-counter and index-readiness contracts plus migration/preflight code. | Run migration, concurrency, backup, and restore checks against a production replica set. |
| Container deployment | 78% | Production Dockerfile and Compose startup migration/config gate/health check exist without source bind mounts. | Build configuration, syntax, and local application build inspected. | Docker is unavailable in this workspace, so the image and container probe remain unverified. |
| Render/Vercel deployment | 70% | Render has a free preview deployment with strict CORS, shared Mongo state, build-time index migration, and liveness routing. Vercel webhook raw-stream handling is implemented. | Configuration contracts and local HTTP tests. | Free Render sleeps, cannot scale beyond one instance, and blocks SMTP ports. Upgrade to an always-on instance, configure provider secrets/domains, and execute dependency/live preflight; Vercel migrations must be run as a separate release step. |
| Rate limiting and metrics | 85% | Cross-instance atomic Mongo windows, tenant plan limits, trusted-proxy hop selection, fail-closed production behavior, and protected detailed metrics exist. | Concurrency and proxy contracts; readiness rejects missing indexes. | Run distributed load tests and connect aggregate observability/alerting. |
| Billing and entitlements | 82% | Stripe and SlipOK automatic flows activate only authenticated tenant-linked requests; plans and usage are enforced server-side for chat, crawl, handoff, knowledge-upload operations, and memory. | Billing signature, stream, binding, activation, plan, and quota contracts. | Complete Stripe/SlipOK sandbox and live webhook tests, then add reconciliation/refund operations. |
| Kubernetes | 72% | Deployment/HPA, migration Job, startup/liveness/readiness probes, service, and ingress templates exist. | Static configuration and application contracts. | Provide an immutable image, secret/config resources, TLS, disruption budget, and cluster validation. |

## Release Gates

1. Rotate any tenant API keys, OTP secrets, or other credentials previously
   committed to Git. The removed local data file does not erase Git history.
2. Provision a MongoDB replica set, run `npm run db:indexes`, then run
   `npm run preflight:dependencies`.
3. Set `JWT_SECRET`, `ADMIN_PASSWORD`, `MONGODB_URI`, `CORS_ALLOWED_ORIGINS`,
   and exact tenant `allowed_origins`; keep `REQUIRE_TENANT_API_KEY=true`.
4. Configure `PAYMENT_MODE=both`, Stripe prices/webhook, SlipOK receiver
   account, and SMTP entirely in server-side environment variables.
5. Configure an AI provider only when needed. The deterministic owned agent
   works without one, but a provider is required for optional generative paths.
6. Configure SMTP and a retry worker before advertising human handoff as a
   guaranteed delivery channel.
7. For a customer-facing production widget, replace public-key-only requests
   with a tenant-hosted BFF or short-lived signed installation token. Browser
   `Origin` and CORS checks are not server authentication.
8. Build and run the Docker image, deploy a preview, register Stripe webhook
   events, test SlipOK with a fresh sandbox transfer, and run
   `npm run preflight:live` before production traffic.
