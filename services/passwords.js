'use strict';

const crypto = require('crypto');

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 12;

function timingSafeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function scrypt(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, (error, derivedKey) => {
            if (error) reject(error);
            else resolve(derivedKey);
        });
    });
}

function passwordIsValid(password) {
    return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

async function hashPassword(password, { enforcePolicy = true } = {}) {
    if (typeof password !== 'string' || !password || (enforcePolicy && !passwordIsValid(password))) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const salt = crypto.randomBytes(16);
    const derivedKey = await scrypt(password, salt);
    return `${SCRYPT_PREFIX}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

async function verifyPassword(storedPassword, candidatePassword) {
    if (typeof storedPassword !== 'string' || typeof candidatePassword !== 'string' || !candidatePassword) {
        return { matches: false, needsUpgrade: false };
    }

    const parts = storedPassword.split('$');
    if (parts.length === 3 && parts[0] === SCRYPT_PREFIX) {
        try {
            const derivedKey = await scrypt(candidatePassword, Buffer.from(parts[1], 'base64url'));
            return { matches: timingSafeEqual(parts[2], derivedKey.toString('base64url')), needsUpgrade: false };
        } catch (_) {
            return { matches: false, needsUpgrade: false };
        }
    }

    // Existing tenants can still sign in once. Upgrade their legacy SHA-256 or
    // plaintext record immediately after successful authentication.
    const legacySha256 = crypto.createHash('sha256').update(candidatePassword).digest('hex');
    const matches = timingSafeEqual(storedPassword, legacySha256) || timingSafeEqual(storedPassword, candidatePassword);
    return { matches, needsUpgrade: matches };
}

function generateInitialPassword() {
    return crypto.randomBytes(18).toString('base64url');
}

module.exports = {
    MIN_PASSWORD_LENGTH,
    generateInitialPassword,
    hashPassword,
    passwordIsValid,
    verifyPassword
};
