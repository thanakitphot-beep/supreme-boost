// OMEGA-JARVIS v3.0.0 — SSRF Protection Service
// Validates URLs to prevent Server-Side Request Forgery

function isSafeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    
    try {
        const url = new URL(urlStr);
        
        // Block non-HTTP protocols (e.g., file://, gopher://, dict://)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

        const hostname = url.hostname.toLowerCase();
        
        // Block exact IPs (IPv4 and IPv6) if they correspond to internal ranges
        // Note: For robust protection, DNS resolution needs to be checked, but this catches basic attacks.
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || 
                        hostname.startsWith('10.') || hostname.startsWith('192.168.');

        if (isLocal) return false;
        
        if (hostname.startsWith('169.254.')) return false; // AWS metadata IP
        
        // Block internal metadata domains
        if (hostname.includes('metadata.google.internal')) return false;
        if (hostname.includes('internal') && hostname.endsWith('.local')) return false;

        return true;
    } catch (e) {
        return false;
    }
}

module.exports = { isSafeUrl };
