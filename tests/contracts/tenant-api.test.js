const { connectToDatabase } = require('../../api/_mongodb.js');
const tenantApi = require('../../api/tenant');

jest.mock('../../api/_mongodb.js', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../services/cors', () => ({ setCorsHeaders: jest.fn(() => true) }));
jest.mock('../../services/rateLimit', () => ({ checkRateLimit: jest.fn(() => true) }));

function mockReq(overrides = {}) {
    return {
        method: 'POST',
        url: '/api/tenant?action=save_origins',
        headers: { authorization: 'Bearer sk_live_test' },
        body: {},
        socket: { remoteAddress: '1.2.3.4' },
        ...overrides
    };
}

function mockRes() {
    return {
        _statusCode: 200,
        _body: null,
        setHeader() { },
        status(code) { this._statusCode = code; return this; },
        json(body) { this._body = body; return this; },
        end() { return this; }
    };
}

describe('Tenant allowed origins', () => {
    const tenant = { id: 'tenant-1', api_key: 'sk_live_test', status: 'active', expires_at: null };
    let updateOne;

    beforeEach(() => {
        updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
        connectToDatabase.mockResolvedValue({
            collection: jest.fn(() => ({
                findOne: jest.fn().mockResolvedValue(tenant),
                updateOne
            }))
        });
    });

    test('lets an active tenant register exact HTTPS origins for its own widget', async () => {
        const res = mockRes();
        await tenantApi(mockReq({ body: { allowed_origins: 'https://shop.example.com\nhttps://www.shop.example.com/' } }), res);

        expect(res._statusCode).toBe(200);
        expect(res._body).toEqual({
            success: true,
            allowed_origins: ['https://shop.example.com', 'https://www.shop.example.com']
        });
        expect(updateOne).toHaveBeenCalledWith(
            { id: tenant.id },
            { $set: { allowed_origins: ['https://shop.example.com', 'https://www.shop.example.com'] } }
        );
    });

    test('allows a tenant to remove restrictions but rejects malformed origin input', async () => {
        const unrestricted = mockRes();
        await tenantApi(mockReq({ body: { allowed_origins: '' } }), unrestricted);
        expect(unrestricted._statusCode).toBe(200);
        expect(unrestricted._body).toEqual({ success: true, allowed_origins: [] });

        const res = mockRes();
        await tenantApi(mockReq({ body: { allowed_origins: 'https://shop.example.com/path\nnot-a-url' } }), res);

        expect(res._statusCode).toBe(400);
        expect(res._body.error).toBe('Add valid HTTPS origins without paths');
        expect(updateOne).toHaveBeenCalledTimes(1);
    });
});
