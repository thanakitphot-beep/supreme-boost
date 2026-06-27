const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const socketIo = require('socket.io'); // Added socket.io

// ─── Global System Logs Interceptor ───
global.systemLogs = [];
const MAX_LOGS = 200;
let io = null; // Added io reference

function addLog(type, args) {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    const logEntry = {
        timestamp: new Date().toISOString(),
        type: type,
        message: message
    };
    global.systemLogs.push(logEntry);
    if (global.systemLogs.length > MAX_LOGS) {
        global.systemLogs.shift();
    }
    // Emit log via socket
    if (io) io.emit('system-log', logEntry);
}

const originalLog = console.log;
console.log = function(...args) {
    addLog('INFO', args);
    originalLog.apply(console, args);
};

const originalError = console.error;
console.error = function(...args) {
    addLog('ERROR', args);
    originalError.apply(console, args);
};

const originalWarn = console.warn;
console.warn = function(...args) {
    addLog('WARN', args);
    originalWarn.apply(console, args);
};
// ──────────────────────────────────────

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
                if (key && val) process.env[key] = val;
            }
        });
    } catch (err) {
        console.warn('⚠️  .env file not found — API Keys will not be available.');
    }
}
loadEnv();

const chatModule = require('./api/chat.js');
const chatHandler = chatModule;
const crawlHandler = chatModule.crawlHandler;
const adminHandler = require('./api/admin.js');

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

function serveStatic(req, res, pathname) {
    let filePath = path.join(__dirname, pathname);
    if (pathname === '/') {
        filePath = path.join(__dirname, 'index.html');
    } else if (pathname === '/admin') {
        filePath = path.join(__dirname, 'admin-dashboard.html');
    } else if (pathname === '/login') {
        filePath = path.join(__dirname, 'admin-login.html');
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404 Not Found</h1>');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });
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
                    'Access-Control-Allow-Origin': '*',
                    ...wrapper._headers
                };
                try { res.writeHead(wrapper._statusCode || 200, headers); } catch {}
            }
            try { res.end(JSON.stringify(data)); } catch {}
        },
        end(data) {
            if (!res.headersSent) {
                try { res.writeHead(wrapper._statusCode || 200, { 'Access-Control-Allow-Origin': '*', ...wrapper._headers }); } catch {}
            }
            try { res.end(data || ''); } catch {}
        }
    };
    return wrapper;
}

// ─── Shared handler used by both Vercel Lambda and local server ──
function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    const API_HANDLERS = {
        '/api/chat': chatHandler,
        '/api/crawl': crawlHandler,
        '/api/admin': adminHandler,
        '/api/settings': require('./api/settings.js'),
        '/api/logs': require('./api/logs.js'),
        '/api/auth': require('./api/auth.js'),
        '/api/customer-auth': require('./api/customer-auth.js'),
        '/api/knowledge': require('./api/knowledge.js'),
        '/api/knowledge/crawl': require('./api/knowledge.js'),
        '/api/knowledge/search': require('./api/knowledge.js')
    };

    const handler = API_HANDLERS[pathname];
    if (handler) {
        const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
        req.body = body;
        return handler(req, wrapRes(res));
    }

    serveStatic(req, res, pathname);
}

// ─── On Vercel, export the handler ──
module.exports = handleRequest;

// ─── Local dev: create HTTP server ──
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    const HOSTNAME = '0.0.0.0';

    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
            try { req.body = JSON.parse(body); }
            catch { req.body = {}; }
            handleRequest(req, res);
        });
    });

    // Initialize socket.io
    io = socketIo(server);
    io.on('connection', (socket) => {
        console.log('✅ Admin Dashboard connected via WebSocket');
        // Send initial logs
        socket.emit('initial-logs', global.systemLogs);
    });
    global.io = io;

    server.listen(PORT, HOSTNAME, () => {
        console.log(`\n✅ INDICATOR WEB CHAT Server is running!`);
        console.log(`📍 Open: http://localhost:${PORT}`);
        console.log(`📍 API:  http://localhost:${PORT}/api/chat`);
        console.log(`\n🔑 Gemini Key: ${process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ Missing'}`);
        console.log(`🔑 Groq Key:   ${process.env.GROQ_API_KEY ? '✅ Loaded' : '⚪ Not set'}`);
        console.log(`🔑 Cohere Key: ${process.env.COHERE_API_KEY ? '✅ Loaded' : '⚪ Not set'}`);
        console.log(`\nPress Ctrl+C to stop\n`);
    });
}
