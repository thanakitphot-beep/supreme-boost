// OMEGA-JARVIS v3.0.0 — CORS Allowlist Service
// Restricts API access to verified domains.
// CORS_ALLOWED_ORIGINS is intentionally read at call-time (not module load)
// so that runtime env changes and tests work correctly.

function getAllowedDomains() {
    return (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    
    let allowOrigin = '*'; // Default fallback if not strict

    if (process.env.ENFORCE_STRICT_CORS === 'true') {
        const allowedDomains = getAllowedDomains();
        if (origin) {
            // Check against global allowlist
            if (allowedDomains.includes(origin)) {
                allowOrigin = origin;
            } else {
                // If not in global allowlist, we would normally check tenant DB here.
                // For Phase 0, if strict is on and not in list, we block.
                // We'll set it to a dummy value so the browser blocks it.
                allowOrigin = 'null';
            }
        } else {
            // Non-browser request (e.g. curl).
            allowOrigin = '*';
        }
    } else {
        // Warning if strict CORS is disabled in production
        if (process.env.NODE_ENV === 'production' && !global.__corsWarned) {
            console.warn('[SECURITY] ENFORCE_STRICT_CORS is false. API is open to all origins.');
            global.__corsWarned = true;
        }
    }

    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
}

module.exports = { setCorsHeaders };
