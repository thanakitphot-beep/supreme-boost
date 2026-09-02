'use strict';

const crypto = require('crypto');

const VERIFICATION_TTL_MS = 5 * 60 * 1000;

function signingSecret() {
    return process.env.OTP_SIGNING_SECRET || process.env.JWT_SECRET || '';
}

function signatureFor(payload) {
    return crypto.createHmac('sha256', signingSecret()).update(`email-verification\n${payload}`).digest('base64url');
}

function createEmailVerificationToken(email) {
    if (!signingSecret()) return '';
    const payload = Buffer.from(JSON.stringify({
        email: String(email || '').trim().toLowerCase(),
        expiresAt: Date.now() + VERIFICATION_TTL_MS,
        nonce: crypto.randomBytes(12).toString('base64url')
    }), 'utf8').toString('base64url');
    return `${payload}.${signatureFor(payload)}`;
}

function verifyEmailVerificationToken(token, email) {
    if (!signingSecret() || typeof token !== 'string') return false;
    const separator = token.lastIndexOf('.');
    if (separator <= 0) return false;
    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = signatureFor(payload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;

    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return data.email === String(email || '').trim().toLowerCase()
            && Number.isFinite(data.expiresAt)
            && Date.now() <= data.expiresAt;
    } catch (_) {
        return false;
    }
}

module.exports = { createEmailVerificationToken, verifyEmailVerificationToken };
