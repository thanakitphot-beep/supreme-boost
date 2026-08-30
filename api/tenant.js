const crypto = require('crypto');
const { connectToDatabase } = require('./_mongodb.js');
const { setCorsHeaders } = require('../services/cors');
const { checkRateLimit } = require('../services/rateLimit');
const { normalizeAllowedOrigins, tenantIsActive } = require('../services/tenantAccess');
const { verifyAccessJWT } = require('./_auth');
const { consumeUsage, entitlementsFor, usageSnapshot } = require('../services/plans');
const { normalizeEmail } = require('../services/email');

const TENANT_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-5.6-terra', 'gpt-5.6-sol', 'llama-3.3-70b-versatile']);
const TENANT_THEMES = new Set(['blue', 'purple', 'green', 'teal', 'orange', 'dark']);

function validRecordId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/u.test(value);
}

function mayAccessTenantAction(tenant, method, action) {
    const checkoutEligibleProfile = tenant && ['active', 'pending'].includes(tenant.status) && method === 'GET' && action === 'profile';
    return tenantIsActive(tenant) || checkoutEligibleProfile;
}

function knowledgeSourceUrl(value, tenant) {
    if (!value) return '';
    try {
        const parsed = new URL(String(value));
        const allowedOrigins = normalizeAllowedOrigins(tenant && tenant.allowed_origins);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowedOrigins.includes(parsed.origin)) return null;
        return `${parsed.origin}${parsed.pathname || '/'}`.slice(0, 500);
    } catch (_) {
        return null;
    }
}

function readCookie(req, name) {
    const source = String(req.headers.cookie || '');
    const part = source.split(';').map(value => value.trim()).find(value => value.startsWith(name + '='));
    if (!part) return '';
    try { return decodeURIComponent(part.slice(name.length + 1)); } catch (_) { return ''; }
}

async function authenticateTenant(req, db) {
    const claims = verifyAccessJWT(readCookie(req, 'tenant_session'));
    if (!claims || claims.role !== 'tenant' || !claims.tenantId) return null;
    return db.collection('tenants').findOne({ id: claims.tenantId });
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === "OPTIONS") return res.status(200).end();
    if (!req._rateLimitChecked && !await checkRateLimit(req, res, 'api')) return;

    const db = await connectToDatabase();
    if (!db) return res.status(503).json({ error: "Database is not configured" });

    const tenant = await authenticateTenant(req, db);
    if (!tenant) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action');
    if (!mayAccessTenantAction(tenant, req.method, action)) {
        return res.status(403).json({ error: 'Tenant account is inactive or expired' });
    }

    try {
        if (req.method === "GET") {
            if (action === 'settings') {
                const settings = await db.collection('settings').findOne({ id: tenant.id });
                return res.status(200).json({ settings: settings || {} });
            }
            if (action === 'profile') {
                const usage = await usageSnapshot(tenant);
                return res.status(200).json({
                    tenant: {
                        id: tenant.id,
                        username: tenant.username,
                        company_name: tenant.company_name,
                        api_key: tenant.api_key,
                        status: tenant.status,
                        package_type: tenant.package_type,
                        expires_at: tenant.expires_at,
                        created_at: tenant.created_at,
                        allowed_origins: Array.isArray(tenant.allowed_origins) ? tenant.allowed_origins : [],
                        entitlements: entitlementsFor(tenant)
                    },
                    usage
                });
            }
            if (action === 'knowledge') {
                const data = await db.collection('knowledge_chunks').find({ tenant_id: tenant.id }).project({ _id: 0, embedding: 0 }).sort({ created_at: -1 }).limit(500).toArray();
                return res.status(200).json({ data: data || [] });
            }
            if (action === 'logs') {
                const data = await db.collection('logs').find({ type: { $in: ['chat', 'chat_completed', 'handoff'] }, 'metadata.tenantId': tenant.id }).sort({ timestamp: -1 }).limit(100).toArray();
                return res.status(200).json({ logs: data || [] });
            }
        }

        if (req.method === "POST") {
            const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};

            if (action === 'save_settings') {
                const payload = {};
                let origins = null;
                if (body.allowed_origins !== undefined) {
                    origins = normalizeAllowedOrigins(body.allowed_origins);
                    if (!origins.length) return res.status(400).json({ error: 'At least one exact HTTPS website origin is required' });
                }
                if (body.system_model !== undefined) {
                    if (!TENANT_MODELS.has(body.system_model)) return res.status(400).json({ error: 'Invalid system model' });
                    payload.system_model = body.system_model;
                }
                if (body.system_prompt !== undefined) {
                    if (typeof body.system_prompt !== 'string') return res.status(400).json({ error: 'Invalid system prompt' });
                    payload.system_prompt = body.system_prompt.replace(/\s+/g, ' ').trim().slice(0, 1200);
                }
                if (body.theme_color !== undefined) {
                    if (!TENANT_THEMES.has(body.theme_color)) return res.status(400).json({ error: 'Invalid theme' });
                    payload.theme_color = body.theme_color;
                }
                if (body.temperature !== undefined) {
                    const temperature = Number(body.temperature);
                    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) return res.status(400).json({ error: 'Invalid temperature' });
                    payload.temperature = temperature;
                }
                if (body.support_email !== undefined) {
                    const rawEmail = typeof body.support_email === 'string' ? body.support_email.trim() : '';
                    const email = normalizeEmail(rawEmail);
                    if (rawEmail && !email) return res.status(400).json({ error: 'Invalid support email' });
                    payload.support_email = email;
                }
                if (body.support_phone !== undefined) {
                    const phone = typeof body.support_phone === 'string' ? body.support_phone.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
                    if (phone && !/^[+\d][\d\s()-]{5,30}$/u.test(phone)) return res.status(400).json({ error: 'Invalid support phone' });
                    payload.support_phone = phone;
                }
                if (body.support_url !== undefined) {
                    const supportUrl = typeof body.support_url === 'string' ? body.support_url.trim().slice(0, 500) : '';
                    if (supportUrl) {
                        try {
                            const parsed = new URL(supportUrl);
                            if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('invalid');
                        } catch (_) { return res.status(400).json({ error: 'Invalid support URL' }); }
                    }
                    payload.support_url = supportUrl;
                }
                payload.updated_at = new Date().toISOString();
                
                await db.collection('settings').updateOne({ id: tenant.id }, { $set: payload }, { upsert: true });
                if (origins) {
                    await db.collection('tenants').updateOne({ id: tenant.id }, { $set: { allowed_origins: origins, updated_at: new Date().toISOString() } });
                }
                return res.status(200).json({ success: true });
            }

            if (action === 'add_knowledge') {
                const content = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 12_000) : '';
                const sourceUrl = knowledgeSourceUrl(typeof body.url === 'string' ? body.url.trim() : '', tenant);
                if (sourceUrl === null) return res.status(400).json({ error: 'Knowledge URL must use a registered HTTPS website origin' });
                if (!content && !sourceUrl) return res.status(400).json({ error: 'Knowledge content cannot be empty' });
                const usage = await consumeUsage(tenant, 'knowledge');
                if (!usage.allowed) return res.status(usage.status || 429).json({ error: usage.reason });
                const newId = crypto.randomUUID();
                
                // If it's a URL, we'd ideally trigger crawl.js, but since this is direct API, 
                // we'll just save it as a text chunk for simplicity unless we implement full scrape here.
                const chunk = {
                    id: newId,
                    tenant_id: tenant.id,
                    type: sourceUrl ? 'url' : 'text',
                    source: sourceUrl || 'Manual Entry',
                    content: content || `Reference: ${sourceUrl}`,
                    created_at: new Date().toISOString()
                };
                await db.collection('knowledge_chunks').insertOne(chunk);
                return res.status(200).json({ success: true, chunk });
            }

            if (action === 'delete_knowledge') {
                const { id } = body;
                if (!validRecordId(id)) return res.status(400).json({ error: 'Valid knowledge ID required' });
                // Ensure the tenant owns this knowledge
                const existing = await db.collection('knowledge_chunks').findOne({ id, tenant_id: tenant.id });
                if (!existing) return res.status(403).json({ error: 'Forbidden or not found' });
                
                await db.collection('knowledge_chunks').deleteOne({ id, tenant_id: tenant.id });
                return res.status(200).json({ success: true });
            }
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (err) {
        console.error("Tenant API error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

module.exports.__knowledgeSourceUrl = knowledgeSourceUrl;
module.exports.__mayAccessTenantAction = mayAccessTenantAction;
