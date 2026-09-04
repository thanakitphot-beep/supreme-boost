const { checkRateLimit } = require('../services/rateLimit');
const { isSafeFetchUrl, isSafeUrl } = require('../services/ssrfBlocker');
const { applyPluginCors, authorizePluginRequest } = require('../services/tenantAccess');
const { normalizeHumanText, fuzzyPhraseScore } = require('../services/languageUnderstanding');

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

function extractPageLabels(html) {
    const labels = [];
    const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? extractText(titleMatch[1]) : '';
    if (title) labels.push(title);
    const headingRegex = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
    let match;
    while ((match = headingRegex.exec(String(html || ''))) && labels.length < 20) {
        const heading = extractText(match[1]);
        if (heading) labels.push(heading);
    }
    return { title, labels };
}

function scorePageForQuery({ text, html, url, keywords }) {
    const normalizedText = normalizeHumanText(text);
    const normalizedKeywords = [...new Set((keywords || []).map(normalizeHumanText).filter(keyword => keyword.length > 1))];
    if (!normalizedText || !normalizedKeywords.length) return null;

    const { title, labels } = extractPageLabels(html);
    const normalizedLabels = normalizeHumanText(labels.join(' '));
    let directContentHits = 0;
    let directLabelHits = 0;
    let firstIndex = Infinity;
    for (const keyword of normalizedKeywords) {
        const contentIndex = normalizedText.indexOf(keyword);
        if (contentIndex !== -1) {
            directContentHits++;
            firstIndex = Math.min(firstIndex, contentIndex);
        }
        if (normalizedLabels.includes(keyword)) directLabelHits++;
    }

    const fuzzyScores = normalizedKeywords.map(keyword => fuzzyPhraseScore(keyword, labels));
    const fuzzyLabelScore = fuzzyScores.length ? Math.max(...fuzzyScores) : 0;
    if (!directContentHits && fuzzyLabelScore < 46) return null;

    const coverage = directContentHits / normalizedKeywords.length;
    const score = directContentHits * 28
        + directLabelHits * 95
        + Math.round(coverage * 70)
        + fuzzyLabelScore;
    const start = Number.isFinite(firstIndex) ? Math.max(0, firstIndex - 90) : 0;
    const snippet = text.slice(start, start + 360).trim();
    return {
        url,
        title: title || url,
        score,
        confidence: directLabelHits > 0 || fuzzyLabelScore >= 56 ? 'high' : coverage >= 0.5 ? 'medium' : 'low',
        matchedTerms: normalizedKeywords.filter(keyword => normalizedText.includes(keyword)),
        snippet
    };
}

async function crawlHandler(req, res) {
    if (!await applyPluginCors(req, res)) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!req._rateLimitChecked && !checkRateLimit(req, res, 'api')) return;

    try {
        const body = parseBody(req.body);
        const access = await authorizePluginRequest({ apiKey: body.apiKey, origin: req.headers.origin });
        if (access.error) return res.status(403).json({ error: access.error });
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
                url.hash = '';
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
                    url.hash = '';
                    if (url.origin !== root.origin || !isHtmlUrl(url.href) || seen.has(url.href)) continue;
                    if (/(admin|login|password|secure|backend|dashboard|checkout|auth)/i.test(url.pathname)) continue;
                    links.push(url.href);
                } catch (_) { }
            }
            return links;
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
                const scored = scorePageForQuery({ text, html, url, keywords });
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
}

module.exports = crawlHandler;
module.exports.scorePageForQuery = scorePageForQuery;
