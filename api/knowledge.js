const db = require('./db.js');
const auth = require('./auth.js');
const cheerio = require('cheerio');

async function generateEmbedding(text, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text }] }
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini embedding failed: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    if (!data.embedding || !data.embedding.values) {
        throw new Error(`Embedding response format error`);
    }
    return data.embedding.values;
}

function chunkText(text, chunkSize = 500, overlap = 50) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const chunk = text.slice(start, start + chunkSize);
        chunks.push(chunk);
        start += chunkSize - overlap;
        if (start >= text.length || chunk.length < chunkSize) break;
    }
    return chunks;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Auth Check
    const authHeader = req.headers['authorization'];
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.substring(7);
    if (!auth.verifyToken(token)) return res.status(401).json({ success: false, message: 'Unauthorized' });

    try {
        if (req.method === 'GET') {
            const tenantId = req.query ? req.query.tenantId : (req.url.split('tenantId=')[1] || '').split('&')[0];
            if (!tenantId) return res.status(400).json({ success: false, message: 'Missing tenantId' });
            
            const chunks = await db.getKnowledge(tenantId);
            return res.status(200).json({ success: true, data: chunks });
        }

        if (req.method === 'DELETE') {
            const body = req.body || {};
            if (!body.id) return res.status(400).json({ success: false, message: 'Missing id' });
            
            const success = await db.deleteKnowledge(body.id);
            if (!success) return res.status(500).json({ success: false, message: 'Failed to delete chunk' });
            
            return res.status(200).json({ success: true, message: 'Chunk deleted' });
        }

        if (req.method === 'POST') {
            // Check if it's crawl endpoint by url path
            if (req.url && req.url.includes('/crawl')) {
                const body = req.body || {};
                const { tenantId, url } = body;
                if (!tenantId || !url) return res.status(400).json({ success: false, message: 'Missing tenantId or url' });

                const geminiKey = process.env.GEMINI_API_KEY;
                if (!geminiKey) return res.status(500).json({ success: false, message: 'System missing GEMINI_API_KEY for embedding' });

                // 1. Fetch URL
                const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }});
                if (!response.ok) return res.status(400).json({ success: false, message: 'Failed to fetch the URL' });
                const html = await response.text();

                // 2. Parse HTML
                const $ = cheerio.load(html);
                $('script, style, nav, footer, header, noscript, svg, iframe').remove();
                const title = $('title').text().trim() || url;
                let text = $('body').text();
                text = text.replace(/\s+/g, ' ').trim();
                if (!text) return res.status(400).json({ success: false, message: 'No content found on the page' });

                // 3. Delete old knowledge for this URL to prevent duplicates
                await db.deleteKnowledgeByUrl(tenantId, url);

                // 4. Chunk Text
                const chunks = chunkText(text, 500, 50);

                // 5. Generate embeddings and save
                let savedCount = 0;
                for (let i = 0; i < chunks.length; i++) {
                    const chunkContent = chunks[i];
                    try {
                        const embedding = await generateEmbedding(chunkContent, geminiKey);
                        await db.addKnowledge({
                            tenantId,
                            url,
                            title,
                            content: chunkContent,
                            embedding,
                            chunkIndex: i
                        });
                        savedCount++;
                    } catch (e) {
                        console.error('Embedding error for chunk', i, e.message);
                    }
                }

                await db.addLog('info', `Crawled ${savedCount} chunks from ${url}`, { tenantId, url });
                return res.status(200).json({ success: true, chunksCount: savedCount });
            }
        }

        return res.status(405).json({ success: false, message: 'Method not allowed' });
    } catch (err) {
        console.error('Knowledge handler error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
