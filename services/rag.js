// RAG & Knowledge Service — ใช้ Cohere Rerank เป็น AI Reranker

async function generateEmbedding(text, apiKey) {
    if (!apiKey) return null;
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

// Basic deterministic scoring function (fallback if Cohere Reranker is unavailable)
function scoreChunk(query, chunk) {
    let score = 0;
    const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const text = (chunk.title + " " + chunk.content).toLowerCase();
    for (const term of terms) {
        if (text.includes(term)) score += 10;
    }
    if (chunk.similarity) {
        score += chunk.similarity * 100;
    }
    return score;
}

/**
 * AI Reranker: ใช้ Cohere Rerank API จัดอันดับ Chunks ตามความหมายเชิงลึก
 * ทำให้ RAG ส่งข้อมูลที่ตรงที่สุดให้ GPT ได้แม่นยำกว่าสูตรคำนวณแบบเดิมมาก
 */
async function cohereRerank(query, chunks, cohereApiKey) {
    if (!cohereApiKey || chunks.length === 0) return null;
    
    try {
        const model = process.env.COHERE_RERANK_MODEL || 'rerank-v3.5';
        const topN = parseInt(process.env.COHERE_RERANK_TOP_N || '5', 10);
        
        const documents = chunks.map(c => `${c.title || ''}: ${c.content || ''}`);
        
        const res = await fetch('https://api.cohere.com/v2/rerank', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cohereApiKey}`,
                'X-Client-Name': 'indicator-rag'
            },
            body: JSON.stringify({
                model,
                query,
                documents,
                top_n: topN,
                return_documents: false
            })
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error('[Cohere Rerank Error]', res.status, errText.slice(0, 200));
            return null;
        }

        const data = await res.json();
        // ส่งคืน Chunks ที่เรียงตามอันดับที่ Cohere ประเมิน
        return data.results.map(r => chunks[r.index]);
    } catch (err) {
        console.error('[Cohere Rerank Exception]', err.message);
        return null; // ถ้า Cohere ล้มเหลว จะ Fallback ไปใช้ scoreChunk แทน
    }
}

async function getRagContext(supabase, tenantId, query, geminiApiKey) {
    if (!query || !supabase || !tenantId) return "";
    
    try {
        const rewrittenQuery = query;
        
        let queryEmbedding = null;
        if (geminiApiKey) {
            queryEmbedding = await generateEmbedding(rewrittenQuery, geminiApiKey).catch(() => null);
        }
        
        const promises = [];
        
        // 1. Vector Similarity Search
        if (queryEmbedding) {
            promises.push(
                supabase.rpc('match_knowledge_chunks', {
                    query_embedding: queryEmbedding,
                    match_threshold: 0.3,
                    match_count: 8,
                    filter_tenant_id: tenantId
                })
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        // 2. Keyword/Text Search (Hybrid)
        promises.push(
            supabase
                .from('knowledge_chunks')
                .select('*')
                .eq('tenant_id', tenantId)
                .textSearch('content', rewrittenQuery.split(' ').join(' | '))
                .limit(8)
        );

        const [vectorResult, keywordResult] = await Promise.all(promises);
        
        const chunksMap = new Map();
        
        if (!vectorResult.error && vectorResult.data) {
            vectorResult.data.forEach(c => {
                chunksMap.set(c.id, { ...c, source: 'vector' });
            });
        }
        
        if (!keywordResult.error && keywordResult.data) {
            keywordResult.data.forEach(c => {
                if (!chunksMap.has(c.id)) {
                    chunksMap.set(c.id, { ...c, source: 'keyword' });
                }
            });
        }
        
        const chunks = Array.from(chunksMap.values());
        
        if (chunks.length > 0) {
            // 3. AI Reranker (Cohere) — จัดอันดับตามความหมายเชิงลึกโดย AI จริงๆ
            const cohereApiKey = process.env.COHERE_API_KEY;
            let topChunks = await cohereRerank(rewrittenQuery, chunks, cohereApiKey);
            
            if (!topChunks) {
                // Fallback: ถ้า Cohere ไม่พร้อม ใช้สูตรคำนวณเดิม
                console.log('[RAG] Cohere unavailable, using deterministic scoring fallback.');
                chunks.forEach(c => c.finalScore = scoreChunk(rewrittenQuery, c));
                chunks.sort((a, b) => b.finalScore - a.finalScore);
                topChunks = chunks.slice(0, 5);
            }
            
            return topChunks.map(c => `[Source: ${c.title || c.url}]\n${c.content}`).join('\n\n');
        }
    } catch (ragErr) {
        console.error("[RAG Error]", ragErr.message);
    }
    
    return "";
}

module.exports = {
    generateEmbedding,
    cohereRerank,
    getRagContext
};
