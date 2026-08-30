const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { hashPassword, passwordIsValid, verifyPassword } = require('../../services/passwords');
const { validateResponse } = require('../../services/ai/responseValidator');
const intelligenceBridge = require('../../services/intelligenceBridge');
const server = require('../../server');
const { issueRegistrationGrant, readRegistrationGrant } = require('../../services/registrationGrant');
const { CRITICAL_INDEXES } = require('../../services/mongoIndexes');
const health = require('../../api/v1/health');
const { releaseInfo } = require('../../services/release');
const { signToken, accessTokenFromRequest, setAdminSessionCookie } = require('../../api/_auth');
const geo = require('../../api/geo');
const { maskPII } = require('../../services/safety');
const packageJson = require('../../package.json');

async function requestFromLocalServer(pathname, options) {
    const app = http.createServer(server);
    await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
    const { port } = app.address();
    try {
        const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
        await response.arrayBuffer();
        return response;
    } finally {
        await new Promise(resolve => {
            app.close(resolve);
            if (typeof app.closeAllConnections === 'function') app.closeAllConnections();
        });
    }
}

describe('Production hardening', () => {
    test('routes the platform default start command through release gates', () => {
        expect(packageJson.scripts.start).toBe('npm run release:start');
        expect(packageJson.scripts['release:start']).toContain('npm run db:indexes');
    });

    test('uses salted scrypt passwords and upgrades legacy records after verification', async () => {
        const password = 'correct horse battery staple';
        const stored = await hashPassword(password);
        expect(stored).toMatch(/^scrypt\$/);
        expect(await verifyPassword(stored, password)).toEqual({ matches: true, needsUpgrade: false });
        expect(await verifyPassword(stored, 'wrong password')).toEqual({ matches: false, needsUpgrade: false });

        const legacy = crypto.createHash('sha256').update(password).digest('hex');
        expect(await verifyPassword(legacy, password)).toEqual({ matches: true, needsUpgrade: true });
        expect(passwordIsValid('too-short')).toBe(false);
        expect(passwordIsValid('x'.repeat(257))).toBe(false);
    });

    test('keeps browser admin sessions in an HttpOnly cookie while accepting operator bearer tokens', () => {
        const previous = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'test-signing-secret';
        const token = signToken({ role: 'admin', sub: 'admin' });
        const response = { setHeader(name, value) { this[name] = value; } };
        setAdminSessionCookie(response, token);
        expect(response['Set-Cookie']).toContain('HttpOnly');
        expect(response['Set-Cookie']).toContain('SameSite=Strict');
        expect(response['Set-Cookie']).toContain('Path=/api');
        const cookie = response['Set-Cookie'].split(';')[0];
        expect(accessTokenFromRequest({ headers: { cookie } })).toBe(token);
        expect(accessTokenFromRequest({ headers: { authorization: `Bearer ${token}` } })).toBe(token);
        if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous;
    });

    test('does not expose data, source, or configuration files from the static server', () => {
        expect(server.__isPublicStaticPath('/supreme-boost/boost.js')).toBe(true);
        expect(server.__isPublicStaticPath('/styles/indicator-ui.css')).toBe(true);
        expect(server.__isPublicStaticPath('/manifest.json')).toBe(true);
        expect(server.__isPublicStaticPath('/data/tenants.json')).toBe(false);
        expect(server.__isPublicStaticPath('/data/knowledge-ledger.json')).toBe(false);
        expect(server.__isPublicStaticPath('/services/tenantAccess.js')).toBe(false);
        expect(server.__isPublicStaticPath('/node_modules/example/private.png')).toBe(false);
        expect(server.__isPublicStaticPath('/embed-example.html')).toBe(false);
        expect(server.__isPublicStaticPath('/.env')).toBe(false);
    });

    test('returns 404 for private static paths in the local runtime', async () => {
        const privateResponse = await requestFromLocalServer('/data/tenants.json');
        expect(privateResponse.status).toBe(404);
        expect(privateResponse.headers.get('x-content-type-options')).toBe('nosniff');
        expect(privateResponse.headers.get('x-frame-options')).toBe('DENY');
        expect((await requestFromLocalServer('/data/knowledge-ledger.json')).status).toBe(404);
        expect((await requestFromLocalServer('/services/tenantAccess.js')).status).toBe(404);
        expect((await requestFromLocalServer('/supreme-boost/boost.js')).status).toBe(200);
        const publicWidget = await requestFromLocalServer('/supreme-boost/boost.js', { headers: { Origin: 'https://customer.example' } });
        expect(publicWidget.status).toBe(200);
        expect(publicWidget.headers.get('access-control-allow-origin')).toBe('*');
    });

    test('marks API responses as non-cacheable and blocks framing', async () => {
        const response = await requestFromLocalServer('/api/v1/livez');
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    });

    test('does not expose or shared-cache caller IP data from geo fallback responses', async () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const res = {
            headers: {},
            setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; }
        };
        try {
            await geo({ method: 'GET', headers: {}, socket: { remoteAddress: 'invalid-ip' }, _rateLimitChecked: true }, res);
            expect(res.statusCode).toBe(200);
            expect(res.headers['cache-control']).toBe('private, no-store');
            expect(res.body).not.toHaveProperty('ip');
            expect(res.body.countryCode).toBe('');
        } finally {
            if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
        }
    });

    test('strips unsafe model actions while retaining a bounded handoff request', () => {
        const malicious = validateResponse(JSON.stringify({
            reply: 'hello',
            cssCommand: ':host { position: fixed; inset: 0 }',
            action: { type: 'inject_html', html: '<img src=x onerror=alert(1)>', containerSelector: 'body' },
            interactive: { type: 'carousel', items: [{ title: '<img onerror=alert(1)>', image: 'https://tracker.example/pixel' }] },
            metadata: { attackerControlled: true }
        }), 'test-request');
        expect(malicious.isValid).toBe(true);
        expect(malicious.parsed.action).toBeNull();
        expect(malicious.parsed.cssCommand).toBe('');
        expect(malicious.parsed.metadata).toEqual({});
        expect(malicious.parsed.interactive.items[0]).toEqual({ title: 'img onerror=alert(1)', subtitle: '', description: '' });

        const handoff = validateResponse(JSON.stringify({ reply: 'ส่งต่อให้ครับ', action: { type: 'handoff', priority: 'high', extra: 'ignored' } }), 'test-request');
        expect(handoff.parsed.action).toEqual({ type: 'handoff', priority: 'high' });
    });

    test('masks common formatted Thai contact details before provider calls', () => {
        const masked = maskPII('นางสาว สมใจ ใจดี โทร 081-234-5678 หรือ +66 89 123 4567');
        expect(masked).not.toContain('สมใจ');
        expect(masked).not.toContain('081-234-5678');
        expect(masked).not.toContain('+66 89 123 4567');
        expect(masked).toContain('[REDACTED_NAME]');
        expect(masked.match(/\[REDACTED_PHONE\]/g)).toHaveLength(2);
    });

    test('uses the authoritative tenant id for the optional intelligence service', () => {
        expect(intelligenceBridge.__siteId({ tenantId: 'tenant-a', siteProfile: { id: 'profile-a' } })).toBe('tenant:tenant-a');
        expect(intelligenceBridge.__siteId({ tenantId: 'tenant-b', siteProfile: { id: 'profile-a' } })).toBe('tenant:tenant-b');
    });

    test('keeps the admin tenant-creation script syntactically valid', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../../admin-dashboard.html'), 'utf8');
        const scripts = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/gi)].map(match => match[1]);
        expect(scripts.length).toBeGreaterThan(0);
        scripts.forEach(script => expect(() => new vm.Script(script)).not.toThrow());
    });

    test('binds an email verification grant to one email and an HttpOnly path-scoped cookie', () => {
        const previous = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'test-signing-secret';
        const res = { _headers: {}, setHeader(_, value) { this.cookie = value; this._headers['Set-Cookie'] = value; } };
        const grant = issueRegistrationGrant(res, 'owner@example.com');
        const cookie = res.cookie[0].split(';')[0];
        expect(grant).toBeTruthy();
        expect(res.cookie.join(';')).toContain('HttpOnly');
        expect(res.cookie.join(';')).toContain('Path=/api/customer-auth');
        expect(readRegistrationGrant({ headers: { cookie } }, 'owner@example.com')).toMatchObject({ nonce: grant.nonce });
        expect(readRegistrationGrant({ headers: { cookie } }, 'other@example.com')).toBeNull();
        if (previous === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previous;
    });

    test('enforces tenant identity keys without requiring one email per company', () => {
        const tenantIndexes = CRITICAL_INDEXES.filter(index => index.collection === 'tenants');
        expect(tenantIndexes.map(index => index.name)).toEqual(expect.arrayContaining([
            'tenant_api_key_unique',
            'tenant_username_unique',
            'tenant_google_subject_unique'
        ]));
        expect(tenantIndexes.some(index => index.key.email === 1)).toBe(false);
    });

    test('reports the immutable platform release without exposing unrelated environment data', () => {
        expect(releaseInfo({ RENDER_GIT_COMMIT: 'a'.repeat(64) })).toEqual({ version: '1.0.0', commit: 'a'.repeat(40) });
        expect(releaseInfo({})).toEqual({ version: '1.0.0', commit: 'unknown' });
    });

    test('fails readiness while the process is draining', async () => {
        health.setDraining(true);
        try {
            await expect(health.__readinessStatus()).resolves.toMatchObject({
                ok: false,
                status: 'not_ready',
                checks: { server: 'draining' }
            });
        } finally {
            health.setDraining(false);
        }
    });
});
