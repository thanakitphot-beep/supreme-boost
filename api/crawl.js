// Crawl Handler Service

function parseBody(body) {
    if (!body) return {};
    if (typeof body === "string") { try { return JSON.parse(body); } catch { return {}; } }
    return body;
}

module.exports = async function crawlHandler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const body = parseBody(req.body);
        const keywords = (body.keywords || []).filter(k => typeof k === "string" && k.length > 1).slice(0, 20);
        const rootUrl = typeof body.rootUrl === "string" && body.rootUrl.indexOf("http") === 0 ? body.rootUrl : null;
        const seedUrls = (body.urls || []).filter(u => typeof u === "string" && u.indexOf("http") === 0).slice(0, 30);
        
        if (!keywords.length || (!rootUrl && !seedUrls.length)) return res.status(200).json({ results: [] });

        const MAX_PAGES = 50, MAX_DEPTH = 2, TIMEOUT = 5000;
        const seen = new Set(), pages = [], results = [];

        function isHtmlUrl(url) {
            try { 
                const ext = new URL(url).pathname.split(".").pop().toLowerCase(); 
                return ["jpg", "jpeg", "png", "gif", "webp", "svg", "ico", "css", "js", "json", "xml", "pdf", "zip", "mp4", "mp3", "woff", "woff2", "ttf", "eot"].indexOf(ext) === -1; 
            } catch { return false; }
        }

        function extractInternalLinks(html, baseUrl) {
            const links = [], regex = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi;
            let match;
            while ((match = regex.exec(html)) !== null) {
                try {
                    const resolved = new URL(match[1], baseUrl).href;
                    const parsed = new URL(resolved);
                    const base = new URL(baseUrl);
                    if (parsed.origin === base.origin && isHtmlUrl(resolved) && !seen.has(resolved)) {
                        if (!/(admin|login|password|secure|backend|dashboard|checkout|auth)/i.test(parsed.pathname)) {
                            links.push(resolved);
                        }
                    }
                } catch { }
            }
            return links;
        }

        function extractText(html) { 
            return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
                       .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
                       .replace(/<[^>]+>/g, " ")
                       .replace(/&[^;]+;/g, " ")
                       .replace(/\s+/g, " ").trim(); 
        }

        function scorePage(text, html, url) {
            const lower = text.toLowerCase();
            let matchCount = 0, firstIdx = Infinity;
            for (let i = 0; i < keywords.length; i++) { 
                const idx = lower.indexOf(keywords[i]); 
                if (idx !== -1) { 
                    matchCount++; 
                    if (idx < firstIdx) firstIdx = idx; 
                } 
            }
            if (matchCount === 0) return null;
            
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : url;
            const start = Math.max(0, firstIdx - 80);
            return { url: url, title: title, score: matchCount, snippet: text.slice(start, firstIdx + 260).trim() };
        }

        async function fetchPage(url) {
            if (seen.has(url)) return null;
            seen.add(url);
            try {
                const ctrl = new AbortController();
                const tmr = setTimeout(() => ctrl.abort(), TIMEOUT);
                const res = await fetch(url, { signal: ctrl.signal });
                clearTimeout(tmr);
                if (!res.ok) return null;
                const html = await res.text();
                const text = extractText(html);
                const scored = scorePage(text, html, url);
                if (scored) results.push(scored);
                return html;
            } catch { return null; }
        }

        const queue = [];
        if (rootUrl && !seen.has(rootUrl)) queue.push({ url: rootUrl, depth: 0 });
        for (let ui = 0; ui < seedUrls.length; ui++) { 
            if (!seen.has(seedUrls[ui])) queue.push({ url: seedUrls[ui], depth: 0 }); 
        }

        while (queue.length > 0 && pages.length < MAX_PAGES) {
            const item = queue.shift();
            if (seen.has(item.url)) continue;
            
            const html = await fetchPage(item.url);
            if (html === null) continue;
            pages.push(item.url);
            
            if (item.depth < MAX_DEPTH) {
                const links = extractInternalLinks(html, item.url);
                for (let li = 0; li < links.length; li++) {
                    if (!seen.has(links[li]) && queue.length + pages.length < MAX_PAGES) {
                        queue.push({ url: links[li], depth: item.depth + 1 });
                    }
                }
            }
        }

        results.sort((a, b) => b.score - a.score);
        return res.status(200).json({ results: results.slice(0, 8) });
    } catch (error) {
        console.error("Crawl error:", error);
        return res.status(200).json({ results: [] });
    }
};
