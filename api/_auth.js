// OMEGA-JARVIS v3.0.0 — JWT Authentication Service
// Replaces old HMAC timestamp token → proper JWT (HS256)
// Backward compatible: still accepts old tokens during migration

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');

const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET environment variable is not set. Auth will be disabled.');
}
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// ─── JWT Helpers ────────────────────────────────────────────────────────────

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY, algorithm: 'HS256' });
}

function signRefreshToken(payload) {
    return jwt.sign({ ...payload, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY, algorithm: 'HS256' });
}

function verifyJWT(token) {
    try {
        return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        return null;
    }
}

// Legacy token support (HMAC timestamp) for backward compatibility
function verifyLegacyToken(token) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'indicator2026';
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) return false;
    const hmac = crypto.createHmac('sha256', adminPassword);
    hmac.update(String(timestamp));
    return hmac.digest('hex') === signature;
}

/**
 * Verify any token — JWT first, then legacy HMAC
 */
function verifyToken(token) {
    if (!token) return false;
    // Try JWT first
    const decoded = verifyJWT(token);
    if (decoded && decoded.role) return true;
    // NOTE: Hardcoded static bypass token 'ADMIN_SUPREME_TOKEN_12345' has been REMOVED (security fix).
    // Legacy HMAC timestamp token (kept for backward compat with old admin sessions)
    return verifyLegacyToken(token);
}

/**
 * Decode token without throwing — returns payload or null
 */
function decodeToken(token) {
    if (!token) return null;
    try { return jwt.decode(token); } catch { return null; }
}

// ─── CORS Helpers (Now using centralized service) ────────────────────────────

// ─── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!checkRateLimit(req, res, 'auth')) {
        return; // checkRateLimit already sent the 429 response
    }

    const adminPassword = process.env.ADMIN_PASSWORD || 'indicator2026';

    // ── POST /auth → Login ───────────────────────────────────────────────────
    if (req.method === 'POST') {
        const body = req.body || {};
        const { password, refreshToken, action } = body;

        // Token refresh
        if (action === 'refresh' && refreshToken) {
            const decoded = verifyJWT(refreshToken);
            if (!decoded || decoded.type !== 'refresh') {
                return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
            }
            const newPayload = { role: decoded.role, sub: decoded.sub };
            const newToken = signToken(newPayload);
            const newRefresh = signRefreshToken(newPayload);
            return res.status(200).json({ success: true, token: newToken, refreshToken: newRefresh, expiresIn: JWT_EXPIRY });
        }

        // Login with password
        if (password === adminPassword) {
            const payload = { role: 'admin', sub: 'admin', iat: Math.floor(Date.now() / 1000) };
            const token = signToken(payload);
            const refresh = signRefreshToken(payload);
            return res.status(200).json({
                success: true,
                token,
                refreshToken: refresh,
                expiresIn: JWT_EXPIRY,
                role: 'admin',
                project: 'OMEGA-JARVIS',
                version: '3.0.0'
            });
        }

        return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง (Invalid password)' });
    }

    // ── GET /auth → Verify token ─────────────────────────────────────────────
    if (req.method === 'GET') {
        const authHeader = req.headers['authorization'];
        let token = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
        if (!token && req.url) {
            try {
                const params = new URLSearchParams(req.url.split('?')[1] || '');
                token = params.get('token') || '';
            } catch {}
        }

        if (!token) return res.status(401).json({ success: false, valid: false, message: 'No token provided' });

        const decoded = verifyJWT(token);
        if (decoded) {
            return res.status(200).json({
                success: true, valid: true,
                role: decoded.role,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
            });
        }

        // Legacy fallback (HMAC timestamp tokens only)
        if (verifyLegacyToken(token)) {
            return res.status(200).json({ success: true, valid: true, role: 'admin', legacy: true });
        }

        return res.status(401).json({ success: false, valid: false, message: 'Token หมดอายุ หรือไม่ถูกต้อง' });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
};

// Export helpers for other routes
module.exports.verifyToken = verifyToken;
module.exports.verifyJWT = verifyJWT;
module.exports.decodeToken = decodeToken;
module.exports.signToken = signToken;
