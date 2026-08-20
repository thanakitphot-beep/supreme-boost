const crypto = require('crypto');
const { connectToDatabase } = require("./_mongodb.js");

const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === "OPTIONS") return res.status(200).end();

    if (!req._rateLimitChecked && !checkRateLimit(req, res, 'auth')) {
        return;
    }

    const db = await connectToDatabase();
    if (!db) return res.status(503).json({ error: "Database is not configured" });

    try {
        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const { action, username, password } = body;

            // 1. Register Action
            if (action === 'register') {
                const { email } = body;
                if (!username || !password) {
                    return res.status(400).json({ error: "Username and Password are required" });
                }

                // Check unique username
                const existing = await db.collection('tenants').findOne({ username });
                if (existing) {
                    return res.status(400).json({ error: "Username already exists" });
                }

                const hashedPassword = hashPassword(password);
                const newApiKey = 'sk_live_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                
                const newTenant = {
                    id: crypto.randomUUID(),
                    company_name: username,
                    username: username,
                    email: email || '',
                    password: hashedPassword,
                    api_key: newApiKey,
                    status: 'pending',
                    package_type: 'none',
                    expires_at: null,
                    created_at: new Date().toISOString()
                };

                try {
                    await db.collection('tenants').insertOne(newTenant);
                } catch (dbErr) {
                    console.warn('[AUTH] MongoDB insertOne failed, ignoring for read-only DB:', dbErr.message);
                }

                return res.status(200).json({
                    success: true,
                    tenant: {
                        id: newTenant.id,
                        username: newTenant.username,
                        company_name: newTenant.company_name,
                        api_key: newTenant.api_key,
                        status: newTenant.status,
                        package_type: newTenant.package_type,
                        expires_at: newTenant.expires_at
                    }
                });
            }

            // 2. Login Action
            if (action === 'login') {
                if (!username || !password) {
                    return res.status(400).json({ error: "Username and Password are required" });
                }

                const tenant = await db.collection('tenants').findOne({ username });

                if (!tenant) {
                    return res.status(401).json({ error: "Invalid Username or Password" });
                }

                const hashMatch = tenant.password === crypto.createHash('sha256').update(password).digest('hex');
                const plainMatch = tenant.password === password;

                if (!plainMatch && !hashMatch) {
                    return res.status(401).json({ error: "Invalid Username or Password" });
                }
                
                // Migrate old plain text password to hashed password automatically
                if (plainMatch && !hashMatch) {
                    try {
                        const newHash = hashPassword(password);
                        await db.collection('tenants').updateOne({ id: tenant.id }, { $set: { password: newHash } });
                    } catch (dbErr) {
                        console.warn('[AUTH] MongoDB updateOne failed, ignoring for read-only DB:', dbErr.message);
                    }
                }
                
                if (tenant.status === 'suspended') {
                    return res.status(403).json({ error: "Account suspended. Please contact admin." });
                }

                return res.status(200).json({
                    success: true,
                    tenant: {
                        id: tenant.id,
                        username: tenant.username,
                        company_name: tenant.company_name,
                        api_key: tenant.api_key,
                        status: tenant.status,
                        package_type: tenant.package_type,
                        expires_at: tenant.expires_at,
                        created_at: tenant.created_at
                    }
                });
            }

            return res.status(400).json({ error: "Invalid action" });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error('Customer Auth Error:', err);
        return res.status(500).json({ error: err.message || "Internal Server Error" });
    }
};
