const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');

const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

function jwtSecret() {
    return String(process.env.JWT_SECRET || '').trim();
}

function adminPassword() {
    return String(process.env.ADMIN_PASSWORD || '').trim();
}

function authConfigured() {
    return Boolean(jwtSecret() && adminPassword());
}

function secretsMatch(left, right) {
    const actual = Buffer.from(String(left || ''));
    const expected = Buffer.from(String(right || ''));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function signToken(payload) {
    const secret = jwtSecret();
    if (!secret) return null;
    return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRY, algorithm: 'HS256' });
}

function signRefreshToken(payload) {
    const secret = jwtSecret();
    if (!secret) return null;
    return jwt.sign({ ...payload, type: 'refresh' }, secret, { expiresIn: REFRESH_EXPIRY, algorithm: 'HS256' });
}

function verifyJWT(token) {
    const secret = jwtSecret();
    if (!secret || !token) return null;
    try {
        return jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch (_) {
        return null;
    }
}

function verifyAccessJWT(token) {
    const decoded = verifyJWT(token);
    return decoded && decoded.role && decoded.type !== 'refresh' ? decoded : null;
}

function verifyLegacyToken(token) {
    if (process.env.ENABLE_LEGACY_HMAC_AUTH !== 'true') return false;
    const secret = adminPassword();
    if (!secret || !token) return false;
    const parts = String(token).split('.');
    if (parts.length !== 2) return false;

    const timestamp = Number.parseInt(parts[0], 10);
    const now = Date.now();
    if (!Number.isFinite(timestamp) || timestamp > now + 60_000 || now - timestamp > 24 * 60 * 60 * 1000) return false;

    const expected = crypto.createHmac('sha256', secret).update(String(timestamp)).digest('hex');
    return secretsMatch(parts[1], expected);
}

function verifyToken(token) {
    return Boolean(verifyAccessJWT(token)) || verifyLegacyToken(token);
}

function decodeToken(token) {
    if (!token) return null;
    try { return jwt.decode(token); } catch (_) { return null; }
}

function unauthorizedOrigin(res) {
    return res.status(403).json({ success: false, message: 'Origin is not allowed' });
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return unauthorizedOrigin(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!await checkRateLimit(req, res, 'auth')) return;
    if (!authConfigured()) return res.status(503).json({ success: false, message: 'Authentication is not configured' });

    if (req.method === 'POST') {
        const body = req.body || {};
        const { password, refreshToken, action } = body;

        if (action === 'refresh' && refreshToken) {
            const decoded = verifyJWT(refreshToken);
            if (!decoded || decoded.type !== 'refresh' || !decoded.role) {
                return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
            }
            const payload = { role: decoded.role, sub: decoded.sub };
            return res.status(200).json({
                success: true,
                token: signToken(payload),
                refreshToken: signRefreshToken(payload),
                expiresIn: JWT_EXPIRY
            });
        }

        if (secretsMatch(password, adminPassword())) {
            const payload = { role: 'admin', sub: 'admin' };
            return res.status(200).json({
                success: true,
                token: signToken(payload),
                refreshToken: signRefreshToken(payload),
                expiresIn: JWT_EXPIRY,
                role: 'admin',
                project: 'OMEGA-JARVIS',
                version: '3.0.0'
            });
        }
        return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง (Invalid password)' });
    }

    if (req.method === 'GET') {
        const header = String(req.headers.authorization || '');
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
        if (!token) return res.status(401).json({ success: false, valid: false, message: 'No token provided' });

        const decoded = verifyAccessJWT(token);
        if (decoded) {
            return res.status(200).json({
                success: true,
                valid: true,
                role: decoded.role,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
            });
        }
        if (verifyLegacyToken(token)) return res.status(200).json({ success: true, valid: true, role: 'admin', legacy: true });
        return res.status(401).json({ success: false, valid: false, message: 'Token หมดอายุ หรือไม่ถูกต้อง' });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
};

module.exports.authConfigured = authConfigured;
module.exports.signToken = signToken;
module.exports.verifyAccessJWT = verifyAccessJWT;
module.exports.verifyJWT = verifyJWT;
module.exports.verifyToken = verifyToken;
module.exports.decodeToken = decodeToken;
