const { applyPluginCors, canonicalOrigin, firstPartyDemoAllowed, normalizeAllowedOrigins, tenantAllowsOrigin, tenantIsActive } = require('../../services/tenantAccess');
const customerAuth = require('../../api/customer-auth');

function mockReq(overrides = {}) {
    return {
        method: 'GET',
        url: '/api/customer-auth?action=google-config',
        headers: {},
        body: {},
        socket: { remoteAddress: '1.2.3.4' },
        ...overrides
    };
}

function mockRes() {
    return {
        _statusCode: 200,
        _body: null,
        _headers: {},
        setHeader(key, value) { this._headers[key.toLowerCase()] = value; },
        status(code) { this._statusCode = code; return this; },
        json(body) { this._body = body; return this; },
        end() { return this; }
    };
}

describe('SaaS tenant origin access', () => {
    test('normalizes only exact HTTPS origins', () => {
        expect(canonicalOrigin('https://shop.example.com/')).toBe('https://shop.example.com');
        expect(canonicalOrigin('http://localhost:3000')).toBe('http://localhost:3000');
        expect(canonicalOrigin('https://shop.example.com/path')).toBeNull();
        expect(canonicalOrigin('https://*.example.com')).toBeNull();
        expect(canonicalOrigin('https://shop.example.com?tenant=a')).toBeNull();
    });

    test('deduplicates and rejects invalid tenant origins', () => {
        expect(normalizeAllowedOrigins('https://shop.example.com\nhttps://shop.example.com,https://www.shop.example.com/path')).toEqual([
            'https://shop.example.com'
        ]);
    });

    test('requires active and unexpired tenants for plugin access', () => {
        expect(tenantIsActive({ status: 'active', expires_at: null })).toBe(true);
        expect(tenantIsActive({ status: 'pending', expires_at: null })).toBe(false);
        expect(tenantIsActive({ status: 'active', expires_at: '2000-01-01T00:00:00.000Z' })).toBe(false);
    });

    test('limits the public demo to the configured service origin', () => {
        const previous = process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO;
        const previousUrl = process.env.RENDER_EXTERNAL_URL;
        process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO = 'true';
        process.env.RENDER_EXTERNAL_URL = 'https://indicator-web-chat.onrender.com';
        expect(firstPartyDemoAllowed('https://indicator-web-chat.onrender.com')).toBe(true);
        expect(firstPartyDemoAllowed('https://customer.example')).toBe(false);
        if (previous === undefined) delete process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO;
        else process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO = previous;
        if (previousUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
        else process.env.RENDER_EXTERNAL_URL = previousUrl;
    });

    test('keeps the first-party demo available even when a legacy opt-out remains configured', () => {
        const previous = process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO;
        const previousUrl = process.env.RENDER_EXTERNAL_URL;
        delete process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO;
        process.env.RENDER_EXTERNAL_URL = 'https://indicator-web-chat.onrender.com';
        expect(firstPartyDemoAllowed('https://indicator-web-chat.onrender.com')).toBe(true);
        process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO = 'false';
        expect(firstPartyDemoAllowed('https://indicator-web-chat.onrender.com')).toBe(true);
        if (previous === undefined) delete process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO;
        else process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO = previous;
        if (previousUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
        else process.env.RENDER_EXTERNAL_URL = previousUrl;
    });
});

describe('Google Sign-In configuration', () => {
    test('does not expose Google Sign-In when the client ID is missing', async () => {
        const previous = process.env.GOOGLE_CLIENT_ID;
        delete process.env.GOOGLE_CLIENT_ID;
        const res = mockRes();
        await customerAuth(mockReq(), res);
        expect(res._statusCode).toBe(503);
        if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
        else process.env.GOOGLE_CLIENT_ID = previous;
    });
});

describe('Customer registration persistence', () => {
    test('reports a failed account write instead of claiming registration succeeded', async () => {
        const db = { collection: () => ({ insertOne: async () => { throw new Error('write failed'); } }) };
        await expect(customerAuth.__saveTenant(db, { id: 'tenant-1' })).resolves.toBe(false);
    });

    test('allows every valid origin regardless of a saved tenant allowlist', () => {
        const previousRestriction = process.env.INDICATOR_RESTRICT_WIDGET_ORIGINS;
        delete process.env.INDICATOR_RESTRICT_WIDGET_ORIGINS;
        const unrestricted = { allowed_origins: [] };
        const restricted = { allowed_origins: ['https://shop.example.com'] };
        expect(tenantAllowsOrigin(unrestricted, 'https://customer-site.example')).toBe(true);
        expect(tenantAllowsOrigin(restricted, 'https://shop.example.com')).toBe(true);
        expect(tenantAllowsOrigin(restricted, 'https://other-site.example')).toBe(true);
        if (previousRestriction === undefined) delete process.env.INDICATOR_RESTRICT_WIDGET_ORIGINS;
        else process.env.INDICATOR_RESTRICT_WIDGET_ORIGINS = previousRestriction;
    });

    test('supports explicit tenant-origin restrictions as an opt-in', () => {
        const previousRestriction = process.env.INDICATOR_RESTRICT_WIDGET_ORIGINS;
        process.env.INDICATOR_RESTRICT_WIDGET_ORIGINS = 'true';
        const tenant = { allowed_origins: ['https://shop.example.com'] };
        expect(tenantAllowsOrigin(tenant, 'https://shop.example.com')).toBe(true);
        expect(tenantAllowsOrigin(tenant, 'https://other-site.example')).toBe(false);
        if (previousRestriction === undefined) delete process.env.INDICATOR_RESTRICT_WIDGET_ORIGINS;
        else process.env.INDICATOR_RESTRICT_WIDGET_ORIGINS = previousRestriction;
    });

    test('reflects arbitrary HTTPS origins before API-key authorization', async () => {
        const previousStrict = process.env.ENFORCE_STRICT_CORS;
        process.env.ENFORCE_STRICT_CORS = 'true';
        const req = mockReq({
            method: 'POST',
            headers: { origin: 'https://new-customer.example' },
            body: { apiKey: 'invalid-key' }
        });
        const res = mockRes();
        await expect(applyPluginCors(req, res)).resolves.toBe(true);
        expect(res._headers['access-control-allow-origin']).toBe('https://new-customer.example');
        if (previousStrict === undefined) delete process.env.ENFORCE_STRICT_CORS;
        else process.env.ENFORCE_STRICT_CORS = previousStrict;
    });

    test('allows preflight from an arbitrary HTTPS origin', async () => {
        const previousStrict = process.env.ENFORCE_STRICT_CORS;
        process.env.ENFORCE_STRICT_CORS = 'true';
        const req = mockReq({
            method: 'OPTIONS',
            headers: { origin: 'https://another-customer.example' }
        });
        const res = mockRes();
        await expect(applyPluginCors(req, res)).resolves.toBe(true);
        expect(res._headers['access-control-allow-origin']).toBe('https://another-customer.example');
        expect(res._headers['access-control-allow-methods']).toContain('POST');
        if (previousStrict === undefined) delete process.env.ENFORCE_STRICT_CORS;
        else process.env.ENFORCE_STRICT_CORS = previousStrict;
    });

    test('confirms a tenant only after MongoDB accepts the account', async () => {
        const db = { collection: () => ({ insertOne: async () => ({ acknowledged: true }) }) };
        await expect(customerAuth.__saveTenant(db, { id: 'tenant-1' })).resolves.toBe(true);
    });
});
