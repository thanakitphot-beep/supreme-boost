const { createHash } = require('node:crypto');
// Exact context cache: similarity alone cannot establish answer equivalence.
const semanticCache = {
    // Bump this whenever answer policy or the intelligence backend changes.
    // Keeping it in every key prevents a reply produced by an older agent
    // policy from being served after a deployment (the exact issue that can
    // make a greeting appear to ignore a newly added conversational rule).
    _answerPolicyVersion: '2026-08-15-intelligence-v2',
    _store: new Map(),
    _maxSize: 100,
    _ttlMs: 600000,
    
    _makeKey: function (payload) {
        return createHash('sha256').update(JSON.stringify({
            policy: this._answerPolicyVersion,
            tenantId: payload.tenantId || 'anonymous-tenant',
            conversationId: payload.conversationId || '',
            prompt: payload.prompt || '',
            title: payload.title || '',
            url: payload.url || '',
            locale: payload.locale || 'en',
            isProactive: !!payload.isProactive,
            history: payload.history || [],
            pageContent: payload.pageContent || '',
            siteDNA: payload.siteDNA || null,
            siteProfile: payload.siteProfile || null,
            ragContext: payload.ragContext || '',
            expertKnowledge: payload.expertKnowledge || null,
            tenantSettings: payload.tenantSettings || null
        })).digest('hex');
    },

    get: function (payload) {
        let key = this._makeKey(payload);
        let entry = this._store.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this._ttlMs) { 
            this._store.delete(key); 
            return null; 
        }
        entry.hits = (entry.hits || 0) + 1;
        return structuredClone(entry.data);
    },
    
    set: function (payload, data) {
        if (!data || typeof data.reply !== 'string' || !data.reply.trim() ||
            (data.status && data.status !== 'ok') || data.metadata?.error ||
            data.metadata?.needsReasoning || data.action || data.cssCommand || data.interactive) return;
        if (this._store.size >= this._maxSize) {
            let oldest = null, oldestKey = null;
            this._store.forEach((v, k) => { 
                if (!oldest || v.timestamp < oldest.timestamp) { oldest = v; oldestKey = k; } 
            });
            if (oldestKey) this._store.delete(oldestKey);
        }
        this._store.set(this._makeKey(payload), { data: structuredClone(data), timestamp: Date.now(), hits: 1 });
    },
    
    stats: function () {
        let entries = [];
        this._store.forEach((v, k) => { entries.push({ key: k, age: Date.now() - v.timestamp, hits: v.hits }); });
        return { size: this._store.size, entries: entries };
    }
};

module.exports = {
    semanticCache
};
