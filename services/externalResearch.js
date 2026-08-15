'use strict';

const { isSafeUrl } = require('./ssrfBlocker');

const TIMEOUT_MS = 8000;

function endpoint() {
    const url = String(process.env.INDICATOR_RESEARCH_URL || '').trim();
    // The endpoint is deployment-owned configuration, never taken from a
    // browser request.  Reuse SSRF validation and require HTTPS in production.
    if (!url || !isSafeUrl(url)) return '';
    if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) return '';
    return url;
}

function configured() {
    return Boolean(endpoint() && String(process.env.INDICATOR_RESEARCH_API_KEY || '').trim());
}

function normalizeResults(body) {
    const items = Array.isArray(body && body.results) ? body.results : [];
    return items.map(item => ({
        title: String(item && item.title || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        snippet: String(item && (item.snippet || item.content) || '').replace(/\s+/g, ' ').trim().slice(0, 420),
        url: String(item && item.url || '').trim().slice(0, 500)
    })).filter(item => item.title && item.snippet && /^https?:\/\//i.test(item.url) && isSafeUrl(item.url)).slice(0, 3);
}

async function research(request) {
    if (!configured() || !request || !request.subject || !request.question) return { results: [] };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(endpoint(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.INDICATOR_RESEARCH_API_KEY}`
            },
            body: JSON.stringify({
                query: `${String(request.subject).slice(0, 180)} ${String(request.question).slice(0, 180)}`,
                maxResults: 3,
                safeSearch: true
            }),
            signal: controller.signal
        });
        if (!response.ok) return { results: [] };
        return { results: normalizeResults(await response.json()) };
    } catch (_) {
        return { results: [] };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { research, configured };
