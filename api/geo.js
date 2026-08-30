const { setCorsHeaders } = require('../services/cors');
const { checkRateLimit, requestIp } = require('../services/rateLimit');
const { isIP } = require('node:net');

function cleanGeoText(value, max) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, max);
}

module.exports = async function geoHandler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    if (!req._rateLimitChecked && !await checkRateLimit(req, res, 'api')) return;

    let ip = String(requestIp(req) || '').replace(/^::ffff:/u, '');
    
    // For local testing, use a default fallback IP if it's localhost (e.g. Thailand)
    if (process.env.NODE_ENV !== 'production' && (!isIP(ip) || ip === '::1' || ip === '127.0.0.1')) {
        ip = '171.97.100.1'; // Example Thai IP for testing
    }
    res.setHeader('Cache-Control', 'private, no-store');
    if (!isIP(ip)) return res.status(200).json({ country: 'Unknown', countryCode: '', region: 'Unknown', city: 'Unknown', timezone: 'UTC' });

    try {
        const url = `https://ipwho.is/${encodeURIComponent(ip)}`;
        
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        
        if (!response.ok) throw new Error("Geo API error");
        const data = await response.json();
        
        if (data.success !== true) {
            throw new Error("Geo API failed");
        }
        
        return res.status(200).json({
            country: cleanGeoText(data.country, 100),
            countryCode: /^[A-Z]{2}$/u.test(String(data.country_code || '')) ? data.country_code : '',
            region: cleanGeoText(data.region, 120),
            city: cleanGeoText(data.city, 120),
            timezone: cleanGeoText(data.timezone && data.timezone.id, 100) || 'UTC'
        });
        
    } catch (error) {
        console.error("Geo lookup error:", error.message);
        // Fallback gracefully
        return res.status(200).json({
            country: "Unknown",
            countryCode: "",
            region: "Unknown",
            city: "Unknown",
            timezone: "UTC"
        });
    }
};
