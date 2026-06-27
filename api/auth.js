const crypto = require('crypto');

function verifyToken(token) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'indicator2026';
    if (!token) return false;
    
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    
    const [timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;
    
    // Check expiry (24h = 86400000 ms)
    const now = Date.now();
    if (now - timestamp > 24 * 60 * 60 * 1000) return false;
    
    // Verify signature
    const hmac = crypto.createHmac('sha256', adminPassword);
    hmac.update(String(timestamp));
    const expectedSignature = hmac.digest('hex');
    
    return signature === expectedSignature;
}

module.exports = async function handler(req, res) {
    // Set CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const adminPassword = process.env.ADMIN_PASSWORD || 'indicator2026';

    // POST: Login
    if (req.method === 'POST') {
        const body = req.body || {};
        if (body.password === adminPassword) {
            const timestamp = Date.now();
            const hmac = crypto.createHmac('sha256', adminPassword);
            hmac.update(String(timestamp));
            const signature = hmac.digest('hex');
            const token = `${timestamp}.${signature}`;
            
            return res.status(200).json({ success: true, token });
        } else {
            return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
        }
    }

    // GET: Verify
    if (req.method === 'GET') {
        const authHeader = req.headers['authorization'];
        let token = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else if (req.url) {
            // Also check query param if needed
            const urlParts = req.url.split('?');
            if (urlParts.length > 1) {
                const params = new URLSearchParams(urlParts[1]);
                token = params.get('token') || '';
            }
        }

        if (verifyToken(token)) {
            return res.status(200).json({ success: true, valid: true });
        } else {
            return res.status(401).json({ success: false, valid: false, message: 'Token หมดอายุ หรือไม่ถูกต้อง' });
        }
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
};

// Export helper for other routes
module.exports.verifyToken = verifyToken;
