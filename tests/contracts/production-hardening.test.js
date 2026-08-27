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

async function requestFromLocalServer(pathname) {
    const app = http.createServer(server);
    await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
    const { port } = app.address();
    try {
        return await fetch(`http://127.0.0.1:${port}${pathname}`);
    } finally {
        await new Promise(resolve => app.close(resolve));
    }
}

describe('Production hardening', () => {
    test('uses salted scrypt passwords and upgrades legacy records after verification', async () => {
        const password = 'correct horse battery staple';
        const stored = await hashPassword(password);
        expect(stored).toMatch(/^scrypt\$/);
        expect(await verifyPassword(stored, password)).toEqual({ matches: true, needsUpgrade: false });
        expect(await verifyPassword(stored, 'wrong password')).toEqual({ matches: false, needsUpgrade: false });

        const legacy = crypto.createHash('sha256').update(password).digest('hex');
        expect(await verifyPassword(legacy, password)).toEqual({ matches: true, needsUpgrade: true });
        expect(passwordIsValid('too-short')).toBe(false);
    });

    test('does not expose data, source, or configuration files from the static server', () => {
        expect(server.__isPublicStaticPath('/supreme-boost/boost.js')).toBe(true);
        expect(server.__isPublicStaticPath('/styles/indicator-ui.css')).toBe(true);
        expect(server.__isPublicStaticPath('/data/tenants.json')).toBe(false);
        expect(server.__isPublicStaticPath('/data/knowledge-ledger.json')).toBe(false);
        expect(server.__isPublicStaticPath('/services/tenantAccess.js')).toBe(false);
        expect(server.__isPublicStaticPath('/.env')).toBe(false);
    });

    test('returns 404 for private static paths in the local runtime', async () => {
        expect((await requestFromLocalServer('/data/tenants.json')).status).toBe(404);
        expect((await requestFromLocalServer('/data/knowledge-ledger.json')).status).toBe(404);
        expect((await requestFromLocalServer('/services/tenantAccess.js')).status).toBe(404);
        expect((await requestFromLocalServer('/supreme-boost/boost.js')).status).toBe(200);
    });

    test('strips unsafe model actions while retaining a bounded handoff request', () => {
        const malicious = validateResponse(JSON.stringify({
            reply: 'hello',
            action: { type: 'inject_html', html: '<img src=x onerror=alert(1)>', containerSelector: 'body' }
        }), 'test-request');
        expect(malicious.isValid).toBe(true);
        expect(malicious.parsed.action).toBeNull();

        const handoff = validateResponse(JSON.stringify({ reply: 'ส่งต่อให้ครับ', action: { type: 'handoff', priority: 'high', extra: 'ignored' } }), 'test-request');
        expect(handoff.parsed.action).toEqual({ type: 'handoff', priority: 'high' });
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
});
