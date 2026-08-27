'use strict';

const { closeDatabase, connectToDatabase } = require('../api/_mongodb');

async function main() {
    const db = await connectToDatabase();
    if (!db) throw new Error('MongoDB is not configured or reachable');

    let billingIndexes = [];
    try { billingIndexes = await db.collection('billing_requests').indexes(); }
    catch (error) { if (!error || error.code !== 26) throw error; }
    const legacyReferenceIndex = billingIndexes.find(index => index.name === 'billing_provider_reference_unique' && !index.partialFilterExpression);
    if (legacyReferenceIndex) await db.collection('billing_requests').dropIndex(legacyReferenceIndex.name);

    await Promise.all([
        db.collection('tenants').createIndex({ api_key: 1 }, { unique: true, sparse: true, name: 'tenant_api_key_unique' }),
        db.collection('tenants').createIndex({ username: 1 }, { unique: true, sparse: true, name: 'tenant_username_unique' }),
        db.collection('tenants').createIndex({ email: 1 }, { unique: true, sparse: true, name: 'tenant_email_unique' }),
        db.collection('tenants').createIndex({ 'auth.google.sub': 1 }, { unique: true, sparse: true, name: 'tenant_google_subject_unique' }),
        db.collection('tenants').createIndex({ allowed_origins: 1, status: 1 }, { name: 'tenant_origin_status' }),
        db.collection('knowledge_chunks').createIndex({ tenant_id: 1, created_at: -1 }, { name: 'knowledge_tenant_created' }),
        db.collection('logs').createIndex({ 'metadata.tenantId': 1, timestamp: -1 }, { name: 'logs_tenant_timestamp' }),
        db.collection('handoff_tickets').createIndex({ tenant_id: 1, idempotency_key: 1 }, { unique: true, name: 'handoff_tenant_idempotency' }),
        db.collection('rate_limit_windows').createIndex({ key: 1, window_start: 1 }, { unique: true, name: 'rate_limit_window_unique' }),
        db.collection('rate_limit_windows').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'rate_limit_expiry' }),
        db.collection('tenant_usage').createIndex({ tenant_id: 1, period_key: 1 }, { unique: true, name: 'tenant_usage_period_unique' }),
        db.collection('tenant_usage').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'tenant_usage_expiry' }),
        db.collection('billing_requests').createIndex({ status: 1, created_at: -1 }, { name: 'billing_status_created' }),
        db.collection('billing_requests').createIndex({ id: 1 }, { unique: true, name: 'billing_request_id_unique' }),
        db.collection('billing_requests').createIndex(
            { provider: 1, provider_reference: 1 },
            { unique: true, partialFilterExpression: { provider_reference: { $type: 'string' } }, name: 'billing_provider_reference_unique' }
        ),
        db.collection('billing_requests').createIndex(
            { checkout_key: 1 },
            { unique: true, partialFilterExpression: { checkout_key: { $type: 'string' } }, name: 'billing_checkout_key_unique' }
        ),
        db.collection('billing_requests').createIndex({ stripe_session_id: 1 }, { unique: true, sparse: true, name: 'billing_stripe_session_unique' }),
        db.collection('billing_events').createIndex({ id: 1 }, { unique: true, name: 'billing_event_unique' }),
        db.collection('billing_events').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'billing_event_expiry' }),
        db.collection('registration_grants').createIndex({ id: 1 }, { unique: true, name: 'registration_grant_id_unique' }),
        db.collection('registration_grants').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'registration_grant_expiry' }),
        db.collection('otps').createIndex({ email: 1 }, { unique: true, name: 'otp_email_unique' }),
        db.collection('otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'otp_expiry' })
    ]);

    console.log('MongoDB indexes are ready');
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(() => closeDatabase().catch(() => {}));
