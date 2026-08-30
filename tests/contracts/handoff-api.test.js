const handoffHandler = require('../../api/handoff');

function mockReq(overrides = {}) {
    return {
        method: 'POST',
        url: '/api/handoff',
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
        end(body) { this._body = body; return this; }
    };
}

describe('Human handoff API', () => {
    test('rejects unsupported methods', async () => {
        const res = mockRes();
        await handoffHandler(mockReq({ method: 'GET' }), res);
        expect(res._statusCode).toBe(405);
    });

    test('returns a truthful unavailable state for a non-tenant demo request', async () => {
        const res = mockRes();
        await handoffHandler(mockReq(), res);
        expect(res._statusCode).toBe(200);
        expect(res._body.status).toBe('unavailable');
    });

    test('returns only validated tenant support contacts without masking them', () => {
        expect(handoffHandler.__safeContact({
            support_email: ' Support@Example.com ',
            support_phone: '+66 81 234 5678',
            support_url: 'https://support.example.com/help'
        })).toEqual({
            email: 'support@example.com',
            phone: '+66 81 234 5678',
            url: 'https://support.example.com/help'
        });
        expect(handoffHandler.__safeContact({ support_url: 'javascript:alert(1)' })).toEqual({});
    });

    test('binds handoff page URLs to the requesting origin and drops private query data', () => {
        expect(handoffHandler.__pageUrlForOrigin('https://shop.example/orders?customer=123#detail', 'https://shop.example'))
            .toBe('https://shop.example/orders');
        expect(handoffHandler.__pageUrlForOrigin('https://attacker.example/', 'https://shop.example')).toBe('');
    });
});
