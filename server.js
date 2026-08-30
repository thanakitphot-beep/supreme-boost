const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envFile = path.join(__dirname, '.env');
    try {
        const content = fs.readFileSync(envFile, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                const key = trimmed.slice(0, eqIdx).trim();
                let val = trimmed.slice(eqIdx + 1).trim();
                if (val.startsWith('"') && val.endsWith('"')) {
                    val = val.slice(1, -1);
                } else if (val.startsWith("'") && val.endsWith("'")) {
                    val = val.slice(1, -1);
                }
                if (key && val && process.env[key] === undefined) process.env[key] = val;
            }
        });
    } catch (err) {
        console.log('Local .env file not found; using the process environment.');
    }
}
if (require.main === module && process.env.NODE_ENV !== 'test') loadEnv();

const { setCorsHeaders } = require('./services/cors');
const { closeDatabase } = require('./api/_mongodb');
const { requestCounter, setDraining } = require('./api/v1/health.js');
const { checkRateLimit } = require('./services/rateLimit.js');
const { releaseInfo } = require('./services/release');
const chatHandler = require('./api/chat.js');
const crawlHandler = require('./api/crawl.js');
const adminHandler = require('./api/admin.js');
const healthHandler = require('./api/v1/health.js');

const API_HANDLERS = {
    '/api/chat': chatHandler,
    '/api/v1/chat': chatHandler,
    '/api/crawl': crawlHandler,
    '/api/handoff': require('./api/handoff.js'),
    '/api/admin': adminHandler,
    '/api/checkout': require('./api/checkout.js'),
    '/api/stripe-webhook': require('./api/stripe-webhook.js'),
    '/api/geo': require('./api/geo.js'),
    '/api/tenant': require('./api/tenant.js'),
    '/api/auth': require('./api/auth.js'),
    '/api/customer-auth': require('./api/customer-auth.js'),
    '/api/otp': require('./api/otp.js'),
    '/api/knowledge': require('./api/knowledge.js'),
    '/api/knowledge/text': require('./api/knowledge.js'),
    '/api/knowledge/crawl': require('./api/knowledge.js'),
    '/api/knowledge/search': require('./api/knowledge.js'),
    '/api/v1/health': healthHandler,
    '/api/v1/livez': require('./api/v1/livez.js'),
    '/api/v1/readyz': require('./api/v1/readyz.js'),
    '/metrics': healthHandler,
    '/api/v1/memory': require('./api/v1/memory.js')
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.md': 'text/plain; charset=utf-8'
};

const PUBLIC_STATIC_PREFIXES = ['/supreme-boost/', '/styles/'];
const PRIVATE_STATIC_PREFIXES = ['/api/', '/data/', '/docs/', '/indicator-ai/', '/k8s/', '/services/', '/src/', '/tests/'];
const PUBLIC_ROOT_FILES = new Set([
    '/robots.txt', '/sitemap.xml', '/manifest.json', '/ICON.jpg', '/INDICATOR.png',
    '/index.html', '/pricing.html', '/admin-dashboard.html', '/admin-login.html',
    '/customer-dashboard.html', '/customer-login.html'
]);
const PUBLIC_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf']);

function isPublicStaticPath(pathname) {
    if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.includes('..') || pathname.includes('\\')) return false;
    if (pathname.startsWith('/.')) return false;
    if (PRIVATE_STATIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) return false;
    if (PUBLIC_ROOT_FILES.has(pathname)) return true;
    if (PUBLIC_STATIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
        return ['.js', '.css', ...PUBLIC_IMAGE_EXTENSIONS].includes(path.extname(pathname).toLowerCase());
    }
    return false;
}

function serveStatic(req, res, pathname) {
    if (!isPublicStaticPath(pathname) && !['/', '/admin', '/login', '/pricing', '/customer-login', '/dashboard', '/customer-dashboard'].includes(pathname)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found</h1>');
        return;
    }
    let filePath = path.join(__dirname, pathname);
    if (pathname === '/') {
        filePath = path.join(__dirname, 'index.html');
    } else if (pathname === '/admin') {
        filePath = path.join(__dirname, 'admin-dashboard.html');
    } else if (pathname === '/login') {
        filePath = path.join(__dirname, 'admin-login.html');
    } else if (pathname === '/pricing') {
        filePath = path.join(__dirname, 'pricing.html');
    } else if (pathname === '/customer-login') {
        filePath = path.join(__dirname, 'customer-login.html');
    } else if (pathname === '/dashboard' || pathname === '/customer-dashboard') {
        filePath = path.join(__dirname, 'customer-dashboard.html');
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404 Not Found</h1>');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        const headers = {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        };
        if (pathname.startsWith('/supreme-boost/')) {
            headers['Access-Control-Allow-Origin'] = '*';
        }
        res.writeHead(200, headers);
        res.end(data);
    });
}

// ─── Wrap raw Node.js res to provide .status().json() Express-style API ──
function wrapRes(res) {
    const wrapper = {
        _headers: {},
        setHeader(key, value) {
            wrapper._headers[key] = value;
            try { res.setHeader(key, value); } catch {}
        },
        status(code) {
            wrapper._statusCode = code;
            return wrapper;
        },
        json(data) {
            if (!res.headersSent) {
                const headers = {
                    'Content-Type': 'application/json; charset=utf-8',
                    ...wrapper._headers
                };
                try { res.writeHead(wrapper._statusCode || 200, headers); } catch {}
            }
            try { res.end(JSON.stringify(data)); } catch {}
        },
        end(data) {
            if (!res.headersSent) {
                try { res.writeHead(wrapper._statusCode || 200, wrapper._headers); } catch {}
            }
            try { res.end(data || ''); } catch {}
        }
    };
    return wrapper;
}

function setSecurityHeaders(res, apiResponse = false) {
    res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (apiResponse) res.setHeader('Cache-Control', 'no-store');
}

// Shared handler for the Node.js server and compatible function runtimes.
async function handleRequest(req, res) {
    // ✅ FIX 8: ใช้ WHATWG URL API แทน url.parse() ที่ deprecated
    let parsedUrl;
    try {
        parsedUrl = new URL(req.url, 'http://localhost');
    } catch {
        parsedUrl = new URL('/', 'http://localhost');
    }
    const pathname = parsedUrl.pathname;
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());
    const tenantCorsRoute = ['/api/chat', '/api/v1/chat', '/api/crawl', '/api/handoff'].includes(pathname);
    const corsProtectedRoute = pathname.startsWith('/api/') || pathname === '/metrics';
    setSecurityHeaders(res, corsProtectedRoute);

    // Request tracing uses a bounded caller ID or a cryptographically random ID.
    const callerRequestId = String(req.headers['x-request-id'] || '');
    req.id = /^[A-Za-z0-9._:-]{1,128}$/u.test(callerRequestId) ? callerRequestId : crypto.randomUUID();
    res.setHeader('X-Request-ID', req.id);
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
    if (requestCounter) requestCounter.total++;
    const startedAt = process.hrtime.bigint();
    if (typeof res.once === 'function') {
        res.once('finish', () => {
            const status = Number(res.statusCode || 200);
            if (requestCounter) requestCounter[status < 500 ? 'success' : 'error']++;
            if (process.env.NODE_ENV !== 'test') {
                const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
                console.log(JSON.stringify({
                    event: 'http_request',
                    request_id: req.id,
                    method: req.method,
                    path: pathname,
                    status,
                    duration_ms: Number(durationMs.toFixed(1)),
                    release: releaseInfo().commit
                }));
            }
        });
    }

    if (!setCorsHeaders(req, res) && req.headers.origin && corsProtectedRoute && !tenantCorsRoute) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Origin is not allowed' }));
        return;
    }

    if (req.method === 'OPTIONS' && corsProtectedRoute && !tenantCorsRoute) {
        res.writeHead(204);
        res.end();
        return;
    }

    const routeType = pathname.includes('/chat')
        ? 'chat'
        : ['/api/auth', '/api/customer-auth', '/api/otp'].includes(pathname)
            ? 'auth'
            : pathname === '/api/admin'
                ? 'admin'
                : pathname === '/api/checkout'
                    ? 'billing'
                    : 'api';
    const probeRoute = ['/api/v1/livez', '/api/v1/readyz'].includes(pathname);
    const rateLimitedRoute = pathname.startsWith('/api/') || pathname === '/metrics';
    if (rateLimitedRoute && !probeRoute) {
        if (!await checkRateLimit(req, wrapRes(res), routeType)) {
            return;
        }
        req._rateLimitChecked = true;
    }

    const handler = API_HANDLERS[pathname];
    if (handler) {
        const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
        req.body = body;
        return handler(req, wrapRes(res));
    }

    // --- Serve static files and extensionless routes for local testing ---
    if (pathname === '/' || pathname === '/admin' || pathname === '/login' || pathname === '/pricing' || pathname === '/customer-login' || pathname === '/dashboard' || pathname === '/customer-dashboard') {
        return serveStatic(req, res, pathname);
    }
    // Direct .html access
    if (pathname === '/admin-login.html') {
        return serveStatic(req, res, '/login');
    }

    const ext = path.extname(pathname).toLowerCase();
    if (ext && MIME[ext] && isPublicStaticPath(pathname)) return serveStatic(req, res, pathname);

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}

// Export the request handler for tests and compatible function runtimes.
module.exports = handleRequest;
module.exports.__isPublicStaticPath = isPublicStaticPath;
module.exports.__setSecurityHeaders = setSecurityHeaders;

// ─── Local dev: create HTTP server ──
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    const HOSTNAME = '0.0.0.0';

    const server = http.createServer((req, res) => {
        const chunks = [];
        let bodySize = 0;
        let bodyTooLarge = false;
        req.on('data', chunk => {
            bodySize += chunk.length;
            if (bodySize > 1_600_000) {
                bodyTooLarge = true;
                return;
            }
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on('end', () => {
            if (bodyTooLarge) {
                res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Request body too large' }));
                return;
            }
            req.rawBody = Buffer.concat(chunks);
            try { req.body = JSON.parse(req.rawBody.toString('utf8')); }
            catch { req.body = {}; }
            Promise.resolve(handleRequest(req, res)).catch(() => {
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Internal server error' }));
                }
            });
        });
    });

    server.listen(PORT, HOSTNAME, () => {
        console.log(`\n✅ INDICATOR WEB CHAT Server is running!`);
        console.log(`📍 Open: http://localhost:${PORT}`);
        console.log(`📍 API:  http://localhost:${PORT}/api/chat`);
        const agentMode = String(process.env.INDICATOR_AGENT_MODE || 'owned').toLowerCase();
        console.log(`\n🧠 INDICATOR Agent Mode: ${agentMode === 'legacy' ? 'legacy provider pipeline' : 'owned provider-independent agent'}`);
        console.log(`🔑 OpenAI:  ${process.env.OPENAI_API_KEY  ? '✅' : '❌ Missing'}`);
        console.log(`🔑 Gemini:  ${process.env.GEMINI_API_KEY  ? '✅' : '❌ Missing'}`);
        console.log(`🔑 Groq:    ${process.env.GROQ_API_KEY    ? '✅' : '❌ Missing'}`);
        console.log(`🔑 Cohere:  ${process.env.COHERE_API_KEY  ? '✅' : '❌ Missing'}`);
        console.log(`\nPress Ctrl+C to stop\n`);

    });

    let shuttingDown = false;
    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        setDraining(true);
        server.close(() => closeDatabase().catch(() => {}).finally(() => process.exit(0)));
        setTimeout(() => process.exit(1), 30_000).unref();
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
}
