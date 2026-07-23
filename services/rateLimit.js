// OMEGA-JARVIS v3.0.0 — Rate Limiter Service
// Sliding window algorithm — per IP and per API Key
// Supports in-memory (serverless) mode by default

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);   // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10); // per window
const CHAT_MAX = parseInt(process.env.RATE_LIMIT_CHAT_MAX || '30', 10);          // stricter for chat
const BURST_MAX = parseInt(process.env.RATE_LIMIT_BURST || '10', 10);            // max burst per 5s

// In-memory store: { key → [timestamps] }
const store = new Map();
const blocklist = new Set();

// Cleanup every 5 minutes — remove expired windows
setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, timestamps] of store.entries()) {
        const fresh = timestamps.filter(t => t > cutoff);
        if (fresh.length === 0) store.delete(key);
        else store.set(key, fresh);
    }
}, 5 * 60 * 1000);

/**
 * Get the number of requests in the current window for a key
 */
function getCount(key) {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const timestamps = (store.get(key) || []).filter(t => t > cutoff);
    store.set(key, timestamps);
    return timestamps.length;
}

/**
 * Record a new request for a key
 */
function increment(key) {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const timestamps = (store.get(key) || []).filter(t => t > cutoff);
    timestamps.push(now);
    store.set(key, timestamps);
    return timestamps.length;
}

/**
 * Get burst count (last 5 seconds)
 */
function getBurstCount(key) {
    const now = Date.now();
    const burstCutoff = now - 5000;
    const timestamps = store.get(key) || [];
    return timestamps.filter(t => t > burstCutoff).length;
}

/**
 * Main rate limit middleware
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response wrapper
 * @param {string} routeType - 'chat' | 'api' | 'admin'
 * @returns {boolean} - true if allowed, false if rate limited
 */
function checkRateLimit(req, res, routeType = 'api') {
    // Extract identifier: API key > IP
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
        .split(',')[0].trim();
    const apiKey = req.body?.apiKey || req.headers['x-api-key'] || '';
    const identifier = apiKey ? `key:${apiKey}` : `ip:${ip}`;

    // Blocklist check
    if (blocklist.has(identifier)) {
        if (res) {
            res.setHeader('Retry-After', Math.ceil(WINDOW_MS / 1000));
            res.setHeader('X-RateLimit-Remaining', '0');
            res.status(429).json({
                error: 'Too Many Requests — you are temporarily blocked.',
                retryAfter: Math.ceil(WINDOW_MS / 1000)
            });
        }
        return false;
    }

    const limit = routeType === 'chat' ? CHAT_MAX : MAX_REQUESTS;
    const count = getCount(identifier);
    const burstCount = getBurstCount(identifier);

    // Burst protection
    if (burstCount > BURST_MAX) {
        if (res) {
            res.setHeader('Retry-After', '5');
            res.setHeader('X-RateLimit-Limit', String(limit));
            res.setHeader('X-RateLimit-Remaining', '0');
            res.status(429).json({
                error: 'Burst limit exceeded. Please slow down.',
                retryAfter: 5
            });
        }
        return false;
    }

    // Window limit
    if (count >= limit) {
        // Auto-block repeated offenders (5x over limit)
        if (count >= limit * 5) {
            blocklist.add(identifier);
            setTimeout(() => blocklist.delete(identifier), WINDOW_MS * 10);
        }
        if (res) {
            res.setHeader('Retry-After', Math.ceil(WINDOW_MS / 1000));
            res.setHeader('X-RateLimit-Limit', String(limit));
            res.setHeader('X-RateLimit-Remaining', '0');
            res.status(429).json({
                error: 'Rate limit exceeded. Too many requests.',
                retryAfter: Math.ceil(WINDOW_MS / 1000),
                limit,
                window_ms: WINDOW_MS
            });
        }
        return false;
    }

    // Allowed — record and set headers
    const newCount = increment(identifier);
    if (res) {
        res.setHeader('X-RateLimit-Limit', String(limit));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - newCount)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil((Date.now() + WINDOW_MS) / 1000)));
    }
    return true;
}

/**
 * Get aggregate stats for /metrics endpoint
 */
function getRateLimiterStats() {
    return {
        tracked_identifiers: store.size,
        blocklisted: blocklist.size,
        window_ms: WINDOW_MS,
        max_requests: MAX_REQUESTS,
        chat_max: CHAT_MAX,
        burst_max: BURST_MAX
    };
}

module.exports = { checkRateLimit, getRateLimiterStats };
