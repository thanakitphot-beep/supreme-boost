// OMEGA-JARVIS v3.0.0 — Health & Metrics Endpoint
// GET /api/v1/health  → system health status
// GET /metrics        → detailed performance metrics

const { semanticCache } = require('../../services/cache');
const { getRateLimiterStats } = require('../../services/rateLimit');
const { setCorsHeaders } = require('../../services/cors');
const router = require('../../services/ai/router');
const { databaseIsReady } = require('../_mongodb');
const { verifyAccessJWT, accessTokenFromRequest } = require('../_auth');
const { validateProductionConfig } = require('../../services/productionConfig');
const { criticalIndexesAreReady, mongoSupportsTransactions } = require('../../services/mongoIndexes');
const { connectToDatabase } = require('../_mongodb');
const { releaseInfo } = require('../../services/release');

let indexReadiness = { checkedAt: 0, ready: false };
let topologyReadiness = { checkedAt: 0, ready: false };
let draining = false;

async function indexesAreReady() {
    if (Date.now() - indexReadiness.checkedAt < 60_000) return indexReadiness.ready;
    const db = await connectToDatabase();
    const ready = Boolean(db && await criticalIndexesAreReady(db).catch(() => false));
    indexReadiness = { checkedAt: Date.now(), ready };
    return ready;
}

async function transactionsAreReady() {
    if (Date.now() - topologyReadiness.checkedAt < 60_000) return topologyReadiness.ready;
    const db = await connectToDatabase();
    const ready = Boolean(db && await mongoSupportsTransactions(db).catch(() => false));
    topologyReadiness = { checkedAt: Date.now(), ready };
    return ready;
}

function operationsAuthorized(req) {
    const token = accessTokenFromRequest(req);
    const claims = verifyAccessJWT(token);
    if (claims && claims.role === 'admin') return true;
    return Boolean(process.env.METRICS_TOKEN && token === process.env.METRICS_TOKEN);
}

const startTime = Date.now();
const requestCounter = { total: 0, success: 0, error: 0 };

function getMemoryUsage() {
    try {
        const mem = process.memoryUsage();
        return {
            rss_mb: Math.round(mem.rss / 1024 / 1024),
            heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
            heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
            external_mb: Math.round(mem.external / 1024 / 1024)
        };
    } catch {
        return null;
    }
}

function getUptime() {
    const ms = Date.now() - startTime;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    return {
        ms,
        formatted: `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`
    };
}

async function readinessStatus() {
    const production = process.env.NODE_ENV === 'production';
    const mongo = production ? await databaseIsReady() : true;
    const indexes = production && mongo ? await indexesAreReady() : !production;
    const transactions = production && mongo ? await transactionsAreReady() : !production;
    const configuration = production ? validateProductionConfig() : { ok: true, modes: {} };
    const allOk = Boolean(!draining && mongo && indexes && transactions && configuration.ok);
    return {
        ok: allOk,
        status: allOk ? 'ready' : 'not_ready',
        checks: {
            server: draining ? 'draining' : 'ok',
            mongo: mongo ? 'ok' : 'unavailable',
            indexes: indexes ? 'ok' : 'missing',
            transactions: transactions ? 'ok' : 'unsupported',
            configuration: configuration.ok ? 'ok' : 'invalid'
        },
        modes: configuration.modes || {}
    };
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = req.url || '';
    const uptime = getUptime();
    const cacheStats = semanticCache.stats();
    const rateLimiterStats = getRateLimiterStats ? getRateLimiterStats() : {};

    if (url.includes('/livez') && req.method === 'GET') {
        return res.status(200).json({ status: 'live', uptime: uptime.formatted, release: releaseInfo() });
    }

    if (url.includes('/readyz') && req.method === 'GET') {
        const readiness = await readinessStatus();
        return res.status(readiness.ok ? 200 : 503).json({ ...readiness, release: releaseInfo() });
    }

    // Detailed dependency and provider state is operational data, not a
    // public probe response.
    if (url.includes('/health') && req.method === 'GET') {
        const release = releaseInfo();
        if (!operationsAuthorized(req)) {
            const readiness = await readinessStatus();
            return res.status(readiness.ok ? 200 : 503).json({ status: readiness.ok ? 'healthy' : 'degraded', project: 'INDICATOR', version: release.version, release });
        }
        const runtime = router.runtimeStatus();
        const readiness = await readinessStatus();
        const checks = {
            ...readiness.checks,
            primary_provider: runtime.primaryConfigured ? 'ok' : 'missing',
            fallback_provider: runtime.fallbackConfigured ? 'ok' : 'missing',
            supabase: process.env.SUPABASE_URL && process.env.SUPABASE_KEY ? 'ok' : 'optional',
            cache:       cacheStats.size <= 100        ? 'ok' : 'warn'
        };

        return res.status(readiness.ok ? 200 : 503).json({
            status: readiness.ok ? 'healthy' : 'degraded',
            project: 'INDICATOR',
            version: release.version,
            release,
            timestamp: new Date().toISOString(),
            uptime: uptime.formatted,
            uptime_ms: uptime.ms,
            checks,
            modes: readiness.modes,
            runtime: { primary: runtime.primary, fallback: runtime.fallback, circuits: runtime.circuits }
        });
    }

    // --- GET /metrics ---
    if (url.includes('/metrics') && req.method === 'GET') {
        if (!operationsAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
        return res.status(200).json({
            project: 'INDICATOR',
            release: releaseInfo(),
            timestamp: new Date().toISOString(),
            uptime: uptime,
            scope: 'process',
            requests: {
                total: requestCounter.total,
                success: requestCounter.success,
                error: requestCounter.error
            },
            cache: {
                size: cacheStats.size,
                max_size: 100,
                usage_pct: Math.round((cacheStats.size / 100) * 100)
            },
            memory: getMemoryUsage(),
            rate_limiter: rateLimiterStats,
            runtime: router.runtimeStatus()
        });
    }

    return res.status(404).json({ error: 'Not found. Use /api/v1/livez, /api/v1/readyz, or /metrics' });
};

module.exports.requestCounter = requestCounter;
module.exports.__operationsAuthorized = operationsAuthorized;
module.exports.__readinessStatus = readinessStatus;
module.exports.setDraining = value => { draining = Boolean(value); };
