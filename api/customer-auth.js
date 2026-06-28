const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (!supabase) return res.status(500).json({ error: "Database not configured" });

    try {
        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const { action, username, password } = body;

            // 1. Register Action
            if (action === 'register') {
                if (!username || !password) {
                    return res.status(400).json({ error: "Username and Password are required" });
                }

                const hashedPassword = hashPassword(password);
                const newApiKey = 'sk_live_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                
                const { data: inserted, error: insertError } = await supabase
                    .from('tenants')
                    .insert([{
                        id: crypto.randomUUID(),
                        company_name: username,
                        username: username,
                        password: hashedPassword,
                        api_key: newApiKey,
                        status: 'active',
                        package_type: 'basic',
                        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
                    }])
                    .select()
                    .single();
                
                if (insertError) {
                    if (insertError.code === '23505') { // Unique violation
                        return res.status(400).json({ error: "Username already exists" });
                    }
                    if (insertError.message.includes('column "username" of relation "tenants" does not exist')) {
                         return res.status(500).json({ error: "DATABASE ERROR: Please run the SQL command in the implementation plan to add 'username' and 'password' columns to the 'tenants' table." });
                    }
                    throw insertError;
                }

                return res.status(200).json({
                    success: true,
                    tenant: {
                        id: inserted.id,
                        username: inserted.username,
                        company_name: inserted.company_name,
                        api_key: inserted.api_key,
                        status: inserted.status,
                        package_type: inserted.package_type,
                        expires_at: inserted.expires_at
                    }
                });
            }

            // 2. Login Action
            if (action === 'login') {
                if (!username || !password) {
                    return res.status(400).json({ error: "Username and Password are required" });
                }

                const hashedPassword = hashPassword(password);

                const { data: tenant, error } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('username', username)
                    .maybeSingle();

                if (error) {
                     if (error.message.includes('column "username" does not exist')) {
                         return res.status(500).json({ error: "DATABASE ERROR: Please run the SQL command in the implementation plan to add 'username' and 'password' columns." });
                     }
                     throw error;
                }

                if (!tenant || tenant.password !== hashedPassword) {
                    return res.status(401).json({ error: "Invalid Username or Password" });
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

        // GET: Session verification via auth header token can be added here if needed

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error('Customer Auth Error:', err);
        return res.status(500).json({ error: err.message || "Internal Server Error" });
    }
};
