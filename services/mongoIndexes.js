'use strict';

const CRITICAL_INDEXES = [
    { collection: 'tenants', name: 'tenant_api_key_unique', key: { api_key: 1 }, unique: true, sparse: true },
    { collection: 'tenants', name: 'tenant_username_unique', key: { username: 1 }, unique: true, sparse: true },
    { collection: 'tenants', name: 'tenant_google_subject_unique', key: { 'auth.google.sub': 1 }, unique: true, sparse: true },
    { collection: 'handoff_tickets', name: 'handoff_tenant_idempotency', key: { tenant_id: 1, idempotency_key: 1 }, unique: true },
    { collection: 'rate_limit_windows', name: 'rate_limit_window_unique', key: { key: 1, window_start: 1 }, unique: true },
    { collection: 'rate_limit_windows', name: 'rate_limit_expiry', key: { expires_at: 1 }, expireAfterSeconds: 0 },
    { collection: 'tenant_usage', name: 'tenant_usage_period_unique', key: { tenant_id: 1, period_key: 1 }, unique: true },
    { collection: 'billing_requests', name: 'billing_request_id_unique', key: { id: 1 }, unique: true },
    { collection: 'billing_requests', name: 'billing_provider_reference_unique', key: { provider: 1, provider_reference: 1 }, unique: true, partialFilterExpression: { provider_reference: { $type: 'string' } } },
    { collection: 'billing_requests', name: 'billing_checkout_key_unique', key: { checkout_key: 1 }, unique: true, partialFilterExpression: { checkout_key: { $type: 'string' } } },
    { collection: 'billing_requests', name: 'billing_stripe_session_unique', key: { stripe_session_id: 1 }, unique: true, sparse: true },
    { collection: 'billing_events', name: 'billing_event_unique', key: { id: 1 }, unique: true },
    { collection: 'otps', name: 'otp_email_unique', key: { email: 1 }, unique: true },
    { collection: 'registration_grants', name: 'registration_grant_id_unique', key: { id: 1 }, unique: true }
];

function sameDocument(left, right) {
    return JSON.stringify(left || null) === JSON.stringify(right || null);
}

async function criticalIndexesAreReady(db) {
    for (const expected of CRITICAL_INDEXES) {
        const indexes = await db.collection(expected.collection).indexes();
        const actual = indexes.find(index => index.name === expected.name);
        if (!actual || !sameDocument(actual.key, expected.key)) return false;
        if (Boolean(actual.unique) !== Boolean(expected.unique)) return false;
        if (Boolean(actual.sparse) !== Boolean(expected.sparse)) return false;
        if (expected.expireAfterSeconds !== undefined && Number(actual.expireAfterSeconds) !== expected.expireAfterSeconds) return false;
        if (!sameDocument(actual.partialFilterExpression, expected.partialFilterExpression)) return false;
    }
    return true;
}

async function mongoSupportsTransactions(db) {
    const topology = await db.admin().command({ hello: 1 });
    return Boolean(topology.logicalSessionTimeoutMinutes && (topology.setName || topology.msg === 'isdbgrid'));
}

module.exports = { CRITICAL_INDEXES, criticalIndexesAreReady, mongoSupportsTransactions };
