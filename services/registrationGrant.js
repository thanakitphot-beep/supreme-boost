'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'indicator_registration_grant';
const TTL_MS = 10 * 60 * 1000;

function signingSecret() {
    return String(process.env.OTP_SIGNING_SECRET || process.env.JWT_SECRET || '').trim();
}

function sign(email, expiresAt, nonce) {
    return crypto.createHmac('sha256', signingSecret()).update(`${email}\n${expiresAt}\n${nonce}`).digest('base64url');
}

function readCookie(req, name) {
    const prefix = `${name}=`;
    const entry = String(req && req.headers && req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    if (!entry) return '';
    try { return decodeURIComponent(entry.slice(prefix.length)); } catch (_) { return ''; }
}

function secureAttribute() {
    return process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

function appendCookie(res, cookie) {
    const current = typeof res.getHeader === 'function'
        ? res.getHeader('Set-Cookie')
        : res._headers && (res._headers['Set-Cookie'] || res._headers['set-cookie']);
    const values = current ? (Array.isArray(current) ? current : [current]) : [];
    res.setHeader('Set-Cookie', [...values, cookie]);
}

function issueRegistrationGrant(res, email) {
    if (!signingSecret()) return null;
    const expiresAt = Date.now() + TTL_MS;
    const nonce = crypto.randomBytes(18).toString('base64url');
    const value = `${Buffer.from(String(email), 'utf8').toString('base64url')}.${expiresAt}.${nonce}.${sign(email, expiresAt, nonce)}`;
    appendCookie(res, `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/api/customer-auth; Max-Age=600${secureAttribute()}`);
    return { nonce, expiresAt };
}

function readRegistrationGrant(req, email) {
    if (!signingSecret()) return null;
    const parts = readCookie(req, COOKIE_NAME).split('.');
    if (parts.length !== 4) return null;
    const [encodedEmail, expiresAtText, nonce, signature] = parts;
    const expiresAt = Number(expiresAtText);
    if (!nonce || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
    let grantEmail = '';
    try { grantEmail = Buffer.from(encodedEmail, 'base64url').toString('utf8'); } catch (_) { return null; }
    if (grantEmail !== email) return null;
    const expected = Buffer.from(sign(email, expiresAt, nonce));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    return { nonce, expiresAt };
}

function clearRegistrationGrant(res) {
    appendCookie(res, `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/api/customer-auth; Max-Age=0${secureAttribute()}`);
}

module.exports = { appendCookie, clearRegistrationGrant, issueRegistrationGrant, readRegistrationGrant };
