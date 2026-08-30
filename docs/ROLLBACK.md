# Release Rollback Runbook

## Application Rollback

1. Disable Render auto-deploy while investigating.
2. Record the failing release SHA from `/api/v1/livez`.
3. Verify the retained deployment's environment snapshot does not restore rotated or obsolete secrets, then roll back to that deployment. If it would restore obsolete secrets, deploy the target commit with the current environment instead.
4. Wait for `/api/v1/readyz` to return 200.
5. Confirm `/api/v1/livez` reports the expected release SHA.
6. Verify the homepage, widget asset, manual checkout, tenant login, and protected private paths.
7. Re-enable deployment only after the root cause has a tested forward fix.

## Database Compatibility

Mongo migrations must remain idempotent and expand-compatible with the previous application release. A code rollback does not roll back data. Destructive field removal, collection drops, or irreversible transformations require a separately approved backup and restore plan.

## Failed Startup

Render readiness must prevent a failed revision from receiving traffic. Review startup migration and preflight logs. Do not bypass `/readyz` by switching the platform health check to `/livez`.

## Evidence

Record incident time, old and new release SHAs, readiness responses, database migration version, operator, reason, verification checks, and recovery duration.
