const mockSendMail = jest.fn();
const {
    saveOtp,
    getOtp,
    attemptOtp,
    deleteOtp,
    consumeOtpVerification
} = require('../../api/_db.js');
const { connectToDatabase } = require('../../api/_mongodb.js');
const otpApi = require('../../api/otp');
const customerAuth = require('../../api/customer-auth');
const { createEmailVerificationToken, verifyEmailVerificationToken } = require('../../services/otpVerification');

jest.mock('../../api/_db.js', () => ({
    saveOtp: jest.fn(),
    getOtp: jest.fn(),
    attemptOtp: jest.fn(),
    deleteOtp: jest.fn(),
    consumeOtpVerification: jest.fn()
}));
jest.mock('../../api/_mongodb.js', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../services/cors', () => ({ setCorsHeaders: jest.fn(() => true) }));
jest.mock('../../services/rateLimit', () => ({ checkRateLimit: jest.fn(() => true) }));
jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({ sendMail: mockSendMail }))
}));

function mockReq(body) {
    return {
        method: 'POST',
        url: '/api/otp',
        headers: {},
        body,
        socket: { remoteAddress: '1.2.3.4' }
    };
}

function mockRes() {
    return {
        _statusCode: 200,
        _body: null,
        _headers: {},
        setHeader(name, value) { this._headers[name.toLowerCase()] = value; },
        status(code) { this._statusCode = code; return this; },
        json(body) { this._body = body; return this; },
        end() { return this; }
    };
}

describe('OTP delivery and registration proof', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'test-otp-signing-secret';
        process.env.BREVO_API_KEY = 'test-brevo-key';
        process.env.BREVO_FROM = 'INDICATOR WEB CHAT <verified@example.com>';
        delete process.env.OTP_EMAIL_PROVIDER;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;
        saveOtp.mockResolvedValue(true);
        getOtp.mockResolvedValue(null);
        attemptOtp.mockResolvedValue(null);
        deleteOtp.mockResolvedValue(true);
        consumeOtpVerification.mockResolvedValue(true);
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ messageId: 'sent' }) });
    });

    afterAll(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });

    test('sends OTP through the Brevo HTTPS API without using blocked SMTP', async () => {
        const res = mockRes();
        await otpApi(mockReq({ action: 'request', email: ' User@Example.com ' }), res);

        expect(res._statusCode).toBe(200);
        expect(res._body).toMatchObject({ success: true, expiresIn: 300 });
        expect(saveOtp).toHaveBeenCalledWith('user@example.com', expect.stringMatching(/^\d{6}$/), expect.any(Number), expect.any(String), 60000);
        expect(global.fetch).toHaveBeenCalledWith('https://api.brevo.com/v3/smtp/email', expect.objectContaining({ method: 'POST' }));
        const request = global.fetch.mock.calls[0][1];
        expect(request.headers['api-key']).toBe('test-brevo-key');
        expect(JSON.parse(request.body)).toMatchObject({
            sender: { name: 'INDICATOR WEB CHAT', email: 'verified@example.com' },
            to: [{ email: 'user@example.com' }]
        });
        expect(mockSendMail).not.toHaveBeenCalled();
    });

    test('does not claim success or retain an OTP when email delivery fails', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'bad key' }) });
        const res = mockRes();
        await otpApi(mockReq({ action: 'request', email: 'user@example.com' }), res);

        expect(res._statusCode).toBe(503);
        expect(res._body.error).toContain('ส่ง OTP ไม่สำเร็จ');
        expect(deleteOtp).toHaveBeenCalledWith('user@example.com', expect.any(String));
    });

    test('does not report a sent OTP when no email provider is configured', async () => {
        delete process.env.BREVO_API_KEY;
        const res = mockRes();
        await otpApi(mockReq({ action: 'request', email: 'user@example.com' }), res);

        expect(res._statusCode).toBe(503);
        expect(res._body.success).not.toBe(true);
        expect(deleteOtp).toHaveBeenCalledWith('user@example.com', expect.any(String));
    });

    test('requires a signing secret before generating or sending an OTP', async () => {
        delete process.env.JWT_SECRET;
        delete process.env.OTP_SIGNING_SECRET;
        const res = mockRes();
        await otpApi(mockReq({ action: 'request', email: 'user@example.com' }), res);

        expect(res._statusCode).toBe(503);
        expect(saveOtp).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('enforces the resend cooldown for an existing email challenge', async () => {
        getOtp.mockResolvedValue({ created_at: new Date().toISOString() });
        const res = mockRes();
        await otpApi(mockReq({ action: 'request', email: 'user@example.com' }), res);

        expect(res._statusCode).toBe(429);
        expect(res._headers['retry-after']).toBeDefined();
        expect(saveOtp).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('invalidates a challenge after five incorrect OTP attempts', async () => {
        attemptOtp.mockResolvedValue({ verified: false, document: { challengeId: 'challenge-1', attempts: 5 } });
        const res = mockRes();
        await otpApi(mockReq({ action: 'verify', email: 'user@example.com', otp: '000000' }), res);

        expect(res._statusCode).toBe(429);
        expect(deleteOtp).toHaveBeenCalledWith('user@example.com', 'challenge-1');
    });

    test('rejects MongoDB operator objects instead of treating them as an OTP', async () => {
        const res = mockRes();
        await otpApi(mockReq({ action: 'verify', email: 'user@example.com', otp: { $ne: null } }), res);

        expect(res._statusCode).toBe(400);
        expect(attemptOtp).not.toHaveBeenCalled();
    });

    test('returns a signed proof only after the correct OTP is verified', async () => {
        attemptOtp.mockImplementation(async (email, otp, token) => ({
            verified: true,
            document: { email, verificationTokenHash: require('crypto').createHash('sha256').update(token).digest('hex') }
        }));
        const res = mockRes();
        await otpApi(mockReq({ action: 'verify', email: 'user@example.com', otp: '123456' }), res);

        expect(res._statusCode).toBe(200);
        expect(verifyEmailVerificationToken(res._body.verificationToken, 'user@example.com')).toBe(true);
        expect(verifyEmailVerificationToken(res._body.verificationToken, 'other@example.com')).toBe(false);
        expect(attemptOtp).toHaveBeenCalledWith('user@example.com', '123456', res._body.verificationToken, expect.any(Number), 5);
    });

    test('requires the signed OTP proof before creating a password account', async () => {
        const collection = { findOne: jest.fn().mockResolvedValue(null), insertOne: jest.fn().mockResolvedValue({ acknowledged: true }) };
        connectToDatabase.mockResolvedValue({ collection: jest.fn(() => collection) });

        const denied = mockRes();
        await customerAuth(mockReq({ action: 'register', username: 'new-user', password: 'password', email: 'user@example.com' }), denied);
        expect(denied._statusCode).toBe(401);
        expect(collection.insertOne).not.toHaveBeenCalled();

        consumeOtpVerification.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const verificationToken = createEmailVerificationToken('user@example.com');
        const accepted = mockRes();
        await customerAuth(mockReq({
            action: 'register',
            username: 'new-user',
            password: 'password',
            email: 'user@example.com',
            otpVerificationToken: verificationToken
        }), accepted);
        expect(accepted._statusCode).toBe(200);
        expect(collection.insertOne).toHaveBeenCalledWith(expect.objectContaining({ email: 'user@example.com' }));

        const replayed = mockRes();
        await customerAuth(mockReq({
            action: 'register',
            username: 'second-user',
            password: 'password',
            email: 'user@example.com',
            otpVerificationToken: verificationToken
        }), replayed);
        expect(replayed._statusCode).toBe(401);
        expect(collection.insertOne).toHaveBeenCalledTimes(1);
    });

    test('the registration page times out OTP requests and always clears the timer', () => {
        const source = require('fs').readFileSync(require('path').join(__dirname, '../../index.html'), 'utf8');
        expect(source).toContain("setTimeout(() => controller.abort(), 20000)");
        expect(source).toMatch(/finally\s*{\s*clearTimeout\(timeout\)/);
        expect(source).toContain('otpVerificationToken');
        expect(source).toContain('if (!otpVerificationToken)');
        expect(source).toContain('cancelOtpRequest()');
    });
});
