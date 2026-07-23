const db = require("./_db.js");
const auth = require("./_auth.js");
const cheerio = require('cheerio');

// ============================================================
// SUPREME INTELLIGENCE CRAWLER — Enterprise RAG Engine v3.0
// Deep Multi-Page Crawler + Smart Chunking + Semantic Embedding
// ============================================================

async function generateEmbedding(text, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text }] } })
    });
    if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
    const data = await res.json();
    if (!data.embedding || !data.embedding.values) throw new Error('Embedding format error');
    return data.embedding.values;
}

// Smart Semantic Chunking — split by paragraph/sentence boundaries
function smartChunk(text, maxSize = 600, overlap = 80) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxSize) return [cleaned];

    const chunks = [];
    // Split by natural boundaries: paragraphs first, then sentences
    const paragraphs = cleaned.split(/\n{2,}|\.\s{2,}/).filter(p => p.trim().length > 30);

    let current = '';
    for (const para of paragraphs) {
        if ((current + ' ' + para).length <= maxSize) {
            current = current ? current + ' ' + para.trim() : para.trim();
        } else {
            if (current) chunks.push(current.trim());
            // If single paragraph is too long, split by sentences
            if (para.length > maxSize) {
                const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
                let sentBuf = '';
                for (const s of sentences) {
                    if ((sentBuf + ' ' + s).length <= maxSize) {
                        sentBuf = sentBuf ? sentBuf + ' ' + s : s;
                    } else {
                        if (sentBuf) chunks.push(sentBuf.trim());
                        sentBuf = s;
                    }
                }
                if (sentBuf) current = sentBuf;
                else current = '';
            } else {
                current = para.trim();
            }
        }
    }
    if (current) chunks.push(current.trim());

    // Add overlap between chunks for better context
    const overlapped = [];
    for (let i = 0; i < chunks.length; i++) {
        let chunk = chunks[i];
        if (i > 0 && overlap > 0) {
            const prev = chunks[i - 1];
            const overlapText = prev.slice(-overlap);
            chunk = overlapText + ' ... ' + chunk;
        }
        if (chunk.length > 20) overlapped.push(chunk);
    }
    return overlapped.length > 0 ? overlapped : [cleaned];
}

// Extract unique CSS selector
function getUniqueSelector(el, $) {
    if (!el || !el.name) return '';
    if (el.attribs && el.attribs.id) return `#${el.attribs.id}`;
    let path = [];
    let current = el;
    while (current && current.name && current.name !== 'body' && current.name !== 'html') {
        let sel = current.name;
        if (current.attribs && current.attribs.id) {
            sel += `#${current.attribs.id}`;
            path.unshift(sel);
            break;
        } else if (current.attribs && current.attribs.class) {
            sel += `.${current.attribs.class.trim().replace(/\s+/g, '.').split(' ')[0]}`;
        }
        path.unshift(sel);
        current = current.parent;
    }
    return path.join(' > ');
}

// Extract rich structured content with precision CSS Selectors
function extractContent($, url) {
    $('script, style, nav, header, footer, noscript, svg, iframe, [class*="cookie"], [class*="popup"], [class*="modal"]').remove();

    const title = $('title').text().trim() || $('h1').first().text().trim() || url;
    const description = $('meta[name="description"]').attr('content') || '';
    
    const chunksWithSelectors = [];

    // Extract block elements
    $('h1, h2, h3, p, li, [class*="price"], [class*="faq"]').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (text.length > 20) {
            chunksWithSelectors.push({
                text: text,
                selector: getUniqueSelector(el, $)
            });
        }
    });

    // Compile into RAG format
    let richText = description ? `[คำอธิบาย] ${description}\n\n` : '';
    let currentChunk = '';
    const structuredChunks = [];
    
    for (const item of chunksWithSelectors) {
        const line = `[SELECTOR: ${item.selector}] ${item.text}`;
        if ((currentChunk + '\n' + line).length > 600) {
            structuredChunks.push(currentChunk.trim());
            currentChunk = line;
        } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
        }
    }
    if (currentChunk) structuredChunks.push(currentChunk.trim());
    
    if (structuredChunks.length === 0) {
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        if (bodyText) structuredChunks.push(`[SELECTOR: body] ${bodyText.slice(0, 800)}`);
    }

    return { title, description, structuredChunks };
}

// GROQ Synthesizer (Llama 3 70B)
async function synthesizeGroq(text) {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return text;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama3-70b-8192",
                messages: [{
                    role: "system",
                    content: "Analyze the text and generate 1-2 probable questions a user might ask regarding this information. Format: Original text followed by [Q: <question>]"
                }, {
                    role: "user", content: text
                }],
                temperature: 0.1,
                max_tokens: 300
            })
        });
        const json = await res.json();
        return json.choices && json.choices[0] ? json.choices[0].message.content : text;
    } catch (e) {
        return text;
    }
}

// Discover sub-pages from sitemap or links
async function discoverUrls(baseUrl, html, $, maxPages = 15) {
    const discovered = new Set();
    const origin = new URL(baseUrl).origin;
    const basePath = new URL(baseUrl).pathname;

    // Try sitemap.xml first
    try {
        const sitemapRes = await fetch(origin + '/sitemap.xml', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(4000)
        });
        if (sitemapRes.ok) {
            const sitemapText = await sitemapRes.text();
            const matches = sitemapText.match(/<loc>([^<]+)<\/loc>/g) || [];
            for (const m of matches) {
                const u = m.replace(/<\/?loc>/g, '').trim();
                if (u.startsWith(origin) && u !== baseUrl) {
                    discovered.add(u);
                    if (discovered.size >= maxPages) break;
                }
            }
        }
    } catch (_) {}

    // Also extract important internal links from the page
    if (discovered.size < maxPages) {
        $('a[href]').each((_, el) => {
            if (discovered.size >= maxPages) return;
            try {
                const href = $(el).attr('href');
                if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
                const abs = new URL(href, baseUrl).href;
                // Only same-origin links that are not the same as base
                if (abs.startsWith(origin) && abs !== baseUrl && !abs.includes('#')) {
                    // Prefer important pages
                    const important = /(about|product|service|faq|contact|price|feature|blog|ราคา|สินค้า|บริการ|ติดต่อ)/i.test(abs);
                    if (important || discovered.size < 5) discovered.add(abs);
                }
            } catch (_) {}
        });
    }

    return [...discovered].slice(0, maxPages);
}

// Fetch and extract one page
async function fetchPage(url) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
            signal: ctrl.signal
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('html')) return null;
        const html = await res.text();
        return html;
    } catch (e) {
        clearTimeout(timeout);
        return null;
    }
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

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
            // ==========================================
            // SUPREME DEEP CRAWLER — Multi-page Mode
            // ==========================================
            if (req.url && req.url.includes('/crawl')) {
                const body = req.body || {};
                const { tenantId, url, deepCrawl = true } = body;
                if (!tenantId || !url) return res.status(400).json({ success: false, message: 'Missing tenantId or url' });

                const geminiKey = process.env.GEMINI_API_KEY;
                if (!geminiKey) return res.status(500).json({ success: false, message: 'Missing GEMINI_API_KEY' });

                // Step 1: Fetch main page
                const mainHtml = await fetchPage(url);
                if (!mainHtml) return res.status(400).json({ success: false, message: 'Cannot fetch the URL. Check if it is accessible.' });

                const $ = cheerio.load(mainHtml);
                const { title, structuredChunks } = extractContent($, url);

                // Step 2: Discover sub-pages
                const subUrls = deepCrawl ? await discoverUrls(url, mainHtml, $, 12) : [];

                // Step 3: Delete old knowledge for this domain
                await db.deleteKnowledgeByUrl(tenantId, url);

                // Step 4: Process main page (Tri-Core)
                let totalSaved = 0;
                for (let i = 0; i < structuredChunks.length; i++) {
                    try {
                        // AI 1 & 2: Synthesis (Groq Llama 3)
                        const synthesizedText = await synthesizeGroq(structuredChunks[i]);
                        // AI 3: Vectorization (Gemini Embedding)
                        const embedding = await generateEmbedding(synthesizedText, geminiKey);
                        await db.addKnowledge({ tenantId, url, title, content: synthesizedText, embedding, chunkIndex: i });
                        totalSaved++;
                    } catch (e) { console.error('Embed error main:', e.message); }
                }

                // Step 5: Process sub-pages (Tri-Core)
                const pageErrors = [];
                for (let i = 0; i < subUrls.length; i += 3) {
                    const batch = subUrls.slice(i, i + 3);
                    await Promise.all(batch.map(async (subUrl) => {
                        try {
                            const html = await fetchPage(subUrl);
                            if (!html) return;
                            const $s = cheerio.load(html);
                            const { title: subTitle, structuredChunks: subChunks } = extractContent($s, subUrl);
                            if (!subChunks || subChunks.length === 0) return;

                            for (let j = 0; j < subChunks.length; j++) {
                                try {
                                    // Synthesis
                                    const synthesizedText = await synthesizeGroq(subChunks[j]);
                                    // Embedding
                                    const embedding = await generateEmbedding(synthesizedText, geminiKey);
                                    await db.addKnowledge({ tenantId, url: subUrl, title: subTitle, content: synthesizedText, embedding, chunkIndex: j });
                                    totalSaved++;
                                } catch (e) { console.error('Embed error sub:', e.message); }
                            }
                        } catch (e) { pageErrors.push(subUrl); }
                    }));
                }

                await db.addLog('info', `Deep crawled ${subUrls.length + 1} pages, ${totalSaved} chunks from ${url}`, { tenantId, url });
                return res.status(200).json({
                    success: true,
                    chunksCount: totalSaved,
                    pagesCount: subUrls.length + 1,
                    message: `เรียนรู้สำเร็จ! ${subUrls.length + 1} หน้า, ${totalSaved} ชุดความรู้`
                });
            }

            // ==========================================
            // TEXT KNOWLEDGE — Manual Entry
            // ==========================================
            if (req.url && req.url.includes('/text')) {
                const body = req.body || {};
                const { tenantId, text, title } = body;
                if (!tenantId || !text) return res.status(400).json({ success: false, message: 'Missing tenantId or text' });

                const geminiKey = process.env.GEMINI_API_KEY;
                if (!geminiKey) return res.status(500).json({ success: false, message: 'Missing GEMINI_API_KEY' });

                const cleaned = text.replace(/\s+/g, ' ').trim();
                const chunks = smartChunk(cleaned, 600, 80);
                const fakeUrl = 'text:' + Date.now();
                let savedCount = 0;
                for (let i = 0; i < chunks.length; i++) {
                    try {
                        const embedding = await generateEmbedding(chunks[i], geminiKey);
                        await db.addKnowledge({ tenantId, url: fakeUrl, title: title || 'Custom Text Knowledge', content: chunks[i], embedding, chunkIndex: i });
                        savedCount++;
                    } catch (e) { console.error('Embed error text:', e.message); }
                }

                await db.addLog('info', `Added ${savedCount} text chunks`, { tenantId, type: 'text' });
                return res.status(200).json({ success: true, chunksCount: savedCount });
            }
        }

        return res.status(405).json({ success: false, message: 'Method not allowed' });
    } catch (err) {
        console.error('Knowledge handler error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
