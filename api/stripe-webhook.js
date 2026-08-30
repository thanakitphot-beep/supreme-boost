'use strict';

const crypto = require('crypto');
const { connectToDatabase } = require('./_mongodb');
const { activateBillingRequest, verifyStripeSignature } = require('../services/billing');

async function rawRequestBody(req) {
    if (Buffer.isBuffer(req.rawBody) || typeof req.rawBody === 'string') return req.rawBody;
    if (Buffer.isBuffer(req.body) || typeof req.body === 'string') return req.body;
    if (!req || typeof req[Symbol.asyncIterator] !== 'function') return null;
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 1_000_000) throw Object.assign(new Error('Webhook body is too large'), { statusCode: 413 });
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

async function stripeRequest(pathname, options = {}) {
    const headers = { Authorization: `Basic ${Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64')}` };
    if (options.body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
        method: options.method || 'GET',
        headers,
        body: options.body,
        signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`Stripe request failed: ${pathname}`);
    return response.json();
}

async function stripeSubscription(id) {
    if (!id) return null;
    return stripeRequest(`subscriptions/${encodeURIComponent(id)}`);
}

function invoiceSubscription(invoice) {
    return invoice && (invoice.subscription || invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription) || '';
}

function invoicePeriodEnd(invoice) {
    const lines = invoice && invoice.lines && Array.isArray(invoice.lines.data) ? invoice.lines.data : [];
    return Math.max(0, ...lines.map(line => Number(line && line.period && line.period.end || 0)));
}

function subscriptionPeriod(subscription, field) {
    const direct = Number(subscription && subscription[field] || 0);
    const items = subscription && subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
    return Math.max(direct, ...items.map(item => Number(item && item[field] || 0)));
}

function validateCheckoutPayment(request, session, subscription, options = {}) {
    const metadata = session.metadata || {};
    const subscriptionMetadata = subscription.metadata || {};
    const items = subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
    const expectedPrice = String(process.env[`STRIPE_PRICE_${String(request.package_type).toUpperCase()}`] || '');
    const item = items.find(candidate => candidate && candidate.price && candidate.price.id === expectedPrice);
    if (request.provider !== 'stripe' || request.status !== 'checkout_started' || request.stripe_session_id !== session.id) throw new Error('Stripe session is not bound to this billing request');
    if (metadata.request_id !== request.id || metadata.tenant_id !== request.tenant_id) throw new Error('Stripe session metadata mismatch');
    if (subscriptionMetadata.request_id !== request.id || subscriptionMetadata.tenant_id !== request.tenant_id) throw new Error('Stripe subscription metadata mismatch');
    if (session.mode !== 'subscription' || String(session.currency).toLowerCase() !== 'thb' || Number(session.amount_total) !== Number(request.amount) * 100) throw new Error('Stripe session amount or currency mismatch');
    if (session.customer !== subscription.customer || !options.allowInactive && !['active', 'trialing'].includes(subscription.status)) throw new Error('Stripe subscription is not active for this customer');
    if (!item || Number(item.quantity || 1) !== 1 || !item.price.recurring || item.price.recurring.interval !== 'month') throw new Error('Stripe subscription price does not match the purchased monthly plan');
}

function stripePaymentReference(invoice) {
    const paymentIntent = invoice && invoice.payment_intent;
    if (paymentIntent) return { payment_intent: typeof paymentIntent === 'string' ? paymentIntent : paymentIntent.id };
    const charge = invoice && invoice.charge;
    if (charge) return { charge: typeof charge === 'string' ? charge : charge.id };
    const payments = invoice && invoice.payments && Array.isArray(invoice.payments.data) ? invoice.payments.data : [];
    for (const item of payments) {
        const payment = item && item.payment || {};
        if (payment.payment_intent) return { payment_intent: typeof payment.payment_intent === 'string' ? payment.payment_intent : payment.payment_intent.id };
        if (payment.charge) return { charge: typeof payment.charge === 'string' ? payment.charge : payment.charge.id };
    }
    return null;
}

async function cancelAndRefundDuplicateSubscription(db, request, subscription) {
    if (subscription.status !== 'canceled') {
        subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscription.id)}`, { method: 'DELETE' });
    }
    const invoiceId = typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice && subscription.latest_invoice.id;
    if (Number(request.amount) > 0) {
        if (!invoiceId) throw new Error('Duplicate Stripe subscription has no refundable invoice');
        const invoice = await stripeRequest(`invoices/${encodeURIComponent(invoiceId)}`);
        const payment = stripePaymentReference(invoice);
        if (!payment) throw new Error('Duplicate Stripe subscription payment could not be identified for refund');
        await stripeRequest('refunds', {
            method: 'POST',
            body: new URLSearchParams(payment),
            idempotencyKey: `indicator-duplicate-refund-${request.id}`
        });
    }
    await db.collection('billing_requests').updateOne(
        { id: request.id },
        { $set: { status: 'duplicate_subscription_refunded', updated_at: new Date().toISOString() }, $unset: { checkout_key: '' } }
    );
}

async function updateStripeSubscriptionTenant(db, subscription, eventCreated) {
    const subscriptionId = subscription && subscription.id;
    if (!subscriptionId) return;
    const status = String(subscription.status || 'canceled');
    const active = ['active', 'trialing'].includes(status);
    const priority = status === 'canceled' || status === 'unpaid' ? 3 : active ? 1 : 2;
    const periodEnd = subscriptionPeriod(subscription, 'current_period_end');
    const update = {
        'billing.status': status,
        'billing.last_event_created': Number(eventCreated || 0),
        'billing.last_event_priority': priority,
        'billing.updated_at': new Date().toISOString(),
        status: active ? 'active' : 'suspended',
        suspension_reason: active ? null : 'billing'
    };
    if (periodEnd) {
        update['billing.current_period_end'] = new Date(periodEnd * 1000).toISOString();
        update.expires_at = new Date(periodEnd * 1000).toISOString();
    }
    await db.collection('tenants').updateOne(
        {
            'billing.subscription_id': subscriptionId,
            suspension_reason: { $ne: 'admin' },
            $or: [
                { 'billing.last_event_created': { $exists: false } },
                { 'billing.last_event_created': { $lt: Number(eventCreated || 0) } },
                { 'billing.last_event_created': Number(eventCreated || 0), 'billing.last_event_priority': { $lte: priority } }
            ]
        },
        { $set: update }
    );
}

async function processStripeEvent(db, event) {
    const object = event && event.data && event.data.object || {};
    if (event.type === 'checkout.session.expired') {
        await db.collection('billing_requests').updateOne(
            { stripe_session_id: object.id, status: 'checkout_started' },
            { $set: { status: 'expired', updated_at: new Date().toISOString() }, $unset: { checkout_key: '' } }
        );
        return;
    }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
        if (!['paid', 'no_payment_required'].includes(object.payment_status)) return;
        const requestId = object.metadata && object.metadata.request_id || object.client_reference_id;
        const request = await db.collection('billing_requests').findOne({ id: requestId });
        if (!request) throw new Error('Stripe billing request not found');
        if (request.status === 'duplicate_subscription_refunded') return;
        const subscription = await stripeSubscription(object.subscription);
        validateCheckoutPayment(request, object, subscription, { allowInactive: true });
        const tenant = await db.collection('tenants').findOne({ id: request.tenant_id });
        if (
            tenant && tenant.billing && tenant.billing.provider === 'stripe' &&
            ['active', 'trialing', 'past_due'].includes(tenant.billing.status) &&
            tenant.billing.subscription_id && tenant.billing.subscription_id !== subscription.id
        ) {
            await cancelAndRefundDuplicateSubscription(db, request, subscription);
            return;
        }
        validateCheckoutPayment(request, object, subscription);
        await activateBillingRequest(db, requestId, {
            provider: 'stripe',
            providerReference: object.id,
            customerId: object.customer,
            subscriptionId: object.subscription,
            currentPeriodStart: subscriptionPeriod(subscription, 'current_period_start'),
            currentPeriodEnd: subscriptionPeriod(subscription, 'current_period_end'),
            eventCreated: event.created,
            eventPriority: 1
        });
        return;
    }

    if (event.type === 'invoice.paid') {
        const subscription = await stripeSubscription(invoiceSubscription(object));
        await updateStripeSubscriptionTenant(db, subscription, event.created);
        return;
    }
    if (event.type === 'invoice.payment_failed') {
        const subscription = await stripeSubscription(invoiceSubscription(object));
        await updateStripeSubscriptionTenant(db, subscription, event.created);
        return;
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        let subscription;
        try { subscription = await stripeSubscription(object.id); }
        catch (error) {
            if (!event.type.endsWith('.deleted')) throw error;
            subscription = object;
        }
        const status = event.type.endsWith('.deleted') ? 'canceled' : subscription.status;
        await updateStripeSubscriptionTenant(db, { ...subscription, status }, event.created);
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '');
    let rawBody;
    try { rawBody = await rawRequestBody(req); }
    catch (error) { return res.status(error.statusCode || 400).json({ error: error.message }); }
    if (!secret || rawBody === null || !verifyStripeSignature(rawBody, req.headers['stripe-signature'], secret)) {
        return res.status(400).json({ error: 'Invalid Stripe signature' });
    }

    let event;
    try { event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody); }
    catch (_) { return res.status(400).json({ error: 'Invalid webhook payload' }); }
    if (!event || !event.id || !event.type) return res.status(400).json({ error: 'Invalid webhook event' });

    const db = await connectToDatabase();
    if (!db) return res.status(503).json({ error: 'Database is unavailable' });
    const events = db.collection('billing_events');
    const leaseToken = crypto.randomUUID();
    try {
        try {
            await events.insertOne({ id: event.id, provider: 'stripe', type: event.type, status: 'processing', lease_token: leaseToken, processing_started_at: new Date(), attempts: 1, created_at: new Date(), expires_at: new Date(Date.now() + 400 * 86400000) });
        } catch (error) {
            if (!error || error.code !== 11000) throw error;
            const retry = await events.findOneAndUpdate(
                { id: event.id, $or: [{ status: 'failed' }, { status: 'processing', processing_started_at: { $lt: new Date(Date.now() - 5 * 60_000) } }] },
                { $set: { status: 'processing', lease_token: leaseToken, processing_started_at: new Date(), updated_at: new Date() }, $inc: { attempts: 1 } },
                { returnDocument: 'after' }
            );
            if (!retry) {
                const existing = await events.findOne({ id: event.id }, { projection: { status: 1 } });
                if (existing && existing.status === 'processed') return res.status(200).json({ received: true, duplicate: true });
                return res.status(409).json({ error: 'Webhook event is already being processed; retry later' });
            }
        }

        await processStripeEvent(db, event);
        const completed = await events.updateOne(
            { id: event.id, status: 'processing', lease_token: leaseToken },
            { $set: { status: 'processed', processed_at: new Date() }, $unset: { lease_token: '' } }
        );
        if (!completed.modifiedCount) return res.status(409).json({ error: 'Webhook lease was lost; retry later' });
        return res.status(200).json({ received: true });
    } catch (error) {
        await events.updateOne(
            { id: event.id, status: 'processing', lease_token: leaseToken },
            { $set: { status: 'failed', error: String(error.message || error).slice(0, 300), updated_at: new Date() }, $unset: { lease_token: '' } }
        ).catch(() => {});
        return res.status(500).json({ error: 'Webhook processing failed' });
    }
};

module.exports.config = { api: { bodyParser: false } };
module.exports.__invoicePeriodEnd = invoicePeriodEnd;
module.exports.__invoiceSubscription = invoiceSubscription;
module.exports.__processStripeEvent = processStripeEvent;
module.exports.__rawRequestBody = rawRequestBody;
module.exports.__validateCheckoutPayment = validateCheckoutPayment;
module.exports.__stripePaymentReference = stripePaymentReference;
