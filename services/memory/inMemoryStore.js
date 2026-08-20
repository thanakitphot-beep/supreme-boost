class InMemoryStore {
    constructor() {
        this.cache = new Map();
        this.touched = new Map();
        this.MAX_CONTEXT_MESSAGES = 8;
        this.MAX_CONVERSATIONS = 1000;
        this.TTL_MS = 12 * 60 * 60 * 1000;
    }

    async getHistory(conversationId) {
        if (!conversationId) return [];
        const touchedAt = this.touched.get(conversationId);
        if (touchedAt && Date.now() - touchedAt > this.TTL_MS) {
            this.cache.delete(conversationId);
            this.touched.delete(conversationId);
            return [];
        }
        if (this.cache.has(conversationId)) {
            this.touched.delete(conversationId);
            this.touched.set(conversationId, Date.now());
        }
        return this.cache.get(conversationId) || [];
    }

    async addMessage(conversationId, role, text) {
        if (!conversationId || !text) return;
        
        let history = await this.getHistory(conversationId);
        history.push({ role, text });
        
        // Keep only recent context
        if (history.length > this.MAX_CONTEXT_MESSAGES * 2) {
            history = history.slice(-this.MAX_CONTEXT_MESSAGES * 2);
        }
        
        this.cache.set(conversationId, history);
        this.touched.delete(conversationId);
        this.touched.set(conversationId, Date.now());
        while (this.cache.size > this.MAX_CONVERSATIONS) {
            const oldest = this.touched.keys().next().value;
            this.cache.delete(oldest);
            this.touched.delete(oldest);
        }
    }
}

module.exports = new InMemoryStore();
