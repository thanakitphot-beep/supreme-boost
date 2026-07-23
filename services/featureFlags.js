// OMEGA-JARVIS v3.0.0 — Feature Flags Service
// Dynamic feature toggling per environment, tenant, or rollout %

const DEFAULTS = {
    ENABLE_VOICE: false,
    ENABLE_PLUGINS: true,
    ENABLE_VISION: true,
    ENABLE_AUTO_HEAL: false,
    ENABLE_RATE_LIMITING: true,
    ENABLE_LONG_TERM_MEMORY: true,
    ENABLE_AUDIT_LOGGING: true,
    ENABLE_TRACING: true,
    ENABLE_MULTI_AGENT: true,
    ENABLE_SEMANTIC_CACHE: true,
    ENABLE_RAG: true,
    ENABLE_JWT_AUTH: true,
    ENABLE_CSRF_PROTECTION: false,  // disabled for serverless
};

// In-memory overrides (can be hot-loaded from Supabase)
let _overrides = {};
let _tenantOverrides = {};  // { tenantId: { flagName: bool } }

/**
 * Check if a feature flag is enabled
 * @param {string} flagName - e.g. 'ENABLE_VOICE'
 * @param {string} [tenantId] - optional tenant for per-tenant flags
 */
function isEnabled(flagName, tenantId = null) {
    // 1. Tenant-specific override
    if (tenantId && _tenantOverrides[tenantId] && flagName in _tenantOverrides[tenantId]) {
        return _tenantOverrides[tenantId][flagName];
    }
    // 2. Runtime override
    if (flagName in _overrides) return _overrides[flagName];
    // 3. Environment variable
    const envVal = process.env[flagName];
    if (envVal !== undefined) return envVal === 'true' || envVal === '1';
    // 4. Default
    return DEFAULTS[flagName] ?? false;
}

/**
 * Set a runtime feature flag override
 */
function setFlag(flagName, value, tenantId = null) {
    if (tenantId) {
        if (!_tenantOverrides[tenantId]) _tenantOverrides[tenantId] = {};
        _tenantOverrides[tenantId][flagName] = Boolean(value);
    } else {
        _overrides[flagName] = Boolean(value);
    }
}

/**
 * Load feature flags from Supabase (call on startup or refresh)
 */
async function loadFromDB(supabase) {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('feature_flags').select('*');
        if (error || !data) return;
        for (const row of data) {
            if (row.tenant_id) {
                setFlag(row.flag_name, row.enabled, row.tenant_id);
            } else {
                setFlag(row.flag_name, row.enabled);
            }
        }
        console.log(`[FeatureFlags] Loaded ${data.length} flags from database`);
    } catch (e) {
        console.error('[FeatureFlags] Load error:', e.message);
    }
}

/**
 * Get all flags as an object (for admin dashboard)
 */
function getAllFlags(tenantId = null) {
    const result = {};
    for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
        result[key] = isEnabled(key, tenantId);
    }
    return result;
}

module.exports = { isEnabled, setFlag, loadFromDB, getAllFlags, DEFAULTS };
