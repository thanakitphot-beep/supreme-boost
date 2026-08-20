// OMEGA-JARVIS v3.0.0 — Health & Metrics Endpoint
// GET /api/v1/health  → system health status
// GET /metrics        → detailed performance metrics

const { semanticCache } = require('../../services/cache');
const { getRateLimiterStats } = require('../../services/rateLimit');
const { setCorsHeaders } = require('../../services/cors');
const router = require('../../services/ai/router');
const { connectToDatabase } = require('../_mongodb');

const startTime = Date.now();
const requestCounter = { total: 0, success: 0, error: 0, cached: 0 };
const agentStats = { planner: 0, executor: 0, reviewer: 0, memory: 0, vision: 0 };

// Export counters so other modules can increment them
module.exports.requestCounter = requestCounter;
module.exports.agentStats = agentStats;

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

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = req.url || '';
    const uptime = getUptime();
    const cacheStats = semanticCache.stats();
    const rateLimiterStats = getRateLimiterStats ? getRateLimiterStats() : {};

    // --- GET /health ---
    if (url.includes('/health') && req.method === 'GET') {
        const runtime = router.runtimeStatus();
        const tenantRequired = process.env.REQUIRE_TENANT_API_KEY === 'true' || process.env.NODE_ENV === 'production';
        const mongo = tenantRequired ? await connectToDatabase() : null;
        const checks = {
            server: 'ok',
            primary_provider: runtime.primaryConfigured ? 'ok' : 'missing',
            fallback_provider: runtime.fallbackConfigured ? 'ok' : 'missing',
            mongo: tenantRequired ? (mongo ? 'ok' : 'missing') : 'optional',
            supabase: process.env.SUPABASE_URL && process.env.SUPABASE_KEY ? 'ok' : 'optional',
            cache:       cacheStats.size <= 100        ? 'ok' : 'warn',
            keep_alive:  process.env.RENDER_EXTERNAL_URL ? 'active' : 'disabled'
        };
        const allOk = checks.server === 'ok' && (runtime.primaryConfigured || runtime.fallbackConfigured) && (!tenantRequired || Boolean(mongo));

        return res.status(allOk ? 200 : 206).json({
            status: allOk ? 'healthy' : 'degraded',
            version: '3.1.0',
            project: 'INDICATOR',
            timestamp: new Date().toISOString(),
            uptime: uptime.formatted,
            uptime_ms: uptime.ms,
            checks,
            runtime: { primary: runtime.primary, fallback: runtime.fallback, circuits: runtime.circuits }
        });
    }

    // --- GET /metrics ---
    if (url.includes('/metrics') && req.method === 'GET') {
        const hitRate = requestCounter.total > 0
            ? ((requestCounter.cached / requestCounter.total) * 100).toFixed(1)
            : '0.0';

        return res.status(200).json({
            project: 'OMEGA-JARVIS',
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            uptime: uptime,
            requests: {
                total: requestCounter.total,
                success: requestCounter.success,
                error: requestCounter.error,
                cached: requestCounter.cached,
                cache_hit_rate_pct: parseFloat(hitRate)
            },
            agents: agentStats,
            cache: {
                size: cacheStats.size,
                max_size: 100,
                usage_pct: Math.round((cacheStats.size / 100) * 100)
            },
            memory: getMemoryUsage(),
            rate_limiter: rateLimiterStats,
            runtime: router.runtimeStatus(),
            ai_keys: {
                gemini_keys_configured: [
                    process.env.GEMINI_API_KEY,
                    process.env.GEMINI_API_KEY_2,
                    process.env.GEMINI_API_KEY_3,
                    process.env.GEMINI_API_KEY_4,
                    process.env.GEMINI_API_KEY_5
                ].filter(Boolean).length,
                groq: !!process.env.GROQ_API_KEY,
                cohere: !!process.env.COHERE_API_KEY
            },
            targets: {
                api_latency_ms_target: 800,
                target_fps: 60,
                uptime_target_pct: 99.99
            }
        });
    }

    return res.status(404).json({ error: 'Not found. Use /api/v1/health or /metrics' });
};
