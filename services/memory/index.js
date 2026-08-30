const inMemoryStore = require('./inMemoryStore');

class MemoryManager {
    constructor() {
        // Prepare for future DB swapping via ENV
        this.store = inMemoryStore;
    }

    async getRecentMessages(conversationId, limit = 8) {
        if (process.env.NODE_ENV === 'production') return [];
        const history = await this.store.getHistory(conversationId);
        return history.slice(-limit);
    }

    async addMessage(conversationId, role, text) {
        if (process.env.NODE_ENV === 'production') return;
        // Ensure text is sanitized before saving
        const safeText = String(text || '').slice(0, 1000);
        await this.store.addMessage(conversationId, role, safeText);
    }

    async getMergedHistory(conversationId, clientHistory = []) {
        if (process.env.NODE_ENV === 'production') {
            return (Array.isArray(clientHistory) ? clientHistory : []).slice(-8).map(item => ({
                role: item && item.role === 'assistant' ? 'assistant' : 'user',
                text: String(item && item.text || '').slice(0, 1000)
            })).filter(item => item.text);
        }
        let serverHistory = await this.getRecentMessages(conversationId);
        
        if (serverHistory.length === 0 && Array.isArray(clientHistory)) {
            // Seed from client if server is empty
            return clientHistory.slice(-8).map(item => ({
                role: item.role === 'assistant' ? 'assistant' : 'user',
                text: String(item.text).slice(0, 1000)
            })).filter(item => item.text);
        }

        return serverHistory;
    }
}

module.exports = new MemoryManager();
