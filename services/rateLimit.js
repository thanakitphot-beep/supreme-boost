// OMEGA-JARVIS v3.0.0 — Rate Limiter Service
// Sliding window algorithm — per IP and per API Key
// Supports in-memory (serverless) mode by default

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);   // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10); // per window
const CHAT_MAX = parseInt(process.env.RATE_LIMIT_CHAT_MAX || '30', 10);          // stricter for chat
const AUTH_MAX = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '10', 10);          // login and OTP
const BURST_MAX = parseInt(process.env.RATE_LIMIT_BURST || '10', 10);            // max burst per 5s

// In-memory store for Token Bucket: { key → { tokens, lastRefill, burstTokens, lastBurstRefill, violations } }
const store = new Map();
const blocklist = new Map(); // key -> unblockTime

// Cleanup every 10 minutes — remove inactive buckets and expired blocklists.
// unref keeps this maintenance timer from preventing graceful shutdown/tests.
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, unblockTime] of blocklist.entries()) {
        if (now > unblockTime) blocklist.delete(key);
    }
    for (const [key, bucket] of store.entries()) {
        if (now - bucket.lastRefill > WINDOW_MS * 2) {
            store.delete(key);
        }
    }
}, 10 * 60 * 1000);
cleanupTimer.unref?.();

function getBucket(key, limit, burstLimit) {
    const now = Date.now();
    let bucket = store.get(key);
    
    if (!bucket) {
        bucket = {
            tokens: limit,
            lastRefill: now,
            burstTokens: burstLimit,
            lastBurstRefill: now,
            violations: 0
        };
        store.set(key, bucket);
    } else {
        // Refill main tokens based on elapsed time (tokens per millisecond)
        const timePassed = now - bucket.lastRefill;
        const refillRate = limit / WINDOW_MS;
        const newTokens = Math.floor(timePassed * refillRate);
        if (newTokens > 0) {
            bucket.tokens = Math.min(limit, bucket.tokens + newTokens);
            bucket.lastRefill = now;
        }

        // Refill burst tokens (refill over 5 seconds)
        const burstTimePassed = now - bucket.lastBurstRefill;
        const burstRefillRate = burstLimit / 5000;
        const newBurstTokens = Math.floor(burstTimePassed * burstRefillRate);
        if (newBurstTokens > 0) {
            bucket.burstTokens = Math.min(burstLimit, bucket.burstTokens + newBurstTokens);
            bucket.lastBurstRefill = now;
        }
    }
    return bucket;
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
    // Auth payloads are unauthenticated, so an attacker-controlled API key must
    // never create a fresh bucket. Bind login and OTP limits to the client IP.
    const apiKey = routeType === 'auth' ? '' : req.body?.apiKey || req.headers['x-api-key'] || '';
    const identifier = apiKey ? `key:${apiKey}` : `ip:${ip}`;

    // Blocklist check
    const now = Date.now();
    if (blocklist.has(identifier) && now < blocklist.get(identifier)) {
        if (res) {
            const retryAfter = Math.ceil((blocklist.get(identifier) - now) / 1000);
            res.setHeader('Retry-After', retryAfter);
            res.setHeader('X-RateLimit-Remaining', '0');
            res.status(429).json({
                error: 'Too Many Requests — you are temporarily blocked.',
                retryAfter: retryAfter
            });
        }
        return false;
    } else if (blocklist.has(identifier)) {
        blocklist.delete(identifier); // unblock if expired
    }

    const limit = routeType === 'chat' ? CHAT_MAX : routeType === 'auth' ? AUTH_MAX : MAX_REQUESTS;
    const bucket = getBucket(identifier, limit, BURST_MAX);

    // Burst protection (Token bucket approach for bursts)
    if (bucket.burstTokens <= 0) {
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

    // Main window limit
    if (bucket.tokens <= 0) {
        bucket.violations++;
        // Auto-block repeated offenders (5 violations = block)
        if (bucket.violations >= 5) {
            blocklist.set(identifier, now + (WINDOW_MS * 10)); // block for 10x window
            bucket.violations = 0; // reset after block
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

    // Allowed — deduct tokens and set headers
    bucket.tokens--;
    bucket.burstTokens--;
    
    if (res) {
        res.setHeader('X-RateLimit-Limit', String(limit));
        res.setHeader('X-RateLimit-Remaining', String(Math.floor(bucket.tokens)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + WINDOW_MS) / 1000)));
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
        auth_max: AUTH_MAX,
        burst_max: BURST_MAX
    };
}

module.exports = { checkRateLimit, getRateLimiterStats };
