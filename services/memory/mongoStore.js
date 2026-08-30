const { connectToDatabase } = require('../../api/_mongodb');

class MongoStore {
    constructor() {
        this.MAX_CONTEXT_MESSAGES = 8;
        this.collectionName = 'chat_memory';
    }

    async getHistory(conversationId) {
        if (!conversationId) return [];
        try {
            const db = await connectToDatabase();
            if (!db) return [];
            
            const doc = await db.collection(this.collectionName).findOne({ _id: conversationId });
            return doc ? doc.history || [] : [];
        } catch (error) {
            console.error('[MongoStore] getHistory error:', error.message);
            return [];
        }
    }

    async addMessage(conversationId, role, text) {
        if (!conversationId || !text) return;
        try {
            const db = await connectToDatabase();
            if (!db) return;

            let history = await this.getHistory(conversationId);
            history.push({ role, text });

            // Keep only recent context
            if (history.length > this.MAX_CONTEXT_MESSAGES * 2) {
                history = history.slice(-this.MAX_CONTEXT_MESSAGES * 2);
            }

            await db.collection(this.collectionName).updateOne(
                { _id: conversationId },
                { 
                    $set: { 
                        history, 
                        updatedAt: new Date() 
                    } 
                },
                { upsert: true }
            );
        } catch (error) {
            console.error('[MongoStore] addMessage error:', error.message);
        }
    }
}

module.exports = new MongoStore();
