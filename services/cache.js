// Semantic Cache Service
const semanticCache = {
    // Bump this whenever answer policy or the intelligence backend changes.
    // Keeping it in every key prevents a reply produced by an older agent
    // policy from being served after a deployment (the exact issue that can
    // make a greeting appear to ignore a newly added conversational rule).
    _answerPolicyVersion: '2026-08-15-intelligence-v2',
    _store: new Map(),
    _maxSize: 100,
    _ttlMs: 600000,
    
    _hash: function (text) {
        let hash = 0;
        if (!text) return "0";
        for (let i = 0; i < text.length; i++) { 
            let chr = text.charCodeAt(i); 
            hash = ((hash << 5) - hash) + chr; 
            hash |= 0; 
        }
        return String(hash);
    },
    
    _makeKey: function (payload) {
        let parts = [
            this._answerPolicyVersion,
            payload.tenantId || 'anonymous-tenant',
            (payload.prompt || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200),
            (payload.title || "").toLowerCase().slice(0, 50),
            payload.isProactive ? "proactive" : "reactive",
            payload.locale || "en",
            payload.siteProfile && payload.siteProfile.id || "unregistered-site"
        ];
        // Follow-up questions depend on recent chat context.  Include only a
        // bounded context fingerprint in the cache key: no message text is
        // stored in the cache index itself.
        if (Array.isArray(payload.history)) {
            parts.push(payload.history.slice(-4).map(item => {
                const role = item && item.role === 'assistant' ? 'a' : 'u';
                const text = String(item && item.text || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 240);
                return `${role}:${text}`;
            }).join('|'));
        }
        if (payload.pageContent) {
            let words = payload.pageContent.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            let freq = {};
            for (let i = 0; i < words.length; i++) { freq[words[i]] = (freq[words[i]] || 0) + 1; }
            let topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
            parts.push(topWords.join(","));
        }
        return this._hash(parts.join("|"));
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
        return entry.data;
    },
    
    set: function (payload, data) {
        if (this._store.size >= this._maxSize) {
            let oldest = null, oldestKey = null;
            this._store.forEach((v, k) => { 
                if (!oldest || v.timestamp < oldest.timestamp) { oldest = v; oldestKey = k; } 
            });
            if (oldestKey) this._store.delete(oldestKey);
        }
        this._store.set(this._makeKey(payload), { data: data, timestamp: Date.now(), hits: 1 });
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
