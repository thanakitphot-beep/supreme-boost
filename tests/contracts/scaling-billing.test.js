const crypto = require('crypto');
const { Readable } = require('stream');
const { incrementBoundedCounter } = require('../../services/mongoCounter');
const rateLimit = require('../../services/rateLimit');
const { activateBillingRequest, CHECKOUT_LOCK_STATUSES, verifyStripeSignature } = require('../../services/billing');
const { __rejectBillingRequest: rejectBillingRequest, __knowledgeDeleteFilter: knowledgeDeleteFilter } = require('../../api/admin');
const checkout = require('../../api/checkout');
const stripeWebhook = require('../../api/stripe-webhook');
const { deploymentOrigin, handoffDeliveryMode, registrationMode, validateProductionConfig } = require('../../services/productionConfig');
const { parseImageDataUrl } = require('../../services/imageData');

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

function matchesQuery(item, query) {
    return Object.entries(query).every(([key, value]) => value && value.$in ? value.$in.includes(item[key]) : item[key] === value);
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
        billing_requests: [{ id: 'request-1', tenant_id: 'tenant-1', package_type: 'Pro Matrix', provider: 'slipok', status: 'verified', slip_base64: 'data:image/png;base64,proof', checkout_key: 'stripe-open:tenant-1' }],
        tenants: [{ id: 'tenant-1', status: 'pending', package_type: 'none' }]
    };
    return {
        data,
        collection(name) {
            return {
                async findOne(query) { return data[name].find(item => matchesQuery(item, query)) || null; },
                async updateOne(query, update) {
                    const item = data[name].find(candidate => matchesQuery(candidate, query));
                    if (!item) return { matchedCount: 0, modifiedCount: 0 };
                    Object.assign(item, update.$set || {});
                    Object.keys(update.$unset || {}).forEach(key => delete item[key]);
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
    test('accepts only image data URLs whose bytes match their declared type', () => {
        const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
        const parsed = parseImageDataUrl(`data:image/png;base64,${png.toString('base64')}`);
        expect(parsed).toMatchObject({ mimeType: 'image/png', bytes: png.length });
        expect(parseImageDataUrl('https://evil.example/slip.png')).toBeNull();
        expect(parseImageDataUrl('data:image/png;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+')).toBeNull();
        expect(parseImageDataUrl(`data:image/jpeg;base64,${png.toString('base64')}`)).toBeNull();
    });

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
        expect(db.data.billing_requests[0].slip_base64).toBeUndefined();
        expect(db.data.billing_requests[0].checkout_key).toBeUndefined();
    });

    test('removes uploaded slip evidence when an admin rejects a billing request', async () => {
        const db = billingDb();
        db.data.billing_requests[0].status = 'pending';
        const result = await rejectBillingRequest(db, 'request-1');
        expect(result.modifiedCount).toBe(1);
        expect(db.data.billing_requests[0]).toMatchObject({ status: 'rejected' });
        expect(db.data.billing_requests[0].slip_base64).toBeUndefined();
    });

    test('uses one open Stripe checkout lock per tenant across all plans and time windows', () => {
        expect(checkout.__stripeCheckoutKey('tenant-1')).toBe('stripe-open:tenant-1');
        expect(checkout.__stripeCheckoutKey('tenant-1')).not.toContain('starter');
        expect(checkout.__stripeIdempotencyKey('request-1')).toBe('indicator-checkout-request-1');
        expect(checkout.__stripeIdempotencyKey('request-1')).not.toBe(checkout.__stripeIdempotencyKey('request-2'));
        expect(checkout.__stripeErrorDefinitelyHasNoSession(400, 'invalid_request_error', 'parameter_missing')).toBe(true);
        expect(checkout.__stripeErrorDefinitelyHasNoSession(400, 'idempotency_error', 'idempotency_key_in_use')).toBe(false);
        expect(checkout.__stripeErrorDefinitelyHasNoSession(409, 'invalid_request_error', '')).toBe(false);
        expect(checkout.__stripeErrorDefinitelyHasNoSession(429, 'rate_limit_error', '')).toBe(false);
        expect(checkout.__stripeErrorDefinitelyHasNoSession(500, 'api_error', '')).toBe(false);
        expect(CHECKOUT_LOCK_STATUSES).toEqual(expect.arrayContaining(['creating_checkout', 'recovering_checkout', 'checkout_started']));
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

describe('Admin knowledge management', () => {
    test('deletes every chunk for a grouped tenant source without accepting query objects', () => {
        expect(knowledgeDeleteFilter({ tenant_id: 'tenant-1', url: 'https://shop.example/help' }, 'chunk-1')).toEqual({
            tenant_id: 'tenant-1',
            url: 'https://shop.example/help'
        });
        expect(knowledgeDeleteFilter({ tenant_id: 'tenant-1', url: { $ne: '' } }, 'chunk-1')).toEqual({ id: 'chunk-1' });
    });
});

describe('Production configuration gate', () => {
    test('accepts a hardened free-preview configuration without SMTP or payment secrets', () => {
        const result = validateProductionConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://db.example/test',
            JWT_SECRET: 'preview-JWT_4f8pX2qL9mN6vK3sR7tW1zC5',
            ADMIN_PASSWORD: 'Admin-Preview-4827',
            OPENAI_API_KEY: 'sk-preview-provider-key',
            CORS_ALLOWED_ORIGINS: 'https://preview.example.com',
            PUBLIC_BASE_URL: 'https://api.example.com',
            TRUST_PROXY_HEADERS: 'true',
            REGISTRATION_MODE: 'disabled',
            HANDOFF_DELIVERY_MODE: 'contact_only',
            PAYMENT_MODE: 'manual'
        });
        expect(result).toMatchObject({
            ok: true,
            errors: [],
            modes: { registration: 'disabled', handoff: 'contact_only', payment: 'manual' }
        });
        expect(result.warnings).toEqual(expect.arrayContaining([
            'Public registration is disabled',
            'Handoff email delivery is disabled; requests remain in the support queue',
            'Payments require manual approval'
        ]));
    });

    test('accepts a complete dual-provider production configuration', () => {
        const result = validateProductionConfig({
            NODE_ENV: 'production',
            MONGODB_URI: 'mongodb+srv://db.example/test',
            JWT_SECRET: 'dual-JWT_8pR2mK5vX9qL3sN7tW4zC6fH',
            ADMIN_PASSWORD: 'Admin-Dual-5938',
            GEMINI_API_KEY: 'gemini-provider-key',
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

    test('rejects wildcard CORS and unknown payment modes', () => {
        const result = validateProductionConfig({ CORS_ALLOWED_ORIGINS: 'https://*.example.com', PAYMENT_MODE: 'crypto' });
        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toContain('CORS_ALLOWED_ORIGINS');
        expect(result.errors.join(' ')).toContain('PAYMENT_MODE');
    });

    test('rejects unknown registration and handoff delivery modes', () => {
        const result = validateProductionConfig({ REGISTRATION_MODE: 'open', HANDOFF_DELIVERY_MODE: 'discard' });
        expect(result.errors.join(' ')).toContain('REGISTRATION_MODE');
        expect(result.errors.join(' ')).toContain('HANDOFF_DELIVERY_MODE');
    });

    test('rejects explicitly enabled production demo and file learning modes', () => {
        const result = validateProductionConfig({ INDICATOR_ALLOW_FIRST_PARTY_DEMO: 'true', INDICATOR_FILE_LEARNING: 'true' });
        expect(result.errors.join(' ')).toContain('INDICATOR_ALLOW_FIRST_PARTY_DEMO');
        expect(result.errors.join(' ')).toContain('INDICATOR_FILE_LEARNING');
    });

    test('normalizes delivery modes and defaults to fail-closed behavior', () => {
        expect(registrationMode({ REGISTRATION_MODE: ' SMTP ' })).toBe('smtp');
        expect(handoffDeliveryMode({ HANDOFF_DELIVERY_MODE: ' SMTP ' })).toBe('smtp');
        expect(registrationMode({})).toBe('disabled');
        expect(handoffDeliveryMode({})).toBe('contact_only');
        expect(validateProductionConfig({}).modes.payment).toBe('manual');
    });

    test('derives the exact service origin from trusted Render metadata', () => {
        expect(deploymentOrigin({ RENDER_SERVICE_NAME: 'indicator-web-chat' })).toBe('https://indicator-web-chat.onrender.com');
        expect(deploymentOrigin({ RENDER_SERVICE_NAME: 'invalid.example.com' })).toBe('');
        expect(deploymentOrigin({ PUBLIC_BASE_URL: 'http://invalid.example', RENDER_SERVICE_NAME: 'indicator-web-chat' })).toBe('https://indicator-web-chat.onrender.com');
    });

    test('compares runtime signing secrets after trimming whitespace', () => {
        const secret = 'Preview-Secret_4f8pX2qL9mN6vK3sR7tW1';
        const result = validateProductionConfig({ JWT_SECRET: ` ${secret}`, ADMIN_PASSWORD: `${secret} ` });
        expect(result.errors.join(' ')).toContain('must be different');
    });

    test('rejects predictable signing secrets and a missing AI provider', () => {
        const result = validateProductionConfig({ JWT_SECRET: 'x'.repeat(40), ADMIN_PASSWORD: 'a'.repeat(16) });
        expect(result.errors.join(' ')).toContain('randomly generated');
        expect(result.errors.join(' ')).toContain('too predictable');
        expect(result.errors.join(' ')).toContain('AI provider');
    });
});
