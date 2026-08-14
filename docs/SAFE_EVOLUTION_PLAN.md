# Supreme Boost: Safe Evolution Plan

This document outlines the strategic plan to evolve the existing "Supreme Boost" project into a secure, multi-tenant AI SaaS platform. The evolution is designed to be incremental, safe, and backward-compatible.

## 1. Current Architecture

*   **Framework & Runtime:** Node.js (CommonJS) backend serving as both a local Express-style server (`server.js`) and Vercel Serverless Functions (`vercel.json`).
*   **Entry Points:** 
    *   Backend: `server.js` (local dev) and `/api/*` routes (Vercel).
    *   Frontend Widget: `src/widget/main.js` bundled into `supreme-boost/boost.js` via `esbuild`.
    *   Web UI: Static HTML files (`index.html`, `admin-dashboard.html`, `customer-dashboard.html`).
*   **API Routes:** Core orchestration in `api/chat.js`. Supporting routes for auth (`_auth.js`, `customer-auth.js`), plugins, and knowledge ingestion.
*   **Widget Code:** Vanilla JavaScript utilizing Shadow DOM for style isolation, indexedDB for session memory, and synthetic events (hover/scroll tracking) for proactive chat triggers.
*   **Auth Flow:** Custom JWT implementation with HMAC timestamp fallback (`api/_auth.js`).
*   **Data Storage:** Dual-database confusion. Environment variables point to both MongoDB (`MONGODB_URI`) and Supabase (`SUPABASE_URL`).
*   **Docker/Deployment:** Configured for Vercel (primary), alongside a `Dockerfile` and `docker-compose.yml` intended for VPS/K8s deployment (currently broken).
*   **Existing Flows to Preserve:** 
    *   Third-party widget script injection (`boost.js`).
    *   Chat payload structure and proactive triggering.
    *   Dynamic CSS injection (`cssCommand`) from AI responses.

## 2. Verification of Known Risks

The following risks have been audited and **verified**:

1.  **Missing Route Handler:** `server.js` explicitly maps `'/api/auth': require('./api/auth.js')`, but the file is named `api/_auth.js`. This will cause `MODULE_NOT_FOUND` crashes on local startup or serverless execution.
2.  **Broken Docker Build:** The `Dockerfile` at line 34 attempts to copy a nonexistent `/client` directory (`COPY --from=builder /usr/src/app/client ./client`), which will consistently fail the build.
3.  **Security Vulnerabilities (Critical):**
    *   **Auth Bypass:** `api/_auth.js` contains a hardcoded static bypass token (`ADMIN_SUPREME_TOKEN_12345`).
    *   **CORS:** Broad wildcard CORS (`*`) on API routes allows unauthorized domains to consume API quotas.
    *   **Tenant Isolation:** Chat API relies on client-provided `apiKey` without strict backend validation against a verified origin.
4.  **RCE Risk in Plugins:** `services/plugins/manager.js` loads plugin code from the database and executes it dynamically using `new Function('context', 'hook', ...)`. This is a severe Remote Code Execution vulnerability.
5.  **Simulated UI States:** The widget (`main.js`) hardcodes visual loading phases (`brainGroq: "Parsing..."`, `brainCohere: "Auditing..."`, `brainGemini: "Generating..."`) to simulate a "Triple-Brain Matrix," whereas the backend (`services/llm.js`) actually just calls Gemini directly, only falling back to Groq upon failure, and handles safety via static regex.

## 3. Regression Protection Plan

Before any architectural changes, we must establish a safety net.

*   **Baseline Commands:**
    *   *Install:* `npm ci`
    *   *Lint/Typecheck:* `npm run check` (currently limited to syntax check). Propose migrating to ESLint/Prettier.
    *   *Build:* `npm run build` (esbuild).
    *   *Smoke Test:* `npm run start` (Wait for "Server is running", curl `/api/v1/health`).
*   **Proposed Contract Tests (using Jest/Supertest):**
    *   `POST /api/chat`: Ensure backward compatibility with existing widget payload schemas.
    *   `GET /supreme-boost/boost.js`: Ensure the widget bundle serves correctly.
    *   `POST /api/auth`: Verify token generation and rejection of invalid credentials.
*   **Rollback Plan:**
    *   All changes will be hidden behind tenant-scoped feature flags (e.g., `ENABLE_V2_PIPELINE`).
    *   Database migrations must be strictly additive (no dropping columns).
    *   Vercel Instant Rollback will be utilized for production deployment reversions.

## 4. Safe Target Architecture

To evolve into a true Enterprise SaaS, we will transition to:

*   **Database:** PostgreSQL (via Supabase) as the single source of truth. Strict Row Level Security (RLS) policies to enforce tenant isolation at the database layer.
*   **Authentication & RBAC:** Standardized JWTs via Supabase Auth. Separation of "Users" (identity) from "Tenants/Accounts" (billing/workspaces).
*   **Subscription & Entitlement:** Explicit mapping of Sandbox (Free) vs. Paid tiers. Integration with Stripe/Omise via secure webhooks to manage usage limits automatically.
*   **Knowledge Engine (RAG):**
    *   PostgreSQL `pgvector` for embedding storage.
    *   Background queue (e.g., Redis/BullMQ) for asynchronous website crawling, PDF parsing, chunking, and embedding generation to prevent API timeouts.
*   **Security:**
    *   Restrict widget CORS to verified tenant domains (Domain Whitelisting).
    *   Remove `new Function` dynamic execution; replace with a predefined, secure plugin registry or WebAssembly sandbox.
*   **Observability:** Comprehensive audit logs, tenant-level usage analytics, and Datadog/Sentry alerting for anomaly detection.

## 5. Phased Implementation Plan

### Phase 1: Stabilization & Observability
*   **Files changing:** `server.js`, `api/_auth.js` -> `api/auth.js`, `Dockerfile`, `package.json`.
*   **Strategy:** Fix broken imports, fix Dockerfile, add basic Jest contract tests, and remove hardcoded backdoor tokens.
*   **Rollback:** Git revert. Safe because no data or external APIs are altered.

### Phase 2: Security & Tenant Isolation
*   **Files changing:** `services/plugins/manager.js`, `api/chat.js`, `api/auth.js`.
*   **Strategy:** Deprecate `new Function` in favor of static hooks. Implement strict CORS domain verification based on `apiKey`.
*   **Feature Flag:** `ENFORCE_STRICT_CORS`.
*   **Rollback:** Toggle feature flag to `false`.

### Phase 3: RAG & Database Consolidation (PostgreSQL)
*   **Files changing:** `api/knowledge.js`, `services/rag.js`, `.env`.
*   **Strategy:** Additively migrate from MongoDB to Supabase pgvector. Implement a basic queuing mechanism for indexing tasks.
*   **Backward Compat:** Dual-write to both DBs if necessary during migration, reading from Supabase if data exists, else fallback to Mongo.
*   **Rollback:** Point read-paths back to MongoDB via environment variables.

### Phase 4: Billing, Entitlements & RBAC
*   **Files changing:** `api/checkout.js`, `customer-dashboard.html`, new `api/webhooks/payment.js`.
*   **Strategy:** Implement tiered limits (Starter vs Pro). Add a webhook endpoint to receive payment success events and update tenant `expires_at` and `package_type`.
*   **Rollback:** Revert webhook endpoint route; manually adjust tenant records in Supabase if needed.

### Phase 5: True Orchestration (Replacing Simulated UI)
*   **Files changing:** `src/widget/main.js`, `services/llm.js`, `api/chat.js`.
*   **Strategy:** Upgrade `/api/chat` to support Server-Sent Events (SSE). Have the widget display actual orchestration states based on real-time stream metadata rather than hardcoded timers.
*   **Feature Flag:** `ENABLE_STREAMING_UI`.
*   **Rollback:** Widget falls back to standard `POST` polling if SSE fails or flag is disabled.
