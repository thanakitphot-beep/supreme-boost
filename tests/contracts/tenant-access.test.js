const { canonicalOrigin, firstPartyDemoAllowed, normalizeAllowedOrigins, tenantIsActive } = require('../../services/tenantAccess');
const customerAuth = require('../../api/customer-auth');
const otp = require('../../api/otp');
const crawl = require('../../api/crawl');
const memoryApi = require('../../api/v1/memory');
const knowledgeApi = require('../../api/knowledge');
const chatApi = require('../../api/chat');
const tenantApi = require('../../api/tenant');
const { normalizeEmail } = require('../../services/email');

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
        expect(tenantIsActive({ status: 'active', expires_at: 'not-a-date' })).toBe(false);
    });

    test('lets pending accounts inspect only their profile before checkout', () => {
        const pending = { status: 'pending', expires_at: null };
        expect(tenantApi.__mayAccessTenantAction(pending, 'GET', 'profile')).toBe(true);
        expect(tenantApi.__mayAccessTenantAction(pending, 'GET', 'settings')).toBe(false);
        expect(tenantApi.__mayAccessTenantAction(pending, 'POST', 'save_settings')).toBe(false);
        expect(tenantApi.__mayAccessTenantAction({ status: 'active', expires_at: '2000-01-01T00:00:00.000Z' }, 'GET', 'profile')).toBe(true);
        expect(tenantApi.__mayAccessTenantAction({ status: 'suspended' }, 'GET', 'profile')).toBe(false);
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

    test('disables the first-party demo by default and requires an explicit opt-in', () => {
        const previous = process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO;
        const previousUrl = process.env.RENDER_EXTERNAL_URL;
        delete process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO;
        process.env.RENDER_EXTERNAL_URL = 'https://indicator-web-chat.onrender.com';
        expect(firstPartyDemoAllowed('https://indicator-web-chat.onrender.com')).toBe(false);
        process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO = 'true';
        expect(firstPartyDemoAllowed('https://indicator-web-chat.onrender.com')).toBe(true);
        process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO = 'false';
        expect(firstPartyDemoAllowed('https://indicator-web-chat.onrender.com')).toBe(false);
        if (previous === undefined) delete process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO;
        else process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO = previous;
        if (previousUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
        else process.env.RENDER_EXTERNAL_URL = previousUrl;
    });
});

describe('Google Sign-In configuration', () => {
    test('normalizes bounded email strings and rejects query objects', () => {
        expect(normalizeEmail(' Owner@Example.COM ')).toBe('owner@example.com');
        expect(normalizeEmail({ $ne: null })).toBe('');
        expect(normalizeEmail('not-an-email')).toBe('');
    });

    test('does not expose Google Sign-In when the client ID is missing', async () => {
        const previous = process.env.GOOGLE_CLIENT_ID;
        delete process.env.GOOGLE_CLIENT_ID;
        const res = mockRes();
        await customerAuth(mockReq(), res);
        expect(res._statusCode).toBe(503);
        if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
        else process.env.GOOGLE_CLIENT_ID = previous;
    });

    test('publishes registration availability without exposing secrets', async () => {
        const previous = process.env.REGISTRATION_MODE;
        process.env.REGISTRATION_MODE = 'disabled';
        const res = mockRes();
        await customerAuth(mockReq({ url: '/api/customer-auth?action=public-config' }), res);
        expect(res._statusCode).toBe(200);
        expect(res._body).toEqual({ registrationEnabled: false, googleSignInEnabled: false });
        expect(JSON.stringify(res._body)).not.toMatch(/secret|password|mongodb/iu);
        if (previous === undefined) delete process.env.REGISTRATION_MODE;
        else process.env.REGISTRATION_MODE = previous;
    });
});

describe('Free-preview account controls', () => {
    test('rejects password registration before database access when registration is disabled', async () => {
        const previous = process.env.REGISTRATION_MODE;
        process.env.REGISTRATION_MODE = 'disabled';
        const res = mockRes();
        await customerAuth(mockReq({ method: 'POST', body: { action: 'register', username: 'owner', password: 'not-used' } }), res);
        expect(res._statusCode).toBe(503);
        expect(res._body.error).toMatch(/registration.*disabled/iu);
        if (previous === undefined) delete process.env.REGISTRATION_MODE;
        else process.env.REGISTRATION_MODE = previous;
    });

    test('rejects OTP requests when public registration is disabled', async () => {
        const previous = process.env.REGISTRATION_MODE;
        process.env.REGISTRATION_MODE = 'disabled';
        const res = mockRes();
        await otp(mockReq({ method: 'POST', url: '/api/otp', body: { action: 'request', email: 'owner@example.com' } }), res);
        expect(res._statusCode).toBe(503);
        expect(res._body.error).toMatch(/registration.*disabled/iu);
        if (previous === undefined) delete process.env.REGISTRATION_MODE;
        else process.env.REGISTRATION_MODE = previous;
    });
});

describe('Crawler origin binding', () => {
    test('allows only roots on the exact caller origin', () => {
        expect(crawl.__rootMatchesRequestOrigin('https://shop.example/catalog', 'https://shop.example')).toBe(true);
        expect(crawl.__rootMatchesRequestOrigin('https://admin.shop.example/', 'https://shop.example')).toBe(false);
        expect(crawl.__rootMatchesRequestOrigin('https://shop.example.evil.test/', 'https://shop.example')).toBe(false);
        expect(crawl.__rootMatchesRequestOrigin('not-a-url', 'https://shop.example')).toBe(false);
    });

    test('allows knowledge crawling only for a tenant registered origin', () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const tenant = { allowed_origins: ['https://shop.example'] };
        expect(knowledgeApi.__tenantAllowsCrawl(tenant, 'https://shop.example/catalog')).toBe(true);
        expect(knowledgeApi.__tenantAllowsCrawl(tenant, 'https://shop.example.evil.test/catalog')).toBe(false);
        expect(knowledgeApi.__tenantAllowsCrawl(tenant, 'http://shop.example/catalog')).toBe(false);
        if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
    });

    test('binds learned page URLs to the caller origin and removes query data', () => {
        expect(chatApi.__pageUrlForOrigin('https://shop.example/catalog?customer=42#private', 'https://shop.example')).toBe('https://shop.example/catalog');
        expect(chatApi.__pageUrlForOrigin('https://evil.example/catalog', 'https://shop.example')).toBe('');
        expect(chatApi.__pageUrlForOrigin('javascript:alert(1)', 'https://shop.example')).toBe('');
    });

    test('binds manual knowledge sources to registered HTTPS tenant origins', () => {
        const tenant = { allowed_origins: ['https://shop.example'] };
        expect(tenantApi.__knowledgeSourceUrl('https://shop.example/help?customer=42#private', tenant)).toBe('https://shop.example/help');
        expect(tenantApi.__knowledgeSourceUrl('https://evil.example/help', tenant)).toBeNull();
        expect(tenantApi.__knowledgeSourceUrl('javascript:alert(1)', tenant)).toBeNull();
    });
});

describe('Long-term memory tenant isolation', () => {
    test('allows tenant-scoped memory access only to the matching tenant or an admin', () => {
        expect(memoryApi.__canAccessTenant({ role: 'tenant', tenantId: 'tenant-a' }, 'tenant-a')).toBe(true);
        expect(memoryApi.__canAccessTenant({ role: 'tenant', tenantId: 'tenant-a' }, 'tenant-b')).toBe(false);
        expect(memoryApi.__canAccessTenant({ role: 'admin' }, 'tenant-b')).toBe(true);
        expect(memoryApi.__canAccessTenant({ role: 'tenant' }, 'tenant-a')).toBe(false);
    });

    test('bounds memory query and expiry values', () => {
        expect(memoryApi.__boundedInteger('500', 10, 1, 50)).toBe(50);
        expect(memoryApi.__boundedInteger('-1', 10, 1, 50)).toBe(1);
        expect(memoryApi.__boundedInteger('invalid', 10, 1, 50)).toBe(10);
    });
});
