# INDICATOR Setup

## Local Verification

```bash
npm ci
npm run ci
npm start
```

Open `http://localhost:3000`. The owned agent works without an external model
provider, but tenant and account operations require MongoDB.

## Render Free Preview

1. Create or update the service from `render.yaml`.
2. Set `MONGODB_URI` and `ADMIN_PASSWORD` in Render. Keep secrets out of Git.
3. Keep the preview modes below until their external integrations are tested:

```text
REGISTRATION_MODE=disabled
HANDOFF_DELIVERY_MODE=contact_only
PAYMENT_MODE=manual
```

4. Confirm the platform has exact first-party origins, a generated 32+ character
   `JWT_SECRET`, `REQUIRE_TENANT_API_KEY=true`, and strict origin checks enabled.
5. Startup runs `npm run db:indexes` and `npm run preflight:dependencies` before
   opening the server.
6. After deployment, `/api/v1/readyz` must return 200 and `/api/v1/livez` must
   report the expected commit SHA.

## Create A Tenant Installation

1. Sign in to `/admin`.
2. Create or select the tenant.
3. Register every exact HTTPS website origin, including separate `www` and
   non-`www` origins when both are used.
4. Give the generated embed snippet only to that tenant.

Wildcard origins, paths, query strings, and copied keys used from another site
are rejected.

## Release And Recovery

- Release evidence and limitations: `docs/PRODUCTION_READINESS.md`
- Tenant installation details: `docs/SAAS_PLUGIN_SETUP.md`
- Backup and restore: `docs/BACKUP_RESTORE.md`
- Rollback: `docs/ROLLBACK.md`

Automatic registration, SMTP handoff, Stripe, and SlipOK require separate
end-to-end tests before changing the preview modes.
