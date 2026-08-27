const crypto = require('crypto');
const { Readable } = require('stream');
const { incrementBoundedCounter } = require('../../services/mongoCounter');
const rateLimit = require('../../services/rateLimit');
const { activateBillingRequest, verifyStripeSignature } = require('../../services/billing');
const checkout = require('../../api/checkout');
const stripeWebhook = require('../../api/stripe-webhook');
const { validateProductionConfig } = require('../../services/productionConfig');

function getPath(document, path) {
    return path.split('.').reduce((value, key) => value && value[key], document);
}

function incrementPath(document, path, amount) {
    const keys = path.split('.');
    let cursor = document;
    keys.forEach((key, index) => {
        if (index === keys.length - 1) cursor[key] = Number(cursor[key] || 0) + amount;
        else cursor = cursor[key] ||= {};
    });
}

class CounterCollection {
    constructor(document = null) { this.document = document; }
    async findOneAndUpdate(query, update) {
        if (!this.document) return null;
        const field = Object.keys(update.$inc)[0];
        const limit = query.$or.find(condition => condition[field] && condition[field].$lt)[field].$lt;
        const count = Number(getPath(this.document, field) || 0);
        if (count >= limit) return null;
        incrementPath(this.document, field, 1);
        return structuredClone(this.document);
    }
    async findOne() { return this.document ? structuredClone(this.document) : null; }
    async insertOne(document) {
        if (this.document) throw Object.assign(new Error('duplicate'), { code: 11000 });
        this.document = structuredClone(document);
        return { insertedId: 'id' };
    }
}

function billingDb() {
    const data = {
        billing_requests: [{ id: 'request-1', tenant_id: 'tenant-1', package_type: 'Pro Matrix', provider: 'slipok', status: 'verified' }],
        tenants: [{ id: 'tenant-1', status: 'pending', package_type: 'none' }]
    };
    return {
        data,
        collection(name) {
            return {
                async findOne(query) { return data[name].find(item => Object.entries(query).every(([key, value]) => item[key] === value)) || null; },
                async updateOne(query, update) {
                    const item = data[name].find(candidate => Object.entries(query).every(([key, value]) => candidate[key] === value));
                    if (!item) return { matchedCount: 0, modifiedCount: 0 };
                    Object.assign(item, update.$set || {});
                    return { matchedCount: 1, modifiedCount: 1 };
                }
            };
        }
    };
}

describe('Horizontal scaling counters', () => {
    test('never increments an atomic counter beyond its limit', async () => {
        const collection = new CounterCollection();
        const results = await Promise.all(Array.from({ length: 25 }, () => incrementBoundedCounter(collection, { key: 'tenant' }, 'count', 10)));
        expect(results.filter(result => result.allowed)).toHaveLength(10);
        expect(collection.document.count).toBe(10);
    });

    test('supports independent nested usage counters in one period document', async () => {
        const collection = new CounterCollection({ tenant_id: 'tenant-1', usage: { chat: 3 } });
        const result = await incrementBoundedCounter(collection, { tenant_id: 'tenant-1' }, 'usage.crawl', 2);
        expect(result).toEqual({ allowed: true, count: 1 });
        expect(collection.document.usage).toEqual({ chat: 3, crawl: 1 });
    });

    test('uses the trusted hop from the right instead of a spoofable first XFF value', () => {
        const previousHeaders = process.env.TRUST_PROXY_HEADERS;
        const previousHops = process.env.TRUSTED_PROXY_HOPS;
        process.env.TRUST_PROXY_HEADERS = 'true';
        process.env.TRUSTED_PROXY_HOPS = '1';
        expect(rateLimit.__requestIp({ headers: { 'x-forwarded-for': 'spoofed, 203.0.113.9' }, socket: { remoteAddress: 'proxy' } })).toBe('203.0.113.9');
        if (previousHeaders === undefined) delete process.env.TRUST_PROXY_HEADERS; else process.env.TRUST_PROXY_HEADERS = previousHeaders;
        if (previousHops === undefined) delete process.env.TRUSTED_PROXY_HOPS; else process.env.TRUSTED_PROXY_HOPS = previousHops;
    });
});

describe('Billing integrity', () => {
    test('verifies Stripe signatures over the unchanged raw body and rejects tampering', () => {
        const secret = 'whsec_test_secret';
        const now = Date.now();
        const timestamp = Math.floor(now / 1000);
        const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
        const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
        const header = `t=${timestamp},v1=${signature}`;
        expect(verifyStripeSignature(body, header, secret, now)).toBe(true);
        expect(verifyStripeSignature(body + ' ', header, secret, now)).toBe(false);
        expect(verifyStripeSignature(body, `t=${timestamp - 1000},v1=${signature}`, secret, now)).toBe(false);
    });

    test('activates only the tenant linked to a server-side billing request', async () => {
        const db = billingDb();
        const tenant = await activateBillingRequest(db, 'request-1', { provider: 'slipok', providerReference: 'tx-1' });
        expect(tenant.status).toBe('active');
        expect(tenant.package_type).toBe('pro');
        expect(tenant.expires_at).toBeTruthy();
        expect(db.data.billing_requests[0].status).toBe('paid');
    });

    test('uses one open Stripe checkout lock per tenant across all plans and time windows', () => {
        expect(checkout.__stripeCheckoutKey('tenant-1')).toBe('stripe-open:tenant-1');
        expect(checkout.__stripeCheckoutKey('tenant-1')).not.toContain('starter');
    });

    test('transactional activation refuses to overwrite another active Stripe subscription', async () => {
        const db = billingDb();
        db.data.billing_requests[0].provider = 'stripe';
        db.data.billing_requests[0].status = 'checkout_started';
        db.data.tenants[0].billing = { provider: 'stripe', status: 'active', subscription_id: 'sub_existing' };
        await expect(activateBillingRequest(db, 'request-1', { provider: 'stripe', subscriptionId: 'sub_new' })).rejects.toMatchObject({ code: 'DUPLICATE_STRIPE_SUBSCRIPTION' });
    });

    test('extracts provider-owned slip amount, reference, and receiver account', () => {
        expect(checkout.__slipDetails({ data: { amount: 990, transRef: 'tx-1', receiver: { account: { value: 'xxx-1234' } } } })).toEqual({
            amount: 990,
            reference: 'tx-1',
            receiverAccount: '1234',
            timestamp: null
        });
    });

    test('sends SlipOK an image upload with provider-side logging and amount validation', () => {
        const form = checkout.__slipRequestForm(Buffer.from('image').toString('base64'), 'image/jpeg', 990);
        expect(form.get('files')).toBeInstanceOf(Blob);
        expect(form.get('log')).toBe('true');
        expect(form.get('amount')).toBe('990.00');
    });

    test('reads the unchanged webhook stream when a platform body parser is disabled', async () => {
        const body = Buffer.from('{"id":"evt_stream"}');
        const request = Readable.from([body.slice(0, 5), body.slice(5)]);
        expect(await stripeWebhook.__rawRequestBody(request)).toEqual(body);
    });

    test('binds Stripe activation to the stored session, tenant, amount, and monthly price', () => {
        const previous = process.env.STRIPE_PRICE_PRO;
        process.env.STRIPE_PRICE_PRO = 'price_pro';
        const request = { id: 'request-1', tenant_id: 'tenant-1', provider: 'stripe', status: 'checkout_started', stripe_session_id: 'cs_1', package_type: 'pro', amount: 2490 };
        const session = { id: 'cs_1', mode: 'subscription', currency: 'thb', amount_total: 249000, customer: 'cus_1', metadata: { request_id: 'request-1', tenant_id: 'tenant-1' } };
        const subscription = { customer: 'cus_1', status: 'active', metadata: { request_id: 'request-1', tenant_id: 'tenant-1' }, items: { data: [{ quantity: 1, price: { id: 'price_pro', recurring: { interval: 'month' } } }] } };
        expect(() => stripeWebhook.__validateCheckoutPayment(request, session, subscription)).not.toThrow();
        expect(() => stripeWebhook.__validateCheckoutPayment(request, { ...session, amount_total: 99000 }, subscription)).toThrow(/amount or currency/u);
        if (previous === undefined) delete process.env.STRIPE_PRICE_PRO; else process.env.STRIPE_PRICE_PRO = previous;
    });

    test('reads invoice subscription IDs from current and legacy Stripe payloads', () => {
        expect(stripeWebhook.__invoiceSubscription({ subscription: 'sub_old' })).toBe('sub_old');
        expect(stripeWebhook.__invoiceSubscription({ parent: { subscription_details: { subscription: 'sub_new' } } })).toBe('sub_new');
    });

    test('finds refundable payment references across Stripe invoice shapes', () => {
        expect(stripeWebhook.__stripePaymentReference({ payment_intent: 'pi_1' })).toEqual({ payment_intent: 'pi_1' });
        expect(stripeWebhook.__stripePaymentReference({ payments: { data: [{ payment: { charge: 'ch_1' } }] } })).toEqual({ charge: 'ch_1' });
    });
});

describe('Production configuration gate', () => {
    test('accepts a complete dual-provider production configuration', () => {
        const result = validateProductionConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://db.example/test',
            JWT_SECRET: 'j'.repeat(40),
            ADMIN_PASSWORD: 'a'.repeat(16),
            CORS_ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com',
            PUBLIC_BASE_URL: 'https://api.example.com',
            ENFORCE_STRICT_CORS: 'true',
            REQUIRE_TENANT_API_KEY: 'true',
            INDICATOR_STRICT_SITE_ORIGIN: 'true',
            INDICATOR_ALLOW_FIRST_PARTY_DEMO: 'false',
            INDICATOR_FILE_LEARNING: 'false',
            TRUST_PROXY_HEADERS: 'true',
            SMTP_HOST: 'smtp.example.com',
            SMTP_USER: 'mailer@example.com',
            SMTP_PASS: 'smtp-secret',
            PAYMENT_MODE: 'both',
            STRIPE_SECRET_KEY: 'sk_live_example_secret',
            STRIPE_WEBHOOK_SECRET: 'whsec_example_secret',
            STRIPE_PRICE_STARTER: 'price_starter',
            STRIPE_PRICE_PRO: 'price_pro',
            STRIPE_SUCCESS_URL: 'https://app.example.com/dashboard?paid=1',
            STRIPE_CANCEL_URL: 'https://app.example.com/pricing',
            SLIPOK_API_KEY: 'slip-secret',
            SLIPOK_BRANCH_ID: 'branch-1',
            SLIPOK_RECEIVER_ACCOUNT: '123456'
        });
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    test('rejects wildcard CORS and missing billing secrets', () => {
        const result = validateProductionConfig({ CORS_ALLOWED_ORIGINS: 'https://*.example.com' });
        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toContain('CORS_ALLOWED_ORIGINS');
        expect(result.errors.join(' ')).toContain('PAYMENT_MODE');
    });
});
