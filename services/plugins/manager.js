// OMEGA-JARVIS v3.0.0 — Plugin System Manager
// Secure static plugin registry (new Function() RCE removed — Phase 1 security fix)
// Dynamic code execution from DB is no longer supported. Plugins must be registered
// at startup via registerPlugin() with a pre-approved handler function.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

// In-memory plugin registry
const _registry = new Map();
const _permissionModel = {
    read:    'Can read data from the application',
    write:   'Can write data to the application',
    network: 'Can make external HTTP requests',
    dom:     'Can manipulate the DOM',
    admin:   'Can perform admin operations (restricted)'
};

/**
 * Validate plugin permissions against allowed set
 */
function validatePermissions(requestedPerms, allowedPerms = ['read', 'write']) {
    if (!requestedPerms || typeof requestedPerms !== 'object') return { valid: true, denied: [] };
    const denied = [];
    for (const perm of Object.keys(requestedPerms)) {
        if (requestedPerms[perm] === true && !allowedPerms.includes(perm)) {
            denied.push(perm);
        }
    }
    return { valid: denied.length === 0, denied };
}

/**
 * Register a plugin in memory
 */
function registerPlugin(plugin) {
    if (!plugin || !plugin.name) throw new Error('Plugin must have a name');
    _registry.set(plugin.name, {
        ...plugin,
        loadedAt: new Date().toISOString()
    });
    console.log(`[Plugins] Registered: ${plugin.name} v${plugin.version || '1.0.0'}`);
}

/**
 * Get a registered plugin by name
 */
function getPlugin(name) {
    return _registry.get(name) || null;
}

/**
 * List all registered plugins
 */
function listPlugins() {
    return [..._registry.values()];
}

/**
 * Load plugins from Supabase database
 */
async function loadPluginsFromDB(tenantId = null) {
    if (!supabase) return [];
    try {
        let q = supabase.from('plugins').select('*').eq('enabled', true);
        if (tenantId) q = q.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
        const { data, error } = await q.order('created_at');
        if (error) throw error;

        const loaded = [];
        for (const plugin of (data || [])) {
            try {
                const permCheck = validatePermissions(plugin.permissions, ['read', 'write', 'dom']);
                if (!permCheck.valid) {
                    console.warn(`[Plugins] ${plugin.name} denied permissions: ${permCheck.denied.join(', ')}`);
                    continue;
                }
                registerPlugin({
                    id: plugin.id,
                    name: plugin.name,
                    version: plugin.version,
                    permissions: plugin.permissions,
                    code: plugin.code,
                    tenantId: plugin.tenant_id
                });
                loaded.push(plugin.name);
            } catch (e) {
                console.error(`[Plugins] Failed to load ${plugin.name}:`, e.message);
            }
        }
        console.log(`[Plugins] Loaded ${loaded.length} plugins from database`);
        return loaded;
    } catch (e) {
        console.error('[Plugins] DB load error:', e.message);
        return [];
    }
}

/**
 * Execute a plugin hook safely.
 * SECURITY FIX: Removed new Function() dynamic code execution (RCE risk).
 * Plugins must now register pre-approved handler functions at startup.
 * DB-stored 'code' strings are intentionally ignored.
 */
async function executePlugin(name, hook, context = {}) {
    const plugin = getPlugin(name);
    if (!plugin) throw new Error(`Plugin not found: ${name}`);

    // Check for a registered static handler (the only safe execution path)
    if (typeof plugin.handlers?.[hook] === 'function') {
        try {
            return await Promise.resolve(plugin.handlers[hook](context));
        } catch (e) {
            console.error(`[Plugins] Execute error in ${name}.${hook}:`, e.message);
            return null;
        }
    }

    // If the plugin only has DB 'code', refuse to execute it
    if (plugin.code) {
        console.warn(`[Plugins] BLOCKED: Plugin '${name}' tried to run DB-stored code. Register a static handler instead.`);
        return null;
    }

    console.warn(`[Plugins] No handler registered for ${name}.${hook}`);
    return null;
}

module.exports = {
    registerPlugin,
    getPlugin,
    listPlugins,
    loadPluginsFromDB,
    executePlugin,
    validatePermissions,
    permissionModel: _permissionModel
};
