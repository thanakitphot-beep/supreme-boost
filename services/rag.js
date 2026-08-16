// RAG & Knowledge Service

async function generateEmbedding(text, apiKey) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=" + apiKey;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text: text }] }
        })
    });
    
    if (!res.ok) throw new Error("Gemini embedding failed");
    const data = await res.json();
    return data.embedding.values;
}

async function getRagContext(supabase, tenantId, query, geminiApiKey) {
    if (!query || !supabase || !tenantId || !geminiApiKey) return "";
    
    try {
        const queryEmbedding = await generateEmbedding(query, geminiApiKey);
        
        // 1. Vector Similarity Search
        const vectorSearch = supabase.rpc('match_knowledge_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: 5,
            filter_tenant_id: tenantId
        });

        // 2. Keyword/Text Search (Fallback/Hybrid)
        const keywordSearch = supabase
            .from('knowledge_chunks')
            .select('*')
            .eq('tenant_id', tenantId)
            .textSearch('content', query.split(' ').join(' | '))
            .limit(3);

        const [vectorResult, keywordResult] = await Promise.all([vectorSearch, keywordSearch]);
        
        const chunks = [];
        const seenIds = new Set();
        
        if (!vectorResult.error && vectorResult.data) {
            vectorResult.data.forEach(c => {
                chunks.push(c);
                if (c.id) seenIds.add(c.id);
            });
        }
        
        if (!keywordResult.error && keywordResult.data) {
            keywordResult.data.forEach(c => {
                if (!seenIds.has(c.id)) {
                    chunks.push(c);
                    if (c.id) seenIds.add(c.id);
                }
            });
        }
        
        if (chunks.length > 0) {
            return chunks.map(c => `[Source: ${c.title || c.url}]\n${c.content}`).join('\n\n');
        }
    } catch (ragErr) {
        console.error("[RAG Error]", ragErr.message);
    }
    
    return "";
}

module.exports = {
    generateEmbedding,
    getRagContext
};
