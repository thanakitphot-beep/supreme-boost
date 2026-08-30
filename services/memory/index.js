const inMemoryStore = require('./inMemoryStore');
const mongoStore = require('./mongoStore');

class MemoryManager {
    constructor() {
        this.store = process.env.MONGODB_URI ? mongoStore : inMemoryStore;
    }

    async getRecentMessages(conversationId, limit = 8) {
        const history = await this.store.getHistory(conversationId);
        return history.slice(-limit);
    }

    async addMessage(conversationId, role, text) {
        // Ensure text is sanitized before saving
        const safeText = String(text || '').slice(0, 1000);
        await this.store.addMessage(conversationId, role, safeText);
    }

    async getMergedHistory(conversationId, clientHistory = []) {
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
