// OMEGA-JARVIS v3.0.0 — CORS Allowlist Service
// Restricts API access to verified domains.
// CORS_ALLOWED_ORIGINS is intentionally read at call-time (not module load)
// so that runtime env changes and tests work correctly.

function getAllowedDomains() {
    const configured = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    try {
        const renderUrl = new URL(String(process.env.RENDER_EXTERNAL_URL || ''));
        if (renderUrl.protocol === 'https:' || renderUrl.protocol === 'http:') configured.push(renderUrl.origin);
    } catch (_) { }
    return [...new Set(configured)];
}

function strictCorsEnabled() {
    return process.env.ENFORCE_STRICT_CORS === 'true' || process.env.NODE_ENV === 'production';
}

function isOriginAllowed(origin) {
    if (!origin) return true;
    if (!strictCorsEnabled()) return true;
    return getAllowedDomains().includes(origin);
}

function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    const allowed = isOriginAllowed(origin);

    // Requests without Origin are non-browser clients such as health checks.
    // Do not emit a wildcard header in production; only reflect allowlisted origins.
    if (origin && allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    if (allowed) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
    }
    return allowed;
}

module.exports = { getAllowedDomains, isOriginAllowed, setCorsHeaders };
