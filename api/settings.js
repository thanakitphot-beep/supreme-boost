const db = require("./_db.js");
const { setCorsHeaders } = require('../services/cors');

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ success: false, message: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();

    res.setHeader('Content-Type', 'application/json');

    const auth = require("./_auth.js");
    const authHeader = req.headers['authorization'];
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }
    
    if (!auth.verifyToken(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const decoded = auth.verifyJWT(token);
    const isGlobalAdmin = decoded?.role === 'admin' || auth.verifyToken(token) && !decoded;

    if (req.method === 'POST' && !isGlobalAdmin) {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    }

    const method = req.method;

    if (method === 'GET') {
        let settings = await db.getSettings();
        if (!settings) {
            settings = {
                systemModel: "gemini-2.5-flash",
                systemPrompt: "You are a helpful assistant.",
                themeColor: "cyber-calm",
                temperature: 0.2
            };
        }
        return res.status(200).json({ success: true, data: settings });
    }

    if (method === 'POST') {
        const body = req.body || {};
        const result = await db.saveSettings('global', body);
        if (!result) {
            return res.status(500).json({ success: false, message: 'Failed to save settings' });
        }
        
        console.log(`[SETTINGS] System settings updated by Admin`);
        return res.status(200).json({ success: true, data: body });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
};
