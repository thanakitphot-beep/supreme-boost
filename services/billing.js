'use strict';

const crypto = require('crypto');
const { verifyAccessJWT } = require('../api/_auth');
const { canonicalPlanId } = require('./plans');

function readCookie(req, name) {
    const source = String(req && req.headers && req.headers.cookie || '');
    const part = source.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
    if (!part) return '';
    try { return decodeURIComponent(part.slice(name.length + 1)); } catch (_) { return ''; }
}

async function authenticatedBillingTenant(req, db) {
    const claims = verifyAccessJWT(readCookie(req, 'tenant_session'));
    if (!claims || claims.role !== 'tenant' || !claims.tenantId) return null;
    return db.collection('tenants').findOne({ id: claims.tenantId });
}

function subscriptionExpiry(payment = {}, tenant = {}) {
    const periodEnd = Number(payment.currentPeriodEnd || 0);
    if (periodEnd > Date.now() / 1000) return new Date(periodEnd * 1000).toISOString();
    const currentExpiry = new Date(tenant.expires_at || 0);
    const expiry = Number.isFinite(currentExpiry.getTime()) && currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
    expiry.setUTCMonth(expiry.getUTCMonth() + 1);
    return expiry.toISOString();
}

async function activateBillingRequest(db, requestId, payment = {}) {
    async function perform(session) {
        const options = session ? { session } : {};
        const request = await db.collection('billing_requests').findOne({ id: requestId }, options);
        if (!request) throw new Error('Billing request not found');
        if (request.status === 'paid' || request.status === 'approved') {
            return db.collection('tenants').findOne({ id: request.tenant_id }, options);
        }
        if (!['pending', 'verified', 'verified_pending_approval', 'checkout_started'].includes(request.status)) {
            throw new Error('Billing request is not eligible for activation');
        }
        if (!request.tenant_id) throw new Error('Billing request is not linked to an authenticated tenant');

        const planId = canonicalPlanId(request.package_type);
        if (!planId) throw new Error('Billing request has an invalid plan');
        const tenant = await db.collection('tenants').findOne({ id: request.tenant_id }, options);
        if (!tenant) throw new Error('Billing tenant not found');
        const now = new Date().toISOString();
        const provider = String(payment.provider || request.provider || 'manual');
        if (
            provider === 'stripe' &&
            tenant.billing && tenant.billing.provider === 'stripe' &&
            ['active', 'trialing', 'past_due'].includes(tenant.billing.status) &&
            tenant.billing.subscription_id && tenant.billing.subscription_id !== payment.subscriptionId
        ) {
            throw Object.assign(new Error('Tenant already has a different active Stripe subscription'), { code: 'DUPLICATE_STRIPE_SUBSCRIPTION' });
        }
        const expiresAt = subscriptionExpiry(payment, tenant);
        const billing = {
            provider,
            status: 'active',
            customer_id: payment.customerId || null,
            subscription_id: payment.subscriptionId || null,
            provider_reference: payment.providerReference || request.provider_reference || null,
            current_period_start: payment.currentPeriodStart ? new Date(payment.currentPeriodStart * 1000).toISOString() : now,
            current_period_end: expiresAt,
            last_event_created: Number(payment.eventCreated || 0),
            last_event_priority: Number(payment.eventPriority || 1),
            updated_at: now
        };

        const claim = await db.collection('billing_requests').updateOne(
            { id: requestId, status: request.status },
            { $set: { status: 'activating', updated_at: now } },
            options
        );
        if (!claim.modifiedCount) throw new Error('Billing request activation was already claimed');
        await db.collection('tenants').updateOne(
            { id: request.tenant_id },
            { $set: { package_type: planId, status: tenant.suspension_reason === 'admin' ? 'suspended' : 'active', expires_at: expiresAt, billing, updated_at: now } },
            options
        );
        await db.collection('billing_requests').updateOne(
            { id: requestId, status: 'activating' },
            { $set: { status: 'paid', paid_at: now, provider, provider_reference: billing.provider_reference, updated_at: now } },
            options
        );
        return db.collection('tenants').findOne({ id: request.tenant_id }, options);
    }

    if (!db.client || typeof db.client.startSession !== 'function') {
        if (process.env.NODE_ENV === 'production') throw new Error('MongoDB transactions are required for billing activation');
        return perform(null);
    }
    const session = db.client.startSession();
    let result;
    try {
        await session.withTransaction(async () => { result = await perform(session); }, {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' }
        });
        return result;
    } finally {
        await session.endSession();
    }
}

function verifyStripeSignature(rawBody, signatureHeader, secret, now = Date.now()) {
    const values = String(signatureHeader || '').split(',').map(value => value.trim());
    const timestamp = Number((values.find(value => value.startsWith('t=')) || '').slice(2));
    const signatures = values.filter(value => value.startsWith('v1=')).map(value => value.slice(3));
    const tolerance = Number.parseInt(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || '300', 10);
    if (!timestamp || !signatures.length || Math.abs(Math.floor(now / 1000) - timestamp) > tolerance) return false;
    const payload = `${timestamp}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '')}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return signatures.some(signature => {
        if (!/^[a-f0-9]{64}$/iu.test(signature) || signature.length !== expected.length) return false;
        return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    });
}

function cleanEmail(value) {
    const email = String(value || '').trim().toLowerCase().slice(0, 200);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : '';
}

module.exports = {
    activateBillingRequest,
    authenticatedBillingTenant,
    cleanEmail,
    verifyStripeSignature
};
