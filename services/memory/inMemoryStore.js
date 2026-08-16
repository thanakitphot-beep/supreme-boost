class InMemoryStore {
    constructor() {
        this.cache = new Map();
        this.MAX_CONTEXT_MESSAGES = 8;
    }

    async getHistory(conversationId) {
        if (!conversationId) return [];
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
    }
}

module.exports = new InMemoryStore();
