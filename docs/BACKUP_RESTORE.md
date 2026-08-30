# Backup And Restore Runbook

Render Free and MongoDB Atlas Free do not provide a production backup guarantee. Backups must run from a trusted external machine and must never be stored in Git, Render's filesystem, or ordinary CI artifacts.

## Preview Objectives

- RPO: 24 hours while backups are manual
- RTO: 4 hours after credentials and a replacement database are available
- Scope: tenants, settings, knowledge, billing requests/events, usage, handoffs, OTP/grant state, and indexes
- Retention: 7 daily encrypted archives and 4 weekly encrypted archives

Billing ledgers must not be selectively removed during restore. Expired OTP and registration-grant records may be recreated by their TTL indexes.

## Backup

Freeze application writes for the entire dump, or use managed point-in-time snapshots on an Atlas tier that supports them. Atlas Free cannot produce a point-in-time-consistent `mongodump` with `--oplog`, so do not leave the application writable during this command.

Run MongoDB Database Tools from a trusted workstation with `MONGODB_DB_NAME` set to the runtime database name:

```bash
: "${MONGODB_URI:?Set MONGODB_URI}"
: "${MONGODB_DB_NAME:?Set MONGODB_DB_NAME to the runtime database name}"
mongodump --uri="$MONGODB_URI" --db="$MONGODB_DB_NAME" --archive=indicator-$(date +%Y%m%dT%H%M%SZ).archive --gzip
sha256sum indicator-*.archive > indicator-backup.sha256
```

Encrypt the archive with an organization-controlled key before copying it to separate storage. Do not place the URI in shell history on shared machines.

Record the timestamp, SHA-256, database name, archive size, operator, and storage location in the incident log.

## Restore Drill

1. Create a different replica-set database and a least-privilege restore credential.
2. Verify the archive checksum before decrypting.
3. Restore only to the disposable target database:

```bash
: "${MONGODB_RESTORE_URI:?Set MONGODB_RESTORE_URI}"
: "${MONGODB_DB_NAME:?Set MONGODB_DB_NAME to the archived source database name}"
: "${MONGODB_RESTORE_DB_NAME:?Set MONGODB_RESTORE_DB_NAME to a disposable target name}"
mongorestore --uri="$MONGODB_RESTORE_URI" --nsFrom="${MONGODB_DB_NAME}.*" --nsTo="${MONGODB_RESTORE_DB_NAME}.*" --archive=indicator.archive --gzip
```

4. Point a local process at the database named by `MONGODB_RESTORE_DB_NAME`.
5. Run `npm run db:indexes` and `npm run preflight:dependencies`.
6. Compare collection counts for tenants, settings, knowledge, billing requests/events, usage, and handoffs.
7. Exercise tenant login, one read-only dashboard request, and billing-ledger lookup.
8. Delete the disposable restore database and credential after recording measured recovery time.

## Incident Restore

Freeze writes and disable auto-deploy before selecting an archive. Restore into a new database, validate it, then change both `MONGODB_URI` and `MONGODB_DB_NAME` once. Keep the old database read-only until reconciliation is complete. Never restore directly over the only available copy.
