const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');
const { isSafeFetchUrl, isSafeUrl } = require('../services/ssrfBlocker');

const MAX_HTML_BYTES = 500_000;
const MAX_PAGES = 20;
const MAX_DEPTH = 2;
const TIMEOUT_MS = 5000;

function parseBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch (_) { return {}; }
    }
    return body;
}

function isHtmlUrl(url) {
    try {
        const ext = new URL(url).pathname.split('.').pop().toLowerCase();
        return !['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'css', 'js', 'json', 'xml', 'pdf', 'zip', 'mp4', 'mp3', 'woff', 'woff2', 'ttf', 'eot'].includes(ext);
    } catch (_) {
        return false;
    }
}

function extractText(html) {
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[^;]+;/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

module.exports = async function crawlHandler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!req._rateLimitChecked && !checkRateLimit(req, res, 'api')) return;

    try {
        const body = parseBody(req.body);
        const keywords = (Array.isArray(body.keywords) ? body.keywords : [])
            .filter(keyword => typeof keyword === 'string' && keyword.trim().length > 1)
            .map(keyword => keyword.trim().toLowerCase()).slice(0, 20);
        const rootUrl = typeof body.rootUrl === 'string' && isSafeUrl(body.rootUrl) ? body.rootUrl : null;
        if (!keywords.length || !rootUrl || !await isSafeFetchUrl(rootUrl)) return res.status(200).json({ results: [] });

        const root = new URL(rootUrl);
        const seen = new Set();
        const results = [];
        const queue = [{ url: root.href, depth: 0 }];

        for (const candidate of (Array.isArray(body.urls) ? body.urls : []).slice(0, 30)) {
            if (typeof candidate !== 'string' || !isHtmlUrl(candidate) || !isSafeUrl(candidate)) continue;
            try {
                const url = new URL(candidate);
                if (url.origin === root.origin && !seen.has(url.href)) queue.push({ url: url.href, depth: 0 });
            } catch (_) { }
        }

        function extractInternalLinks(html, baseUrl) {
            const links = [];
            const regex = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi;
            let match;
            while ((match = regex.exec(html)) !== null) {
                try {
                    const url = new URL(match[1], baseUrl);
                    if (url.origin !== root.origin || !isHtmlUrl(url.href) || seen.has(url.href)) continue;
                    if (/(admin|login|password|secure|backend|dashboard|checkout|auth)/i.test(url.pathname)) continue;
                    links.push(url.href);
                } catch (_) { }
            }
            return links;
        }

        function scorePage(text, html, url) {
            const lower = text.toLowerCase();
            let matchCount = 0;
            let firstIndex = Infinity;
            for (const keyword of keywords) {
                const index = lower.indexOf(keyword);
                if (index !== -1) {
                    matchCount++;
                    firstIndex = Math.min(firstIndex, index);
                }
            }
            if (!matchCount) return null;
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const start = Math.max(0, firstIndex - 80);
            return {
                url,
                title: titleMatch ? titleMatch[1].trim() : url,
                score: matchCount,
                snippet: text.slice(start, firstIndex + 260).trim()
            };
        }

        async function fetchPage(url) {
            if (seen.has(url) || !await isSafeFetchUrl(url)) return null;
            seen.add(url);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
            try {
                const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
                if (!response.ok || response.status >= 300 && response.status < 400) return null;
                const contentType = String(response.headers.get('content-type') || '').toLowerCase();
                const declaredLength = Number(response.headers.get('content-length') || 0);
                if (!contentType.includes('text/html') || declaredLength > MAX_HTML_BYTES) return null;
                const html = await response.text();
                if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) return null;
                const text = extractText(html);
                const scored = scorePage(text, html, url);
                if (scored) results.push(scored);
                return html;
            } catch (_) {
                return null;
            } finally {
                clearTimeout(timer);
            }
        }

        let attempts = 0;
        while (queue.length > 0 && attempts < MAX_PAGES) {
            const item = queue.shift();
            if (seen.has(item.url)) continue;
            attempts++;
            const html = await fetchPage(item.url);
            if (!html || item.depth >= MAX_DEPTH) continue;
            for (const url of extractInternalLinks(html, item.url)) {
                if (!seen.has(url) && queue.length + attempts < MAX_PAGES) queue.push({ url, depth: item.depth + 1 });
            }
        }

        results.sort((left, right) => right.score - left.score);
        return res.status(200).json({ results: results.slice(0, 8) });
    } catch (_) {
        return res.status(200).json({ results: [] });
    }
};
