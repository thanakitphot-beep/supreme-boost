const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load .env file manually
function loadEnv() {
    const envFile = path.join(__dirname, '.env');
    try {
        const content = fs.readFileSync(envFile, 'utf8');
        content.split('\n').forEach(line => {
            const [key, val] = line.split('=');
            if (key && val) {
                process.env[key.trim()] = val.trim();
            }
        });
    } catch (err) {
        console.warn('.env file not found or error reading');
    }
}

loadEnv();

console.log('Server starting...');

const PORT = 3000;
const HOSTNAME = '127.0.0.1';

// Simple API handler
async function handleApiChat(req, res, body) {
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    
    try {
        const data = JSON.parse(body);
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'GEMINI_API_KEY not set', reply: 'API Key not configured' }));
            return;
        }
        
        // Call Gemini API
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: 'You are Supreme AI, a helpful shop assistant. Respond in Thai when the user asks in Thai.' }]
                },
                contents: [{
                    role: 'user',
                    parts: [{ text: data.prompt }]
                }],
                generationConfig: {
                    temperature: 0.45,
                    topP: 0.9,
                    maxOutputTokens: 900,
                    responseMimeType: 'application/json'
                }
            })
        });
        
        const geminiData = await response.json();
        const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate a response';
        
        res.end(JSON.stringify({ reply, cssCommand: '' }));
    } catch (error) {
        console.error('API Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message, reply: 'Error calling AI' }));
    }
}

// Static file handler
function handleStaticFile(req, res, pathname) {
    let filePath = path.join(__dirname, pathname);
    
    // Default to index.html for root
    if (pathname === '/') {
        filePath = path.join(__dirname, 'index.html');
    }
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>');
            return;
        }
        
        const ext = path.extname(filePath);
        let contentType = 'text/html';
        if (ext === '.js') contentType = 'application/javascript';
        if (ext === '.css') contentType = 'text/css';
        if (ext === '.json') contentType = 'application/json';
        
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
}

// Main server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }
    
    // API endpoint
    if (pathname === '/api/chat') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => handleApiChat(req, res, body));
        } else {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        return;
    }
    
    // Static files
    handleStaticFile(req, res, pathname);
});

server.listen(PORT, HOSTNAME, () => {
    console.log(`\n✅ Supreme Boost Dev Server Running`);
    console.log(`📍 Open: http://${HOSTNAME}:${PORT}`);
    console.log(`\nPress Ctrl+C to stop\n`);
});
