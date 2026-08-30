const db = require("./_db.js");
const auth = require("./_auth.js");
const cheerio = require('cheerio');
const { fetchPublicResource } = require('../services/publicHttp');
const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');
const { consumeUsage, loadEntitledTenant } = require('../services/plans');
const { connectToDatabase } = require('./_mongodb');
const { canonicalOrigin, normalizeAllowedOrigins } = require('../services/tenantAccess');
const { generateGeminiEmbedding } = require('../services/geminiEmbedding');

const MAX_DEEP_PAGES = 3;
const MAX_CHUNKS_PER_PAGE = 6;
const MAX_TEXT_CHARS = 12_000;
const MAX_TEXT_CHUNKS = 20;

function validRecordId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/u.test(value);
}

async function entitledKnowledgeTenant(isGlobalAdmin, tenantId) {
    if (isGlobalAdmin) {
        const mongo = await connectToDatabase();
        return mongo && mongo.collection('tenants').findOne({ id: tenantId });
    }
    const tenant = await loadEntitledTenant(tenantId);
    if (!tenant || !tenant.entitlements.features.knowledge) return null;
    return tenant;
}

function tenantAllowsCrawl(tenant, url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
        const origin = canonicalOrigin(parsed.origin);
        return Boolean(origin && tenant && normalizeAllowedOrigins(tenant.allowed_origins).includes(origin));
    } catch (_) {
        return false;
    }
}

// ============================================================
// SUPREME INTELLIGENCE CRAWLER — Enterprise RAG Engine v3.0
// Deep Multi-Page Crawler + Smart Chunking + Semantic Embedding
// ============================================================

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
    const safeIdentifier = value => String(value || '').trim().split(/\s+/)[0].replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
    if (el.attribs && el.attribs.id) return `#${safeIdentifier(el.attribs.id)}`;
    let path = [];
    let current = el;
    while (current && current.name && current.name !== 'body' && current.name !== 'html') {
        let sel = current.name;
        if (current.attribs && current.attribs.id) {
            sel += `#${safeIdentifier(current.attribs.id)}`;
            path.unshift(sel);
            break;
        } else if (current.attribs && current.attribs.class) {
            const className = safeIdentifier(current.attribs.class);
            if (className) sel += `.${className}`;
        }
        path.unshift(sel);
        current = current.parent;
    }
    return path.join(' > ');
}

// Extract rich structured content with precision CSS Selectors
function extractContent($, url) {
    $('script, style, nav, header, footer, noscript, svg, iframe, [class*="cookie"], [class*="popup"], [class*="modal"]').remove();

    const title = ($('title').text().trim() || $('h1').first().text().trim() || url).slice(0, 240);
    const description = String($('meta[name="description"]').attr('content') || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    
    const chunksWithSelectors = [];

    // Extract block elements
    $('h1, h2, h3, p, li, [class*="price"], [class*="faq"]').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 1200);
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
    if (!groqKey || process.env.KNOWLEDGE_SYNTHESIS_ENABLED !== 'true') return text;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL || process.env.AI_FALLBACK_MODEL || "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: "Analyze the text and generate 1-2 probable questions a user might ask regarding this information. Format: Original text followed by [Q: <question>]"
                }, {
                    role: "user", content: text
                }],
                temperature: 0.1,
                max_tokens: 300
            }),
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return text;
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
        const sitemapUrl = origin + '/sitemap.xml';
        const sitemapRes = await fetchPublicResource(sitemapUrl, { timeoutMs: 4000, maxBytes: 500_000 });
        if (sitemapRes.ok) {
            const sitemapText = sitemapRes.body.toString('utf8');
            const matches = sitemapText.match(/<loc>([^<]+)<\/loc>/g) || [];
            for (const m of matches) {
                const u = m.replace(/<\/?loc>/g, '').trim();
                if (new URL(u).origin === origin && u !== baseUrl) {
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
                if (new URL(abs).origin === origin && abs !== baseUrl && !abs.includes('#')) {
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
    try {
        const res = await fetchPublicResource(url, { timeoutMs: 8000, maxBytes: 500_000 });
        if (!res.ok) return null;
        const contentType = String(res.headers['content-type'] || '');
        if (!contentType.includes('html')) return null;
        return res.body.toString('utf8');
    } catch (_) {
        return null;
    }
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ success: false, message: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!req._rateLimitChecked && !await checkRateLimit(req, res, 'api')) return;

    const token = auth.accessTokenFromRequest(req);
    
    // Check global valid token first
    if (!auth.verifyToken(token)) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Validate tenant ownership
    const decoded = auth.verifyAccessJWT(token);
    const isGlobalAdmin = decoded?.role === 'admin' || auth.verifyToken(token) && !decoded; // HMAC fallback is admin

    try {
        if (req.method === 'GET') {
            const tenantId = req.query ? req.query.tenantId : (req.url.split('tenantId=')[1] || '').split('&')[0];
            if (!validRecordId(tenantId)) return res.status(400).json({ success: false, message: 'Valid tenantId required' });
            
            // Tenant Check
            if (!isGlobalAdmin && decoded?.tenantId !== tenantId) {
                return res.status(403).json({ success: false, message: 'Forbidden: Tenant mismatch' });
            }

            if (!await entitledKnowledgeTenant(isGlobalAdmin, tenantId)) return res.status(403).json({ success: false, message: 'Knowledge is not available for this tenant plan' });
            const chunks = await db.getKnowledge(tenantId);
            return res.status(200).json({ success: true, data: chunks });
        }

        if (req.method === 'DELETE') {
            const body = req.body || {};
            const { id, tenantId } = body;
            if (!validRecordId(id) || !validRecordId(tenantId)) return res.status(400).json({ success: false, message: 'Valid id and tenantId required' });
            if (!isGlobalAdmin && decoded?.tenantId !== tenantId) {
                return res.status(403).json({ success: false, message: 'Forbidden: Tenant mismatch' });
            }
            if (!await entitledKnowledgeTenant(isGlobalAdmin, tenantId)) return res.status(403).json({ success: false, message: 'Knowledge is not available for this tenant plan' });
            const success = await db.deleteKnowledge(tenantId, id);
            if (!success) return res.status(404).json({ success: false, message: 'Knowledge chunk not found' });
            return res.status(200).json({ success: true, message: 'Chunk deleted' });
        }

        if (req.method === 'POST') {
            // ==========================================
            // SUPREME DEEP CRAWLER — Multi-page Mode
            // ==========================================
            if (req.url && req.url.includes('/crawl')) {
                const body = req.body || {};
                const { tenantId, url, deepCrawl = true } = body;
                if (!validRecordId(tenantId) || typeof url !== 'string' || url.length > 2000 || typeof deepCrawl !== 'boolean') {
                    return res.status(400).json({ success: false, message: 'Valid tenantId, url, and deepCrawl are required' });
                }

                // Tenant Check
                if (!isGlobalAdmin && decoded?.tenantId !== tenantId) {
                    return res.status(403).json({ success: false, message: 'Forbidden: Tenant mismatch' });
                }

                const entitledTenant = await entitledKnowledgeTenant(isGlobalAdmin, tenantId);
                if (!entitledTenant) return res.status(403).json({ success: false, message: 'Knowledge crawling is not available for this tenant plan' });
                if (!tenantAllowsCrawl(entitledTenant, url)) return res.status(403).json({ success: false, message: 'URL origin is not registered for this tenant' });
                const geminiKey = process.env.GEMINI_API_KEY;
                if (!geminiKey) return res.status(500).json({ success: false, message: 'Missing GEMINI_API_KEY' });
                if (!isGlobalAdmin) {
                    const usage = await consumeUsage(entitledTenant, 'crawl');
                    if (!usage.allowed) return res.status(usage.status || 429).json({ success: false, message: usage.reason });
                }

                // Step 1: Fetch main page
                const mainHtml = await fetchPage(url);
                if (!mainHtml) return res.status(400).json({ success: false, message: 'Cannot fetch the URL. Check if it is accessible.' });

                const $ = cheerio.load(mainHtml);
                const { title, structuredChunks } = extractContent($, url);

                // Step 2: Discover sub-pages
                const subUrls = deepCrawl ? await discoverUrls(url, mainHtml, $, MAX_DEEP_PAGES) : [];

                // Step 3: Delete old knowledge for this domain
                await Promise.all([url, ...subUrls].map(pageUrl => db.deleteKnowledgeByUrl(tenantId, pageUrl)));

                // Step 4: Process main page (Tri-Core)
                let totalSaved = 0;
                for (let i = 0; i < Math.min(structuredChunks.length, MAX_CHUNKS_PER_PAGE); i++) {
                    try {
                        // AI 1 & 2: Synthesis (Groq Llama 3)
                        const synthesizedText = await synthesizeGroq(structuredChunks[i]);
                        // AI 3: Vectorization (Gemini Embedding)
                        const embedding = await generateGeminiEmbedding(synthesizedText, geminiKey);
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

                            for (let j = 0; j < Math.min(subChunks.length, MAX_CHUNKS_PER_PAGE); j++) {
                                try {
                                    // Synthesis
                                    const synthesizedText = await synthesizeGroq(subChunks[j]);
                                    // Embedding
                                    const embedding = await generateGeminiEmbedding(synthesizedText, geminiKey);
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
                if (!validRecordId(tenantId) || typeof text !== 'string') return res.status(400).json({ success: false, message: 'Valid tenantId and text required' });

                // Tenant Check
                if (!isGlobalAdmin && decoded?.tenantId !== tenantId) {
                    return res.status(403).json({ success: false, message: 'Forbidden: Tenant mismatch' });
                }

                const entitledTenant = await entitledKnowledgeTenant(isGlobalAdmin, tenantId);
                if (!entitledTenant) return res.status(403).json({ success: false, message: 'Knowledge is not available for this tenant plan' });

                const geminiKey = process.env.GEMINI_API_KEY;
                if (!geminiKey) return res.status(500).json({ success: false, message: 'Missing GEMINI_API_KEY' });

                const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
                if (!cleaned) return res.status(400).json({ success: false, message: 'Knowledge text cannot be empty' });
                if (!isGlobalAdmin) {
                    const usage = await consumeUsage(entitledTenant, 'knowledge');
                    if (!usage.allowed) return res.status(usage.status || 429).json({ success: false, message: usage.reason });
                }
                const chunks = smartChunk(cleaned, 600, 80).slice(0, MAX_TEXT_CHUNKS);
                const fakeUrl = 'text:' + Date.now();
                const safeTitle = String(title || 'Custom Text Knowledge').replace(/\s+/g, ' ').trim().slice(0, 240) || 'Custom Text Knowledge';
                let savedCount = 0;
                for (let i = 0; i < chunks.length; i++) {
                    try {
                        const embedding = await generateGeminiEmbedding(chunks[i], geminiKey);
                        await db.addKnowledge({ tenantId, url: fakeUrl, title: safeTitle, content: chunks[i], embedding, chunkIndex: i });
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
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports.__tenantAllowsCrawl = tenantAllowsCrawl;
