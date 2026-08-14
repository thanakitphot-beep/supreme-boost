const { setCorsHeaders } = require('../services/cors');

module.exports = async function geoHandler(req, res) {
    setCorsHeaders(req, res);
    
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    // Extract IP from Vercel headers (x-forwarded-for or x-real-ip)
    let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress;
    if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
    
    // For local testing, use a default fallback IP if it's localhost (e.g. Thailand)
    if (!ip || ip === '::1' || ip === '127.0.0.1') {
        ip = '171.97.100.1'; // Example Thai IP for testing
    }

    try {
        // We use ip-api.com. It's free for HTTP (up to 45 req/min).
        // For production HTTPS we must either call it from backend or use pro.
        // Calling it from Vercel backend bypasses the mixed-content block.
        const url = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,timezone`;
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (!response.ok) throw new Error("Geo API error");
        const data = await response.json();
        
        if (data.status !== "success") {
            throw new Error(data.message || "Geo API failed");
        }

        // Send cache headers (cache for 24 hours)
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        
        return res.status(200).json({
            ip: ip,
            country: data.country,
            countryCode: data.countryCode,
            region: data.regionName,
            city: data.city,
            timezone: data.timezone
        });
        
    } catch (error) {
        console.error("Geo lookup error:", error.message);
        // Fallback gracefully
        return res.status(200).json({
            ip: ip,
            country: "Unknown",
            countryCode: "US", // Default to US (English)
            region: "Unknown",
            city: "Unknown",
            timezone: "UTC"
        });
    }
};
