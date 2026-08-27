'use strict';

const { connectToDatabase } = require('../api/_mongodb');
const { isOriginAllowed, setCorsHeaders } = require('./cors');
const { entitlementsFor } = require('./plans');

function canonicalOrigin(value) {
    try {
        const url = new URL(String(value || '').trim());
        const localDevelopment = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (!url.hostname || url.hostname.includes('*') || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) return null;
        if (url.protocol === 'https:' || (url.protocol === 'http:' && localDevelopment)) return url.origin;
    } catch (_) { }
    return null;
}

function normalizeAllowedOrigins(values) {
    const input = Array.isArray(values) ? values : String(values || '').split(/[\n,]/);
    return [...new Set(input.map(canonicalOrigin).filter(Boolean))].slice(0, 20);
}

function tenantIsActive(tenant) {
    if (!tenant || tenant.status !== 'active') return false;
    return !tenant.expires_at || new Date(tenant.expires_at).getTime() >= Date.now();
}

function tenantKeyRequired() {
    return process.env.REQUIRE_TENANT_API_KEY === 'true' || process.env.NODE_ENV === 'production';
}

function firstPartyDemoAllowed(origin) {
    if (process.env.INDICATOR_ALLOW_FIRST_PARTY_DEMO === 'false') return false;
    const serviceOrigin = canonicalOrigin(process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_URL);
    return Boolean(serviceOrigin && canonicalOrigin(origin) === serviceOrigin);
}

async function findActiveTenantForOrigin(origin) {
    const canonical = canonicalOrigin(origin);
    if (!canonical) return null;
    const db = await connectToDatabase();
    if (!db) return null;
    const candidates = await db.collection('tenants').find({ allowed_origins: canonical }).toArray();
    return candidates.find(tenantIsActive) || null;
}

async function applyPluginCors(req, res) {
    if (setCorsHeaders(req, res)) return true;
    const origin = canonicalOrigin(req.headers.origin);
    if (!origin || !await findActiveTenantForOrigin(origin)) return false;
    return setCorsHeaders(req, res, [origin]);
}

async function authorizePluginRequest({ apiKey, origin }) {
    const key = String(apiKey || '').trim();
    const demoAllowed = firstPartyDemoAllowed(origin);
    if (key === 'INDICATOR_TEST' && process.env.NODE_ENV !== 'production') {
        const tenant = { id: 'test', status: 'active', package_type: 'starter', allowed_origins: [] };
        return { tenant: { ...tenant, entitlements: entitlementsFor(tenant) } };
    }
    if (!key) return demoAllowed ? { tenant: { id: 'demo', status: 'active', allowed_origins: [] } } : tenantKeyRequired() ? { error: 'Missing widget API key' } : { tenant: null };

    const db = await connectToDatabase();
    if (!db) return { error: 'Tenant service is unavailable' };
    const tenant = await db.collection('tenants').findOne({ api_key: key });
    if (!tenant) return demoAllowed ? { tenant: { id: 'demo', status: 'active', allowed_origins: [] } } : { error: 'Unknown widget API key' };
    if (!tenantIsActive(tenant)) return { error: tenant.status === 'suspended' ? 'บัญชีถูกระงับการใช้งาน (Suspended)' : 'Package หมดอายุ หรือยังไม่เปิดใช้งาน' };

    const canonical = canonicalOrigin(origin);
    if (tenantKeyRequired() && !canonical) return { error: 'Plugin requests must include a registered browser origin' };
    const serviceOrigin = canonicalOrigin(process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_URL);
    if (canonical && canonical !== serviceOrigin && !normalizeAllowedOrigins(tenant.allowed_origins).includes(canonical)) {
        return { error: 'This website origin is not registered for the tenant' };
    }
    return { tenant: { ...tenant, entitlements: entitlementsFor(tenant) } };
}

module.exports = {
    applyPluginCors,
    authorizePluginRequest,
    canonicalOrigin,
    firstPartyDemoAllowed,
    normalizeAllowedOrigins,
    tenantIsActive
};
