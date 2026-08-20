const { canonicalOrigin, firstPartyDemoAllowed, normalizeAllowedOrigins, tenantIsActive } = require('../../services/tenantAccess');
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
