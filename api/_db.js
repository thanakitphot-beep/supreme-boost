const { connectToDatabase } = require("./_mongodb.js");
const crypto = require('crypto');

// ─── Helper: In-memory Cosine Similarity for Vector Search ───
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {

    // ─── Tenants ────────────────────────────────────────────────
    getTenants: async () => {
        const db = await connectToDatabase();
        if (!db) return [];
        return await db.collection('tenants').find({}).sort({ created_at: -1 }).toArray();
    },

    getTenantByApiKey: async (apiKey) => {
        const db = await connectToDatabase();
        if (!db) return null;
        return await db.collection('tenants').findOne({ api_key: apiKey });
    },

    addTenant: async (tenant) => {
        const db = await connectToDatabase();
        if (!db) return null;
        const newTenant = {
            id: tenant.id || crypto.randomUUID(),
            company_name: tenant.companyName,
            api_key: tenant.apiKey,
            status: tenant.status || 'active',
            package_type: tenant.packageType || 'basic',
            expires_at: tenant.expiresAt,
            created_at: new Date().toISOString()
        };
        await db.collection('tenants').insertOne(newTenant);
        return newTenant;
    },

    updateTenant: async (id, updates) => {
        const db = await connectToDatabase();
        if (!db) return null;
        const payload = {};
        if (updates.companyName !== undefined) payload.company_name = updates.companyName;
        if (updates.apiKey !== undefined) payload.api_key = updates.apiKey;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.packageType !== undefined) payload.package_type = updates.packageType;
        if (updates.expiresAt !== undefined) payload.expires_at = updates.expiresAt;

        await db.collection('tenants').updateOne({ id }, { $set: payload });
        return await db.collection('tenants').findOne({ id });
    },

    deleteTenant: async (id) => {
        const db = await connectToDatabase();
        if (!db) return false;
        await db.collection('tenants').deleteOne({ id });
        return true;
    },

    // ─── Knowledge Base ─────────────────────────────────────────
    addKnowledge: async (chunk) => {
        const db = await connectToDatabase();
        if (!db) return null;
        const newChunk = {
            id: crypto.randomUUID(),
            tenant_id: chunk.tenantId,
            url: chunk.url,
            title: chunk.title,
            content: chunk.content,
            embedding: chunk.embedding,
            chunk_index: chunk.chunkIndex,
            created_at: new Date().toISOString()
        };
        await db.collection('knowledge_chunks').insertOne(newChunk);
        return newChunk;
    },

    getKnowledge: async (tenantId) => {
        const db = await connectToDatabase();
        if (!db) return [];
        return await db.collection('knowledge_chunks').find({ tenant_id: tenantId }).sort({ created_at: -1 }).toArray();
    },

    deleteKnowledge: async (id) => {
        const db = await connectToDatabase();
        if (!db) return false;
        await db.collection('knowledge_chunks').deleteOne({ id });
        return true;
    },

    deleteKnowledgeByUrl: async (tenantId, url) => {
        const db = await connectToDatabase();
        if (!db) return false;
        await db.collection('knowledge_chunks').deleteMany({ tenant_id: tenantId, url });
        return true;
    },

    searchKnowledge: async (tenantId, queryEmbedding, limit = 5, matchThreshold = 0.5) => {
        const db = await connectToDatabase();
        if (!db) return [];
        // Fetch all chunks for tenant (since it's usually small enough for in-memory JS processing)
        const chunks = await db.collection('knowledge_chunks').find({ tenant_id: tenantId }).toArray();
        
        // Calculate similarity
        const scoredChunks = chunks.map(chunk => {
            return {
                ...chunk,
                similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
            };
        });

        // Filter, sort and limit
        return scoredChunks
            .filter(c => c.similarity >= matchThreshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    },

    // ─── Settings ───────────────────────────────────────────────
    getSettings: async (id = 'global') => {
        const db = await connectToDatabase();
        if (!db) return null;
        const data = await db.collection('settings').findOne({ id });
        if (!data) return null;
        return {
            systemModel: data.system_model,
            systemPrompt: data.system_prompt,
            themeColor: data.theme_color,
            temperature: data.temperature
        };
    },

    saveSettings: async (id = 'global', settings) => {
        const db = await connectToDatabase();
        if (!db) return null;
        const payload = {};
        if (settings.systemModel !== undefined) payload.system_model = settings.systemModel;
        if (settings.systemPrompt !== undefined) payload.system_prompt = settings.systemPrompt;
        if (settings.themeColor !== undefined) payload.theme_color = settings.themeColor;
        if (settings.temperature !== undefined) payload.temperature = settings.temperature;
        payload.updated_at = new Date().toISOString();

        await db.collection('settings').updateOne(
            { id },
            { $set: payload },
            { upsert: true }
        );
        return await db.collection('settings').findOne({ id });
    },

    // ─── Logs ───────────────────────────────────────────────────
    addLog: async (type, message, metadata = {}) => {
        const db = await connectToDatabase();
        if (!db) return;
        await db.collection('logs').insertOne({
            id: crypto.randomUUID(),
            type,
            message: String(message).slice(0, 2000),
            metadata,
            timestamp: new Date().toISOString()
        });
    },

    getLogs: async (limit = 100) => {
        const db = await connectToDatabase();
        if (!db) return [];
        const data = await db.collection('logs').find({}).sort({ timestamp: -1 }).limit(limit).toArray();
        return data.reverse();
    },

    // ─── OTPs ───────────────────────────────────────────────────
    saveOtp: async (email, otp, expiresAt, challengeId, cooldownMs = 60_000) => {
        const db = await connectToDatabase();
        if (!db) return null;
        const now = Date.now();
        try {
            const result = await db.collection('otps').findOneAndUpdate(
                {
                    _id: email,
                    $or: [
                        { createdAtMs: { $lte: now - cooldownMs } },
                        { createdAtMs: { $exists: false } }
                    ]
                },
                {
                    $set: { email, otp, expiresAt, challengeId, attempts: 0, createdAtMs: now, created_at: new Date(now).toISOString() },
                    $unset: { verificationTokenHash: '', verificationExpiresAt: '', verified_at: '' }
                },
                { upsert: true, returnDocument: 'after' }
            );
            return Boolean(result && (!Object.prototype.hasOwnProperty.call(result, 'value') || result.value));
        } catch (error) {
            // A concurrent request that loses the upsert race hits the unique _id.
            if (error && error.code === 11000) return false;
            throw error;
        }
    },

    getOtp: async (email) => {
        const db = await connectToDatabase();
        if (!db) return null;
        return await db.collection('otps').findOne({ _id: email });
    },

    attemptOtp: async (email, otp, verificationToken, verificationExpiresAt, maxAttempts = 5) => {
        const db = await connectToDatabase();
        if (!db) return null;
        const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
        const matchesOtp = { $eq: ['$otp', { $literal: otp }] };
        const result = await db.collection('otps').findOneAndUpdate(
            {
                _id: email,
                expiresAt: { $gt: Date.now() },
                $expr: { $lt: [{ $ifNull: ['$attempts', 0] }, maxAttempts] }
            },
            [{
                $set: {
                    attempts: { $cond: [matchesOtp, '$$REMOVE', { $add: [{ $ifNull: ['$attempts', 0] }, 1] }] },
                    verificationTokenHash: { $cond: [matchesOtp, verificationTokenHash, '$$REMOVE'] },
                    verificationExpiresAt: { $cond: [matchesOtp, verificationExpiresAt, '$$REMOVE'] },
                    verified_at: { $cond: [matchesOtp, new Date().toISOString(), '$$REMOVE'] },
                    otp: { $cond: [matchesOtp, '$$REMOVE', '$otp'] },
                    expiresAt: { $cond: [matchesOtp, '$$REMOVE', '$expiresAt'] },
                    challengeId: { $cond: [matchesOtp, '$$REMOVE', '$challengeId'] }
                }
            }],
            { returnDocument: 'after' }
        );
        const document = result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result;
        return document ? { document, verified: document.verificationTokenHash === verificationTokenHash } : null;
    },

    deleteOtp: async (email, challengeId) => {
        const db = await connectToDatabase();
        if (!db) return false;
        const filter = challengeId ? { _id: email, challengeId } : { _id: email };
        await db.collection('otps').deleteOne(filter);
        return true;
    },

    consumeOtpVerification: async (email, token) => {
        const db = await connectToDatabase();
        if (!db) return false;
        const verificationTokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
        const result = await db.collection('otps').findOneAndDelete({
            _id: email,
            verificationTokenHash,
            verificationExpiresAt: { $gt: Date.now() }
        });
        const document = result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result;
        return Boolean(document);
    }
};
