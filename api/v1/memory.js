// OMEGA-JARVIS v3.0.0 — Long-Term Memory API
// POST /api/v1/memory   → store memory entry
// GET  /api/v1/memory   → retrieve memories (semantic search)
// DELETE /api/v1/memory → delete memory entry

const { createClient } = require('@supabase/supabase-js');
const { verifyAccessJWT } = require("../_auth.js");
const { setCorsHeaders } = require('../../services/cors');
const { checkRateLimit } = require('../../services/rateLimit');
const { loadEntitledTenant } = require('../../services/plans');

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

function canAccessTenant(claims, tenantId) {
    if (!claims || !tenantId) return false;
    if (claims.role === 'admin') return true;
    return claims.role === 'tenant' && claims.tenantId === tenantId;
}

function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) {
        return res.status(403).json({ error: 'Origin is not allowed' });
    }
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!req._rateLimitChecked && !await checkRateLimit(req, res, 'api')) return;
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const claims = verifyAccessJWT(token);
    if (!claims) return res.status(401).json({ error: 'Unauthorized' });
    if (claims.role === 'tenant') {
        const tenant = await loadEntitledTenant(claims.tenantId);
        if (!tenant) return res.status(403).json({ error: 'Tenant account is inactive or expired' });
        if (!tenant.entitlements.features.memory) return res.status(403).json({ error: 'This plan does not include long-term memory' });
        if (!await checkRateLimit(req, res, 'api', { principal: `tenant:${tenant.id}`, limit: tenant.entitlements.chatPerMinute })) return;
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    try {
        // ── POST → Store memory ───────────────────────────────────────────────
        if (req.method === 'POST') {
            const body = req.body || {};
            const { tenantId, userId, content, importance, expiresInDays, tags } = body;

            if (!tenantId || !content) {
                return res.status(400).json({ error: 'Missing tenantId or content' });
            }
            if (!canAccessTenant(claims, tenantId)) return res.status(403).json({ error: 'Forbidden: Tenant mismatch' });

            const cleanContent = String(content).replace(/\s+/g, ' ').trim().slice(0, 2000);
            if (!cleanContent) return res.status(400).json({ error: 'Memory content cannot be empty' });
            let embedding = null;

            // Generate embedding for semantic retrieval
            if (geminiKey) {
                try { embedding = await generateEmbedding(cleanContent, geminiKey); } catch (_) {}
            }

            const expiryDays = expiresInDays === undefined || expiresInDays === null || expiresInDays === ''
                ? null
                : boundedInteger(expiresInDays, 30, 1, 3650);
            const expires_at = expiryDays
                ? new Date(Date.now() + expiryDays * 86400000).toISOString()
                : null;

            const { data, error } = await supabase.from('memory_entries').insert({
                tenant_id: tenantId,
                user_id: userId || null,
                content: cleanContent,
                embedding: embedding || null,
                importance: Math.min(1, Math.max(0, parseFloat(importance) || 0.5)),
                expires_at,
                tags: Array.isArray(tags) ? tags.map(tag => String(tag).trim().slice(0, 80)).filter(Boolean).slice(0, 20) : null
            }).select().single();

            if (error) throw error;

            return res.status(201).json({ success: true, id: data.id, message: 'Memory stored' });
        }

        // ── GET → Retrieve memories ───────────────────────────────────────────
        if (req.method === 'GET') {
            const params = req.query || {};
            const { tenantId, userId, query, limit = '10', minImportance = '0' } = params;

            if (!tenantId) return res.status(400).json({ error: 'Missing tenantId' });
            if (!canAccessTenant(claims, tenantId)) return res.status(403).json({ error: 'Forbidden: Tenant mismatch' });
            const resultLimit = boundedInteger(limit, 10, 1, 50);
            const importanceFloor = Math.min(1, Math.max(0, Number.parseFloat(minImportance) || 0));

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
                            match_count: resultLimit,
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
                .gte('importance', importanceFloor)
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                .order('importance', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(resultLimit);

            if (userId) q = q.eq('user_id', userId);

            const { data, error } = await q;
            if (error) throw error;

            return res.status(200).json({ success: true, memories: data || [], mode: 'recency' });
        }

        // ── DELETE → Remove memory ────────────────────────────────────────────
        if (req.method === 'DELETE') {
            const body = req.body || {};
            const { id, tenantId } = body;

            if (!tenantId) return res.status(400).json({ error: 'Missing tenantId' });
            if (!canAccessTenant(claims, tenantId)) return res.status(403).json({ error: 'Forbidden: Tenant mismatch' });

            let q = supabase.from('memory_entries').delete().eq('tenant_id', tenantId);
            if (id) q = q.eq('id', id);

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

module.exports.__canAccessTenant = canAccessTenant;
module.exports.__boundedInteger = boundedInteger;
