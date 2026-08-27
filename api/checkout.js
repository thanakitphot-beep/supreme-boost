'use strict';

const crypto = require('crypto');
const { connectToDatabase } = require('./_mongodb');
const { setCorsHeaders } = require('../services/cors');
const { checkRateLimit } = require('../services/rateLimit');
const { canonicalPlanId, entitlementsFor } = require('../services/plans');
const { activateBillingRequest, authenticatedBillingTenant, cleanEmail } = require('../services/billing');

function stripePriceId(planId) {
    return String(process.env[`STRIPE_PRICE_${planId.toUpperCase()}`] || '').trim();
}

function stripeCheckoutKey(tenantId) {
    return `stripe-open:${String(tenantId)}`;
}

function configuredProviders(mode) {
    const providers = [];
    if (['stripe', 'both'].includes(mode) && process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) providers.push('stripe');
    if (['slipok', 'both'].includes(mode) && process.env.SLIPOK_API_KEY && process.env.SLIPOK_BRANCH_ID) providers.push('slipok');
    if (mode === 'manual') providers.push('manual');
    return providers;
}

async function createStripeCheckout(request, email) {
    const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
    const price = stripePriceId(request.package_type);
    const successUrl = String(process.env.STRIPE_SUCCESS_URL || '').trim();
    const cancelUrl = String(process.env.STRIPE_CANCEL_URL || '').trim();
    if (!secret || !price || !successUrl || !cancelUrl) throw new Error('Stripe is not configured');

    const body = new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': price,
        'line_items[0][quantity]': '1',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: request.id,
        'metadata[request_id]': request.id,
        'metadata[tenant_id]': request.tenant_id,
        'subscription_data[metadata][request_id]': request.id,
        'subscription_data[metadata][tenant_id]': request.tenant_id,
        'subscription_data[metadata][plan_id]': request.package_type
    });
    if (email) body.set('customer_email', email);
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': `indicator-${request.checkout_key}`
        },
        body
    });
    if (!response.ok) throw new Error('Stripe checkout session could not be created');
    return response.json();
}

function slipTimestamp(data) {
    const raw = data.transTimestamp || data.transactionDateTime || data.transDateTime || '';
    if (typeof raw === 'number') return raw > 10_000_000_000 ? raw : raw * 1000;
    const parsed = Date.parse(String(raw));
    if (Number.isFinite(parsed)) return parsed;
    const date = String(data.transDate || '').replace(/\D/g, '');
    const time = String(data.transTime || '00:00:00').replace(/[^\d:]/g, '');
    if (/^\d{8}$/u.test(date)) {
        const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time || '00:00:00'}+07:00`;
        const value = Date.parse(iso);
        if (Number.isFinite(value)) return value;
    }
    return null;
}

function slipDetails(payload) {
    const data = payload && payload.data || {};
    const receiver = data.receiver && data.receiver.account || {};
    return {
        amount: Number(data.amount ?? data.transAmount ?? data.trans_amount),
        reference: String(data.transRef || data.trans_ref || data.reference || data.transactionId || '').trim().slice(0, 200),
        receiverAccount: String(receiver.value || receiver.account || data.receiverAccount || '').replace(/\D/g, ''),
        timestamp: slipTimestamp(data)
    };
}

function slipRequestForm(base64, mimeType, amount) {
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) throw new Error('Slip image is empty');
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const form = new FormData();
    form.append('files', new Blob([buffer], { type: mimeType }), `slip.${extension}`);
    form.append('log', 'true');
    form.append('amount', Number(amount).toFixed(2));
    return form;
}

async function verifySlip(base64, mimeType, amount) {
    const response = await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(process.env.SLIPOK_BRANCH_ID)}`, {
        method: 'POST',
        headers: { 'x-authorization': process.env.SLIPOK_API_KEY },
        body: slipRequestForm(base64, mimeType, amount),
        signal: AbortSignal.timeout(15_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.message || 'Invalid slip');
    return slipDetails(payload);
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!req._rateLimitChecked && !await checkRateLimit(req, res, 'billing')) return;

    const db = await connectToDatabase();
    if (!db) return res.status(503).json({ error: 'Database is not configured' });

    try {
        const settings = await db.collection('settings').findOne({ id: 'global' });
        const mode = String(process.env.PAYMENT_MODE || settings && settings.payment_mode || 'manual').toLowerCase();
        const providers = configuredProviders(mode);

        if (req.method === 'GET') {
            const methods = providers.includes('manual') || providers.includes('slipok')
                ? await db.collection('payment_methods').find({ is_active: true }).project({ id: 1, bank_name: 1, account_number: 1, account_name: 1, qr_base64: 1 }).toArray()
                : [];
            return res.status(200).json({ paymentMethods: methods, paymentMode: mode, providers });
        }
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

        const tenant = await authenticatedBillingTenant(req, db);
        if (!tenant) return res.status(401).json({ error: 'Sign in before purchasing a plan' });
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        const planId = canonicalPlanId(body.packageType);
        if (!planId) return res.status(400).json({ error: 'Invalid package type' });
        const plan = entitlementsFor({ package_type: planId });
        if (!Number.isFinite(plan.monthlyPriceThb)) return res.status(400).json({ error: 'Enterprise plans require a sales contact' });
        const provider = mode === 'both' ? String(body.paymentProvider || '').toLowerCase() : mode;
        if (!providers.includes(provider)) return res.status(503).json({ error: 'Selected payment provider is not configured' });

        const request = {
            id: crypto.randomUUID(),
            tenant_id: tenant.id,
            tenant_name: String(tenant.company_name || tenant.username || '').slice(0, 160),
            contact_email: cleanEmail(tenant.email || body.email),
            package_type: planId,
            amount: plan.monthlyPriceThb,
            currency: 'thb',
            provider,
            status: provider === 'stripe' ? 'creating_checkout' : 'verifying',
            created_at: new Date().toISOString()
        };

        if (provider === 'stripe') {
            if (tenant.billing && tenant.billing.provider === 'stripe' && tenant.billing.subscription_id && ['active', 'trialing', 'past_due'].includes(tenant.billing.status)) {
                return res.status(409).json({ error: 'This account already has a Stripe subscription. Change the existing subscription instead of creating another.' });
            }
            request.checkout_key = stripeCheckoutKey(tenant.id);
            const existing = await db.collection('billing_requests').findOne({ checkout_key: request.checkout_key });
            if (existing && existing.checkout_url && existing.package_type === planId) return res.status(200).json({ redirectUrl: existing.checkout_url, requestId: existing.id, reused: true });
            if (existing) return res.status(409).json({ error: 'A checkout session is already being created' });
            try {
                await db.collection('billing_requests').insertOne(request);
            } catch (error) {
                if (error && error.code === 11000) return res.status(409).json({ error: 'A checkout session already exists for this plan' });
                throw error;
            }
            try {
                const session = await createStripeCheckout(request, request.contact_email);
                await db.collection('billing_requests').updateOne(
                    { id: request.id },
                    { $set: { stripe_session_id: session.id, checkout_url: session.url, status: 'checkout_started', updated_at: new Date().toISOString() } }
                );
                return res.status(200).json({ redirectUrl: session.url, requestId: request.id });
            } catch (error) {
                await db.collection('billing_requests').updateOne({ id: request.id }, { $set: { status: 'failed', updated_at: new Date().toISOString() }, $unset: { checkout_key: '' } });
                throw error;
            }
        }

        const rawSlip = String(body.slipBase64 || '');
        const mimeMatch = rawSlip.match(/^data:(image\/(?:png|jpeg|webp));base64,/iu);
        const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/jpeg';
        const base64 = rawSlip.includes(',') ? rawSlip.slice(rawSlip.indexOf(',') + 1) : rawSlip;
        if (!base64 || base64.length > 1_400_000) return res.status(400).json({ error: 'A valid slip image is required' });

        if (provider === 'slipok') {
            const slip = await verifySlip(base64, mimeType, plan.monthlyPriceThb);
            if (!slip.reference || !Number.isFinite(slip.amount)) return res.status(400).json({ error: 'Slip verification did not return a transaction reference and amount' });
            if (Math.abs(slip.amount - plan.monthlyPriceThb) > 0.01) return res.status(400).json({ error: 'Slip amount does not match the selected plan' });
            const expectedAccount = String(process.env.SLIPOK_RECEIVER_ACCOUNT || '').replace(/\D/g, '');
            if (process.env.NODE_ENV === 'production' && !expectedAccount) return res.status(503).json({ error: 'Slip receiver validation is not configured' });
            if (expectedAccount && (!slip.receiverAccount || !slip.receiverAccount.endsWith(expectedAccount.slice(-4)))) return res.status(400).json({ error: 'Slip receiver does not match the registered account' });
            const maximumAge = Number.parseInt(process.env.SLIPOK_MAX_AGE_SECONDS || '86400', 10) * 1000;
            if (!slip.timestamp || slip.timestamp > Date.now() + 5 * 60_000 || Date.now() - slip.timestamp > maximumAge) return res.status(400).json({ error: 'Slip is outside the accepted payment time window' });
            request.provider_reference = slip.reference;
            request.status = 'verified';
            try {
                await db.collection('billing_requests').insertOne(request);
            } catch (error) {
                if (error && error.code === 11000) return res.status(409).json({ error: 'This payment has already been used' });
                throw error;
            }
            const activated = await activateBillingRequest(db, request.id, { provider: 'slipok', providerReference: slip.reference });
            return res.status(200).json({ success: true, activated: true, packageType: activated.package_type });
        }

        request.status = 'pending';
        request.slip_base64 = rawSlip;
        await db.collection('billing_requests').insertOne(request);
        return res.status(200).json({ success: true, message: 'Request submitted. Waiting for admin approval.', requestId: request.id });
    } catch (error) {
        console.error('Checkout API error:', error.message);
        return res.status(500).json({ error: 'Payment could not be processed' });
    }
};

module.exports.__configuredProviders = configuredProviders;
module.exports.__stripeCheckoutKey = stripeCheckoutKey;
module.exports.__slipDetails = slipDetails;
module.exports.__slipRequestForm = slipRequestForm;
