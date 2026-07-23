// OMEGA-JARVIS v3.0.0 — Long-Term Memory API
// POST /api/v1/memory   → store memory entry
// GET  /api/v1/memory   → retrieve memories (semantic search)
// DELETE /api/v1/memory → delete memory entry

const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require("../_auth.js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

async function generateEmbedding(text, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } })
    });
    if (!res.ok) throw new Error('Embedding failed: ' + res.status);
    const data = await res.json();
    return data.embedding?.values || null;
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

    const geminiKey = process.env.GEMINI_API_KEY;

    try {
        // ── POST → Store memory ───────────────────────────────────────────────
        if (req.method === 'POST') {
            const body = req.body || {};
            const { tenantId, userId, content, importance, expiresInDays, tags } = body;

            if (!tenantId || !content) {
                return res.status(400).json({ error: 'Missing tenantId or content' });
            }

            const cleanContent = String(content).replace(/\s+/g, ' ').trim().slice(0, 2000);
            let embedding = null;

            // Generate embedding for semantic retrieval
            if (geminiKey) {
                try { embedding = await generateEmbedding(cleanContent, geminiKey); } catch (_) {}
            }

            const expires_at = expiresInDays
                ? new Date(Date.now() + parseInt(expiresInDays) * 86400000).toISOString()
                : null;

            const { data, error } = await supabase.from('memory_entries').insert({
                tenant_id: tenantId,
                user_id: userId || null,
                content: cleanContent,
                embedding: embedding || null,
                importance: Math.min(1, Math.max(0, parseFloat(importance) || 0.5)),
                expires_at,
                tags: tags || null
            }).select().single();

            if (error) throw error;

            return res.status(201).json({ success: true, id: data.id, message: 'Memory stored' });
        }

        // ── GET → Retrieve memories ───────────────────────────────────────────
        if (req.method === 'GET') {
            const params = req.query || {};
            const { tenantId, userId, query, limit = '10', minImportance = '0' } = params;

            if (!tenantId) return res.status(400).json({ error: 'Missing tenantId' });

            // Delete expired memories first
            await supabase.from('memory_entries')
                .delete()
                .eq('tenant_id', tenantId)
                .lt('expires_at', new Date().toISOString())
                .not('expires_at', 'is', null);

            // Semantic search if query provided
            if (query && geminiKey) {
                try {
                    const queryEmbedding = await generateEmbedding(String(query).slice(0, 500), geminiKey);
                    if (queryEmbedding) {
                        const { data, error } = await supabase.rpc('match_memory_entries', {
                            query_embedding: queryEmbedding,
                            match_threshold: 0.4,
                            match_count: parseInt(limit),
                            filter_tenant_id: tenantId
                        });
                        if (!error && data) {
                            return res.status(200).json({ success: true, memories: data, mode: 'semantic' });
                        }
                    }
                } catch (_) {}
            }

            // Fallback: recency-based retrieval
            let q = supabase.from('memory_entries')
                .select('id, tenant_id, user_id, content, importance, expires_at, tags, created_at')
                .eq('tenant_id', tenantId)
                .gte('importance', parseFloat(minImportance))
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                .order('importance', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(parseInt(limit));

            if (userId) q = q.eq('user_id', userId);

            const { data, error } = await q;
            if (error) throw error;

            return res.status(200).json({ success: true, memories: data || [], mode: 'recency' });
        }

        // ── DELETE → Remove memory ────────────────────────────────────────────
        if (req.method === 'DELETE') {
            const body = req.body || {};
            const { id, tenantId } = body;

            if (!id && !tenantId) return res.status(400).json({ error: 'Missing id or tenantId' });

            let q = supabase.from('memory_entries').delete();
            if (id) q = q.eq('id', id);
            else if (tenantId) q = q.eq('tenant_id', tenantId); // wipe all for tenant

            const { error } = await q;
            if (error) throw error;

            return res.status(200).json({ success: true, message: id ? 'Memory deleted' : 'All memories deleted for tenant' });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('[Memory API]', err.message);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
};
