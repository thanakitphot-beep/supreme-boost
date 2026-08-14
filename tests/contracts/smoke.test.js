/**
 * Phase 0 Smoke Tests — Startup, Widget Asset, Auth Route
 * Complements the contract tests in phase1.test.js
 * Run: npx jest tests/contracts --forceExit --no-coverage
 */

const path = require('path');
const fs = require('fs');

// ─── Mock req/res helpers ────────────────────────────────────────────────────

function mockReq(overrides = {}) {
    return {
        method: 'GET',
        url: '/',
        headers: {},
        body: {},
        query: {},
        socket: { remoteAddress: '1.2.3.4' },
        ...overrides,
    };
}

function mockRes() {
    const res = {
        _statusCode: 200,
        _body: null,
        _headers: {},
        headersSent: false,
        setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
        status(code) { this._statusCode = code; return this; },
        json(data) { this._body = data; this.headersSent = true; return this; },
        end(data) { if (!this.headersSent) { this._body = data || null; this.headersSent = true; } return this; },
        writeHead(code, headers) { this._statusCode = code; if (headers) Object.assign(this._headers, headers); },
    };
    return res;
}

// ─── 1. Startup Smoke ─────────────────────────────────────────────────────────

describe('Startup smoke — modules load without throwing', () => {
    test('server.js can be required without error', () => {
        // Just requiring it should not throw (even without .env)
        expect(() => require('../../server')).not.toThrow();
    });

    test('api/auth.js shim can be required', () => {
        expect(() => require('../../api/auth')).not.toThrow();
    });

    test('api/admin.js can be required', () => {
        expect(() => require('../../api/admin')).not.toThrow();
    });

    test('services/cors.js can be required', () => {
        expect(() => require('../../services/cors')).not.toThrow();
    });

    test('services/ssrfBlocker.js can be required', () => {
        expect(() => require('../../services/ssrfBlocker')).not.toThrow();
    });
});

// ─── 2. Widget Asset ──────────────────────────────────────────────────────────

describe('Widget asset — boost.js exists and has content', () => {
    const widgetPath = path.resolve(__dirname, '../../supreme-boost/boost.js');

    test('supreme-boost/boost.js exists on disk', () => {
        expect(fs.existsSync(widgetPath)).toBe(true);
    });

    test('supreme-boost/boost.js is non-empty', () => {
        const stat = fs.statSync(widgetPath);
        expect(stat.size).toBeGreaterThan(1000); // must be at least 1 KB
    });

    test('supreme-boost/boost.js contains expected widget bootstrap code', () => {
        const content = fs.readFileSync(widgetPath, 'utf8');
        // Must contain Shadow DOM usage (key widget contract)
        expect(content).toMatch(/attachShadow|shadowRoot/);
    });
});

// ─── 3. SSRF Blocker ─────────────────────────────────────────────────────────

describe('services/ssrfBlocker — URL validation', () => {
    const { isSafeUrl } = require('../../services/ssrfBlocker');

    test('blocks localhost', () => {
        expect(isSafeUrl('http://localhost/foo')).toBe(false);
    });

    test('blocks 127.0.0.1', () => {
        expect(isSafeUrl('http://127.0.0.1/admin')).toBe(false);
    });

    test('blocks AWS metadata endpoint', () => {
        expect(isSafeUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    });

    test('blocks file:// URLs', () => {
        expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    });

    test('blocks 10.x private IP', () => {
        expect(isSafeUrl('http://10.0.0.1/secret')).toBe(false);
    });

    test('allows a public HTTPS URL', () => {
        expect(isSafeUrl('https://www.example.com/about')).toBe(true);
    });

    test('allows a public HTTP URL', () => {
        expect(isSafeUrl('http://www.example.co.th/page')).toBe(true);
    });
});

// ─── 4. Admin Auth — backdoor token rejected ─────────────────────────────────

describe('api/admin — security', () => {
    const adminHandler = require('../../api/admin');

    test('OPTIONS returns 200 (CORS preflight)', async () => {
        const req = mockReq({ method: 'OPTIONS', url: '/api/admin' });
        const res = mockRes();
        await adminHandler(req, res);
        expect(res._statusCode).toBe(200);
    });

    test('GET without token returns 401', async () => {
        const req = mockReq({ method: 'GET', url: '/api/admin?action=stats', headers: {} });
        const res = mockRes();
        await adminHandler(req, res);
        expect(res._statusCode).toBe(401);
    });

    test('POST login with hardcoded ADMIN_SUPREME_TOKEN_12345 does NOT log in', async () => {
        // The old admin.js returned this token on login — now it must not
        const req = mockReq({
            method: 'GET',
            url: '/api/admin?action=stats',
            headers: { authorization: 'Bearer ADMIN_SUPREME_TOKEN_12345' }
        });
        const res = mockRes();
        await adminHandler(req, res);
        expect(res._statusCode).toBe(401);
    });
});

// ─── 5. CORS service — feature flag behaviour ──────────────────────────────

describe('services/cors — ENFORCE_STRICT_CORS flag', () => {
    const { setCorsHeaders } = require('../../services/cors');

    test('When flag OFF (default): all origins get wildcard', () => {
        delete process.env.ENFORCE_STRICT_CORS;
        const req = mockReq({ headers: { origin: 'https://evil.com' } });
        const res = mockRes();
        setCorsHeaders(req, res);
        expect(res._headers['access-control-allow-origin']).toBe('*');
    });

    test('When flag ON and origin not in allowlist: origin is rejected', () => {
        process.env.ENFORCE_STRICT_CORS = 'true';
        process.env.CORS_ALLOWED_ORIGINS = 'https://trusted.com';
        const req = mockReq({ headers: { origin: 'https://evil.com' } });
        const res = mockRes();
        setCorsHeaders(req, res);
        expect(res._headers['access-control-allow-origin']).not.toBe('https://evil.com');
        expect(res._headers['access-control-allow-origin']).not.toBe('*');
        delete process.env.ENFORCE_STRICT_CORS;
        delete process.env.CORS_ALLOWED_ORIGINS;
    });

    test('When flag ON and origin IS in allowlist: it is reflected', () => {
        process.env.ENFORCE_STRICT_CORS = 'true';
        process.env.CORS_ALLOWED_ORIGINS = 'https://trusted.com';
        const req = mockReq({ headers: { origin: 'https://trusted.com' } });
        const res = mockRes();
        setCorsHeaders(req, res);
        expect(res._headers['access-control-allow-origin']).toBe('https://trusted.com');
        delete process.env.ENFORCE_STRICT_CORS;
        delete process.env.CORS_ALLOWED_ORIGINS;
    });
});
