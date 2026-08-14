const crypto = require('crypto');
const { connectToDatabase } = require('./_mongodb.js');
const { setCorsHeaders } = require('../services/cors');

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
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") return res.status(200).end();

    const db = await connectToDatabase();
    if (!db) return res.status(500).json({ error: "Database not configured" });

    const tenant = await authenticateTenant(req, db);
    if (!tenant) {
        return res.status(401).json({ error: "Unauthorized" });
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
                        created_at: tenant.created_at
                    }
                });
            }
            if (action === 'knowledge') {
                const data = await db.collection('knowledge_chunks').find({ tenant_id: tenant.id }).sort({ created_at: -1 }).toArray();
                return res.status(200).json({ data: data || [] });
            }
            if (action === 'logs') {
                const data = await db.collection('logs').find({ type: 'chat', 'metadata.tenantId': tenant.id }).sort({ timestamp: -1 }).limit(100).toArray();
                return res.status(200).json({ logs: data || [] });
            }
        }

        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            if (action === 'save_settings') {
                const payload = {};
                if (body.system_model !== undefined) payload.system_model = body.system_model;
                if (body.system_prompt !== undefined) payload.system_prompt = body.system_prompt;
                if (body.theme_color !== undefined) payload.theme_color = body.theme_color;
                if (body.temperature !== undefined) payload.temperature = body.temperature;
                payload.updated_at = new Date().toISOString();
                
                await db.collection('settings').updateOne({ id: tenant.id }, { $set: payload }, { upsert: true });
                return res.status(200).json({ success: true });
            }

            if (action === 'add_knowledge') {
                if (!body.text && !body.url) return res.status(400).json({ error: "No content provided" });
                const newId = crypto.randomUUID();
                
                // If it's a URL, we'd ideally trigger crawl.js, but since this is direct API, 
                // we'll just save it as a text chunk for simplicity unless we implement full scrape here.
                const chunk = {
                    id: newId,
                    tenant_id: tenant.id,
                    type: body.url ? 'url' : 'text',
                    source: body.url || 'Manual Entry',
                    content: body.text || `Reference: ${body.url}`,
                    created_at: new Date().toISOString()
                };
                await db.collection('knowledge_chunks').insertOne(chunk);
                return res.status(200).json({ success: true, chunk });
            }

            if (action === 'delete_knowledge') {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Knowledge ID required' });
                // Ensure the tenant owns this knowledge
                const existing = await db.collection('knowledge_chunks').findOne({ id, tenant_id: tenant.id });
                if (!existing) return res.status(403).json({ error: 'Forbidden or not found' });
                
                await db.collection('knowledge_chunks').deleteOne({ id });
                return res.status(200).json({ success: true });
            }
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (err) {
        console.error("Tenant API error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
