jest.mock('../../api/_mongodb.js', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../services/cors', () => ({ setCorsHeaders: jest.fn(() => true) }));
jest.mock('../../services/rateLimit', () => ({ checkRateLimit: jest.fn(() => true) }));

const { connectToDatabase } = require('../../api/_mongodb.js');
const { checkRateLimit } = require('../../services/rateLimit');
const { signToken } = require('../../api/_auth');
const adminHandler = require('../../api/admin');

function mockRes() {
    return {
        _statusCode: 200,
        _body: null,
        setHeader() {},
        status(code) { this._statusCode = code; return this; },
        json(body) { this._body = body; return this; },
        end() { return this; }
    };
}

describe('Admin overview API', () => {
    const previousJwtSecret = process.env.JWT_SECRET;
    const previousAdminPassword = process.env.ADMIN_PASSWORD;

    beforeAll(() => {
        process.env.JWT_SECRET = 'admin-overview-contract-secret';
        process.env.ADMIN_PASSWORD = 'admin-overview-password';
    });

    afterAll(() => {
        if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousJwtSecret;
        if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
        else process.env.ADMIN_PASSWORD = previousAdminPassword;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        const recentCursor = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            toArray: jest.fn().mockResolvedValue([
                { id: 'tenant-2', company_name: 'Beta', api_key: 'sk_beta', status: 'active', password: 'secret' },
                { id: 'tenant-1', company_name: null, api_key: null, status: null }
            ])
        };
        const collections = {
            tenants: {
                countDocuments: jest.fn(query => Promise.resolve(query?.status === 'active' ? 2 : 3)),
                find: jest.fn().mockReturnValue(recentCursor)
            },
            billing_requests: {
                countDocuments: jest.fn().mockResolvedValue(1)
            },
            payment_methods: {
                countDocuments: jest.fn().mockResolvedValue(2)
            }
        };
        connectToDatabase.mockResolvedValue({
            collection: jest.fn(name => collections[name])
        });
    });

    test('returns dashboard counts and only normalized recent tenants', async () => {
        const token = signToken({ role: 'admin', sub: 'admin' });
        const req = {
            method: 'GET',
            url: '/api/admin?action=overview',
            headers: { host: 'localhost', authorization: `Bearer ${token}` },
            body: {},
            socket: { remoteAddress: '198.51.100.12' },
            _rateLimitChecked: true
        };
        const res = mockRes();

        await adminHandler(req, res);

        expect(res._statusCode).toBe(200);
        expect(res._body).toEqual({
            tenants: 3,
            pendingBilling: 1,
            activeTenants: 2,
            activePaymentMethods: 2,
            recentTenants: [
                { id: 'tenant-2', company_name: 'Beta', api_key: 'sk_beta', status: 'active' },
                { id: 'tenant-1', company_name: 'ไม่ระบุชื่อ', api_key: '', status: 'suspended' }
            ]
        });
        expect(checkRateLimit).not.toHaveBeenCalled();
    });

    test('checks the rate limit when invoked directly without the server marker', async () => {
        const token = signToken({ role: 'admin', sub: 'admin' });
        const req = {
            method: 'GET',
            url: '/api/admin?action=overview',
            headers: { host: 'localhost', authorization: `Bearer ${token}` },
            body: {},
            socket: { remoteAddress: '198.51.100.14' }
        };

        await adminHandler(req, mockRes());

        expect(checkRateLimit).toHaveBeenCalledTimes(1);
        expect(checkRateLimit).toHaveBeenCalledWith(req, expect.any(Object), 'admin');
    });
});
