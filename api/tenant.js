const { connectToDatabase } = require('./_mongodb.js');
const { setCorsHeaders } = require('../services/cors');
const { checkRateLimit } = require('../services/rateLimit');
const { normalizeAllowedOrigins, tenantIsActive } = require('../services/tenantAccess');
const knowledgeStore = require('./_db');
const { cleanSource, digest, storeSource } = require('../services/knowledgeIngestion');

// Very basic authentication: For tenants, they pass `Bearer api_key_here`
// In a real app we'd use JWT, but since they have their api_key in localStorage, we verify that.
async function authenticateTenant(req, db) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const apiKey = authHeader.split(' ')[1];
    
    if (!apiKey) return null;
    const tenant = await db.collection('tenants').findOne({ api_key: apiKey });
    return tenant;
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === "OPTIONS") return res.status(200).end();
    if (!req._rateLimitChecked && !checkRateLimit(req, res, 'api')) return;

    const db = await connectToDatabase();
    if (!db) return res.status(503).json({ error: "Database is not configured" });

    const tenant = await authenticateTenant(req, db);
    if (!tenant) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!tenantIsActive(tenant)) {
        return res.status(403).json({ error: 'Tenant account is inactive or expired' });
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const action = url.searchParams.get('action');

    try {
        if (req.method === "GET") {
            if (action === 'settings') {
                const settings = await db.collection('settings').findOne({ id: tenant.id });
                return res.status(200).json({ settings: settings || {} });
            }
            if (action === 'profile') {
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
                        allowed_origins: Array.isArray(tenant.allowed_origins) ? tenant.allowed_origins : []
                    }
                });
            }
            if (action === 'knowledge') {
                const data = await db.collection('knowledge_chunks').find({ tenant_id: tenant.id }).sort({ created_at: -1 }).toArray();
                return res.status(200).json({ data: data || [] });
            }
            if (action === 'logs') {
                const data = await db.collection('logs').find({ type: { $in: ['chat', 'handoff'] }, 'metadata.tenantId': tenant.id }).sort({ timestamp: -1 }).limit(100).toArray();
                return res.status(200).json({ logs: data || [] });
            }
        }

        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            if (action === 'save_origins') {
                const rawOrigins = Array.isArray(body.allowed_origins)
                    ? body.allowed_origins.join('\n').trim()
                    : String(body.allowed_origins || '').trim();
                const allowedOrigins = normalizeAllowedOrigins(body.allowed_origins);
                if (rawOrigins && !allowedOrigins.length) {
                    return res.status(400).json({ error: 'Add valid HTTPS origins without paths' });
                }
                await db.collection('tenants').updateOne({ id: tenant.id }, { $set: { allowed_origins: allowedOrigins } });
                return res.status(200).json({ success: true, allowed_origins: allowedOrigins });
            }

            if (action === 'save_settings') {
                const payload = {};
                if (body.system_model !== undefined) payload.system_model = body.system_model;
                if (body.system_prompt !== undefined) payload.system_prompt = body.system_prompt;
                if (body.theme_color !== undefined) payload.theme_color = body.theme_color;
                if (body.temperature !== undefined) payload.temperature = body.temperature;
                if (body.support_email !== undefined) payload.support_email = String(body.support_email || '').trim().slice(0, 200);
                if (body.support_phone !== undefined) payload.support_phone = String(body.support_phone || '').trim().slice(0, 40);
                if (body.support_url !== undefined) payload.support_url = String(body.support_url || '').trim().slice(0, 500);
                payload.updated_at = new Date().toISOString();
                
                await db.collection('settings').updateOne({ id: tenant.id }, { $set: payload }, { upsert: true });
                return res.status(200).json({ success: true });
            }

            if (action === 'add_knowledge') {
                if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 60000) return res.status(400).json({ error: 'เพิ่มข้อความต้นฉบับ 1–60,000 ตัวอักษร; URL อย่างเดียวไม่ใช่เนื้อหาเอกสาร' });
                const content = cleanSource(body.text);
                const chunksCount = await storeSource(knowledgeStore, { tenantId: tenant.id, url: 'text:' + digest(content),
                    title: body.title || 'Owner supplied knowledge', content, sourceType: 'tenant_text' });
                return res.status(200).json({ success: true, chunksCount });
            }

            if (action === 'delete_knowledge') {
                const { id } = body;
                if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return res.status(400).json({ error: 'Knowledge ID required' });
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
