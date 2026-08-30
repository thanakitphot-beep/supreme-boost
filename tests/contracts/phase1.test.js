/**
 * Phase 1 Contract Tests — Regression Protection
 * Ensures existing API contracts are not broken by future changes.
 * Run: npx jest tests/contracts
 */

// ── Helper: create a minimal mock req/res pair ─────────────────────────────

function mockReq(overrides = {}) {
    return {
        method: 'POST',
        url: '/api/chat',
        headers: { 'content-type': 'application/json' },
        body: {},
        id: 'test-' + Date.now(),
        query: {},
        ...overrides,
    };
}

function mockRes() {
    const res = {
        _statusCode: 200,
        _body: null,
        _headers: {},
        headersSent: false,
        setHeader(k, v) { this._headers[k] = v; },
        status(code) { this._statusCode = code; return this; },
        json(data) {
            this._body = data;
            this.headersSent = true;
            return this;
        },
        end(data) {
            if (!this.headersSent) { this._body = data || null; this.headersSent = true; }
            return this;
        },
        writeHead(code, headers) {
            this._statusCode = code;
            if (headers) Object.assign(this._headers, headers);
        }
    };
    return res;
}

// ── 1. Chat API — Contract Tests ────────────────────────────────────────────

describe('POST /api/chat — contract', () => {
    const chatHandler = require('../../api/chat');

    test('OPTIONS preflight returns 200', async () => {
        const req = mockReq({ method: 'OPTIONS', url: '/api/chat', body: {} });
        const res = mockRes();
        await chatHandler(req, res);
        expect(res._statusCode).toBe(200);
    });

    test('GET method returns 405', async () => {
        const req = mockReq({ method: 'GET', url: '/api/chat', body: {} });
        const res = mockRes();
        await chatHandler(req, res);
        expect(res._statusCode).toBe(405);
    });

    test('Empty prompt returns 400', async () => {
        const req = mockReq({ body: { prompt: '' } });
        const res = mockRes();
        await chatHandler(req, res);
        expect(res._statusCode).toBe(400);
    });

    test('Response schema includes reply field on success', async () => {
        // This test will only run if GEMINI_API_KEY is set
        if (!process.env.GEMINI_API_KEY) {
            console.warn('[SKIP] GEMINI_API_KEY not set');
            return;
        }
        const req = mockReq({ body: { prompt: 'สวัสดี', locale: 'th' } });
        const res = mockRes();
        await chatHandler(req, res);
        expect(res._body).toHaveProperty('reply');
    });
});

// ── 2. Auth API — Contract Tests ────────────────────────────────────────────

describe('POST /api/auth — contract', () => {
    const authHandler = require('../../api/auth');

    const previousJwtSecret = process.env.JWT_SECRET;
    const previousAdminPassword = process.env.ADMIN_PASSWORD;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-to-be-safe';
        process.env.ADMIN_PASSWORD = 'test-admin-password';
    });

    afterAll(() => {
        if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousJwtSecret;
        if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
        else process.env.ADMIN_PASSWORD = previousAdminPassword;
    });

    test('OPTIONS preflight returns 200', async () => {
        const req = mockReq({ method: 'OPTIONS', url: '/api/auth', body: {} });
        const res = mockRes();
        await authHandler(req, res);
        expect(res._statusCode).toBe(200);
    });

    test('Wrong password returns 401', async () => {
        const req = mockReq({
            method: 'POST',
            url: '/api/auth',
            body: { password: 'WRONG_PASSWORD_XYZ' }
        });
        const res = mockRes();
        await authHandler(req, res);
        expect(res._statusCode).toBe(401);
        expect(res._body).toHaveProperty('success', false);
    });

    test('Hardcoded bypass token ADMIN_SUPREME_TOKEN_12345 is rejected', async () => {
        // SECURITY: This token must no longer grant access
        const req = mockReq({
            method: 'GET',
            url: '/api/auth?token=ADMIN_SUPREME_TOKEN_12345'
        });
        const res = mockRes();
        await authHandler(req, res);
        expect(res._statusCode).toBe(401);
    });

    test('Refresh tokens cannot be used as access tokens', async () => {
        const loginRes = mockRes();
        await authHandler(mockReq({ body: { password: 'test-admin-password' } }), loginRes);
        const verifyRes = mockRes();
        await authHandler(mockReq({ method: 'GET', headers: { authorization: `Bearer ${loginRes._body.refreshToken}` } }), verifyRes);
        expect(verifyRes._statusCode).toBe(401);
    });
});

// ── 3. Health Check — Contract Tests ────────────────────────────────────────

describe('GET /api/v1/health — contract', () => {
    const healthHandler = require('../../api/v1/health');

    test('Returns status field', async () => {
        const req = mockReq({ method: 'GET', url: '/api/v1/health' });
        const res = mockRes();
        await healthHandler(req, res);
        expect(res._body).toHaveProperty('status');
        expect(['healthy', 'degraded']).toContain(res._body.status);
    });

    test('Returns version field', async () => {
        const req = mockReq({ method: 'GET', url: '/api/v1/health' });
        const res = mockRes();
        await healthHandler(req, res);
        expect(res._body).toHaveProperty('version');
    });
});
