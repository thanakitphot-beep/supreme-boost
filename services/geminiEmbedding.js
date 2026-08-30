'use strict';

function embeddingModel() {
    const configured = String(process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001').trim();
    return /^[A-Za-z0-9._-]{1,100}$/u.test(configured) ? configured : 'gemini-embedding-001';
}

async function generateGeminiEmbedding(text, apiKey) {
    if (!apiKey) return null;
    const model = embeddingModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text: String(text || '').slice(0, 8000) }] },
            outputDimensionality: 768
        }),
        signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`Gemini embedding failed: ${response.status}`);
    const data = await response.json();
    const values = data && data.embedding && data.embedding.values;
    if (!Array.isArray(values) || values.length !== 768 || values.some(value => !Number.isFinite(value))) {
        throw new Error('Gemini embedding format is invalid');
    }
    return values;
}

module.exports = { generateGeminiEmbedding };
