'use strict';

const crypto = require('crypto');
const { connectToDatabase } = require('../api/_mongodb');
const { incrementBoundedCounter } = require('./mongoCounter');

const store = new Map();

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function limitsFor(routeType) {
    const standard = positiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 100);
    if (routeType === 'chat') return positiveInteger(process.env.RATE_LIMIT_CHAT_MAX, 30);
    if (routeType === 'auth') return positiveInteger(process.env.RATE_LIMIT_AUTH_MAX, 10);
    if (routeType === 'admin') return positiveInteger(process.env.RATE_LIMIT_ADMIN_MAX, 30);
    if (routeType === 'billing') return positiveInteger(process.env.RATE_LIMIT_BILLING_MAX, 20);
    return standard;
}

function windowMs() {
    return positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
}

function requestIp(req) {
    const trustedProxy = process.env.TRUST_PROXY_HEADERS === 'true';
    const forwarded = trustedProxy ? String(req.headers['x-forwarded-for'] || '') : '';
    if (forwarded) {
        const chain = forwarded.split(',').map(value => value.trim()).filter(Boolean);
        const hops = positiveInteger(process.env.TRUSTED_PROXY_HOPS, 1);
        return chain[Math.max(0, chain.length - hops)] || 'unknown';
    }
    if (trustedProxy && req.headers['x-real-ip']) return String(req.headers['x-real-ip']).trim();
    return req.socket && req.socket.remoteAddress || 'unknown';
}

function principalFor(req, override) {
    if (override) return override;
    return `ip:${requestIp(req)}`;
}

function opaqueKey(value) {
    const secret = String(process.env.RATE_LIMIT_SECRET || process.env.JWT_SECRET || 'local-rate-limit');
    return crypto.createHmac('sha256', secret).update(String(value)).digest('base64url');
}

function sendLimited(res, limit, resetAt, status = 429, message = 'Rate limit exceeded. Please try again shortly.') {
    if (!res) return;
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.status(status).json({ error: message, retryAfter, limit });
}

function consumeLocal(key, limit) {
    const now = Date.now();
    const duration = windowMs();
    const start = now - now % duration;
    const id = `${key}:${start}`;
    const count = Number(store.get(id) || 0) + 1;
    store.set(id, count);
    if (store.size > 5000) {
        for (const candidate of store.keys()) {
            const timestamp = Number(candidate.slice(candidate.lastIndexOf(':') + 1));
            if (timestamp + duration <= now) store.delete(candidate);
        }
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: start + duration };
}

async function consumeShared(key, limit) {
    const db = await connectToDatabase();
    if (!db) return null;
    const now = Date.now();
    const duration = windowMs();
    const start = new Date(now - now % duration);
    const resetAt = new Date(start.getTime() + duration);
    const result = await incrementBoundedCounter(
        db.collection('rate_limit_windows'),
        { key, window_start: start },
        'count',
        limit,
        { expires_at: new Date(resetAt.getTime() + duration) }
    );
    return { allowed: result.allowed, remaining: Math.max(0, limit - result.count), resetAt: resetAt.getTime() };
}

async function checkRateLimit(req, res, routeType = 'api', options = {}) {
    const limit = positiveInteger(options.limit, limitsFor(routeType));
    const principal = principalFor(req, options.principal);
    const key = opaqueKey(`${routeType}:${principal}`);
    let result;

    try {
        result = await consumeShared(key, limit);
    } catch (_) {
        result = null;
    }
    if (!result) {
        if (process.env.NODE_ENV === 'production') {
            sendLimited(res, limit, Date.now() + windowMs(), 503, 'Rate limit service is unavailable');
            return false;
        }
        result = consumeLocal(key, limit);
    }

    if (!result.allowed) {
        sendLimited(res, limit, result.resetAt);
        return false;
    }
    if (res) {
        res.setHeader('X-RateLimit-Limit', String(limit));
        res.setHeader('X-RateLimit-Remaining', String(result.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
    }
    return true;
}

function getRateLimiterStats() {
    return { mode: process.env.NODE_ENV === 'production' ? 'mongo-required' : 'mongo-with-local-fallback', local_windows: store.size, window_ms: windowMs() };
}

module.exports = { checkRateLimit, getRateLimiterStats, __opaqueKey: opaqueKey, __requestIp: requestIp };
