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
});
