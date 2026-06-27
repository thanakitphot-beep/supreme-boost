const db = require('./db.js');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const auth = require('./auth.js');
    const authHeader = req.headers['authorization'];
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }
    if (!auth.verifyToken(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
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
        const result = await db.saveSettings(body);
        if (!result) {
            return res.status(500).json({ success: false, message: 'Failed to save settings' });
        }
        
        console.log(`[SETTINGS] System settings updated by Admin`);
        return res.status(200).json({ success: true, data: body });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
};
