const db = require('./db.js');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await db.getLogs(limit);
        return res.status(200).json({ success: true, data: logs });
    } catch (err) {
        console.error('logs handler error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
};
