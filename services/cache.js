// Semantic Cache Service
const semanticCache = {
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
            (payload.prompt || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200),
            (payload.title || "").toLowerCase().slice(0, 50),
            payload.isProactive ? "proactive" : "reactive",
            payload.locale || "en"
        ];
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
