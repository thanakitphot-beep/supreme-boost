'use strict';
const db = require('./_db');
const auth = require('./_auth');
const { publicUrl, cleanSource, digest, fetchPublicPage, extractPage, storeSource } = require('../services/knowledgeIngestion');
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!auth.verifyToken(token)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = auth.verifyJWT(token);
    const admin = decoded?.role === 'admin' || !decoded;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenantId = req.method === 'GET' ? (req.query?.tenantId || new URL(req.url, 'http://internal').searchParams.get('tenantId')) : body.tenantId;
    const allowed = id => identifier(id) && (admin || decoded?.tenantId === id);
    try {
        if (req.method === 'DELETE') {
            if (!identifier(body.id)) return res.status(400).json({ success: false, message: 'Missing or invalid id' });
            const row = await db.getKnowledgeById(body.id);
            if (!row || !allowed(row.tenant_id)) return res.status(404).json({ success: false, message: 'Knowledge not found' });
            const deleted = await db.deleteKnowledge(body.id, row.tenant_id);
            return res.status(deleted ? 200 : 409).json({ success: deleted });
        }
        if (!allowed(tenantId)) return res.status(403).json({ success: false, message: 'Forbidden: invalid tenant or tenant mismatch' });
        if (req.method === 'GET') return res.status(200).json({ success: true, data: await db.getKnowledge(tenantId) });
        if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
        if (req.url?.split('?')[0].endsWith('/text')) {
            if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 60000) return res.status(400).json({ success: false, message: 'Text must contain 1–60000 characters' });
            if (body.sourceId !== undefined && !identifier(body.sourceId)) return res.status(400).json({ success: false, message: 'Invalid sourceId' });
            const text = cleanSource(body.text);
            const url = 'text:' + (body.sourceId || digest(text));
            const saved = await storeSource(db, { tenantId, url, title: body.title, content: text, sourceType: 'tenant_text' });
            return res.status(200).json({ success: true, chunksCount: saved, sourceId: url.slice(5), embeddingRequired: false, message: 'บันทึกข้อความต้นฉบับลงคลังความรู้แล้ว' });
        }
        if (req.url?.split('?')[0].endsWith('/crawl')) {
            const start = publicUrl(body.url);
            if (!start) return res.status(400).json({ success: false, message: 'Use a public HTTP(S) page without private routes or query parameters' });
            const origin = new URL(start).origin, deadline = Date.now() + 25000;
            const queue = [start], visited = new Set();
            let chunksCount = 0, pagesCount = 0, failedPages = 0;
            while (queue.length && visited.size < 8 && chunksCount < 100 && Date.now() < deadline) {
                const url = queue.shift();
                if (visited.has(url)) continue;
                visited.add(url);
                try {
                    const page = await fetchPublicPage(url, origin, deadline);
                    const extracted = extractPage(page.html, page.url);
                    const saved = await storeSource(db, { tenantId, url: page.url, title: extracted.title, content: extracted.content, sourceType: 'public_web_page' }, 100 - chunksCount);
                    chunksCount += saved; pagesCount++;
                    if (body.deepCrawl !== false && visited.size === 1) queue.push(...extracted.links);
                } catch (_) { failedPages++; }
            }
            const partial = failedPages > 0 || queue.length > 0;
            return res.status(chunksCount ? 200 : 422).json({ success: chunksCount > 0, partial, pagesCount, chunksCount, failedPages, embeddingRequired: false,
                message: chunksCount ? (partial ? 'บันทึกข้อมูลได้บางส่วน โปรดตรวจรายการแหล่งข้อมูล' : 'บันทึกข้อมูลต้นฉบับแล้ว') : 'ยังบันทึกไม่ได้ กรุณาตรวจ URL หรือการเชื่อมต่อฐานข้อมูล' });
        }
        return res.status(404).json({ success: false, message: 'Unknown knowledge action' });
    } catch (_) {
        return res.status(503).json({ success: false, message: 'Knowledge could not be saved completely. Existing knowledge was not pre-deleted; inspect the source and retry.' });
    }
};
