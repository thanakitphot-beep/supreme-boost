'use strict';
const crypto = require('node:crypto');
const cheerio = require('cheerio');
const { maskPII } = require('./safety');
const { isSafeFetchUrl } = require('./ssrfBlocker');
const MAX_TEXT = 60000, MAX_BYTES = 512 * 1024;
const PRIVATE_PATH = /(?:^|\/)(?:admin[^/]*|login|logout|sign[\-_]?in|account|profile|dashboard|checkout|payment|billing|auth|oauth|password|reset)(?:[/.]|$)/iu;
function publicUrl(value, origin) {
    try {
        const url = new URL(value, origin);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || PRIVATE_PATH.test(decodeURIComponent(url.pathname))) return null;
        if (origin && url.origin !== origin) return null;
        url.hash = '';
        return url.href;
    } catch (_) { return null; }
}
function cleanSource(value) {
    return maskPII(String(value || '').replace(/\r\n?/g, '\n'))
        .replace(/\b(?:sk[-_]|AIza)[a-zA-Z0-9_-]{16,}\b/g, '[REDACTED_SECRET]')
        .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED_SECRET]')
        .replace(/\bBearer\s+[a-zA-Z0-9._-]{12,}/gi, '[REDACTED_SECRET]').trim();
}
function splitKnowledge(value, size = 900, overlap = 80) {
    const text = cleanSource(value);
    if (!text || text.length > MAX_TEXT) throw new Error('Knowledge text must contain 1–60000 characters');
    const chunks = [];
    for (let offset = 0; offset < text.length;) {
        let end = Math.min(offset + size, text.length);
        if (end < text.length) {
            const breakAt = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
            if (breakAt > offset + size / 2) end = breakAt;
        }
        const part = text.slice(offset, end).trim();
        if (part) chunks.push(part);
        if (end === text.length) break;
        offset = Math.max(offset + 1, end - overlap);
    }
    return chunks;
}
function digest(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
async function fetchPublicPage(value, origin, deadlineAt) {
    let url = publicUrl(value, origin);
    if (!url) throw new Error('Only public same-origin pages without query parameters are allowed');
    for (let redirects = 0; redirects <= 3; redirects++) {
        if (Date.now() >= deadlineAt || !await isSafeFetchUrl(url)) throw new Error('Public source is unavailable');
        const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'INDICATOR-Knowledge/1.0', Accept: 'text/html' }, signal: AbortSignal.timeout(Math.max(1, Math.min(7000, deadlineAt - Date.now()))) });
        if ([301, 302, 303, 307, 308].includes(res.status)) {
            const next = publicUrl(new URL(res.headers.get('location') || '', url).href, origin);
            await res.body?.cancel();
            if (!next) throw new Error('Redirect is outside the public source');
            url = next; continue;
        }
        if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) { await res.body?.cancel(); throw new Error('Source did not return a public HTML page'); }
        if (Number(res.headers.get('content-length')) > MAX_BYTES) { await res.body?.cancel(); throw new Error('Source page is too large'); }
        const reader = res.body.getReader();
        const buffers = []; let bytes = 0;
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done) break;
                bytes += part.value.length;
                if (bytes > MAX_BYTES) throw new Error('Source page is too large');
                buffers.push(Buffer.from(part.value));
            }
        } finally { await reader.cancel().catch(() => {}); }
        return { url, html: Buffer.concat(buffers).toString('utf8') };
    }
    throw new Error('Too many redirects');
}
function extractPage(html, url) {
    const $ = cheerio.load(html);
    const title = cleanSource($('title').text() || $('h1').first().text()).slice(0, 180);
    const origin = new URL(url).origin;
    const links = [...new Set($('a[href]').toArray().map(el => {
        try { return publicUrl(new URL($(el).attr('href'), url).href, origin); } catch (_) { return null; }
    }).filter(Boolean))].filter(link => link !== url).slice(0, 7);
    $('script,style,nav,header,footer,noscript,svg,iframe,form,input,textarea,button,[hidden],[aria-hidden="true"],[role="dialog"],.modal').remove();
    $('h1,h2,h3,h4,p,li,br,section,article').append('\n');
    const content = cleanSource(($('main').length ? $('main') : $('body')).text().replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n'));
    if (content.length > MAX_TEXT) throw new Error('Source text is too large; import a smaller page');
    return { title, content, links };
}
async function storeSource(db, { tenantId, url, title, content, sourceType }, maxChunks = 100) {
    const cleaned = cleanSource(content), chunks = splitKnowledge(cleaned);
    if (chunks.length > maxChunks) throw new Error('Source exceeds the remaining chunk limit');
    let saved = 0;
    for (let index = 0; index < chunks.length; index++) {
        const row = await db.upsertKnowledge({ tenantId, url, title: cleanSource(title || 'Owner supplied knowledge').slice(0, 180),
            content: chunks[index], embedding: null, chunkIndex: index, sourceType, sourceHash: digest(cleaned) });
        if (!row) throw new Error('Knowledge storage unavailable');
        saved++;
    }
    await db.retireKnowledgeAfterIndex(tenantId, url, chunks.length);
    return saved;
}
module.exports = { publicUrl, cleanSource, splitKnowledge, digest, fetchPublicPage, extractPage, storeSource };
