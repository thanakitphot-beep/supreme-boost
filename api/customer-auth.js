const { createClient } = require('@supabase/supabase-js');

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

module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (!supabase) return res.status(500).json({ error: "Database not configured" });

    try {
        // POST: Login with API Key
        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const { apiKey, action, email, displayName } = body;

            // Handle Simulated Google Login Flow
            if (action === 'google_login' && email) {
                // Check if a tenant already exists with this email (using company_name as email for simulation)
                let { data: existingTenant, error: searchError } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('company_name', email)
                    .maybeSingle();

                if (!existingTenant) {
                    // Create new test tenant for this Google User
                    const newApiKey = 'sk_live_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                    const { data: inserted, error: insertError } = await supabase
                        .from('tenants')
                        .insert([{
                            company_name: email,
                            api_key: newApiKey,
                            status: 'active',
                            package_type: 'pro',
                            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
                        }])
                        .select()
                        .single();
                    
                    if (insertError) throw insertError;
                    existingTenant = inserted;
                }

                if (existingTenant.status === 'suspended') {
                    return res.status(403).json({ error: "Account suspended. Please contact admin." });
                }

                return res.status(200).json({
                    success: true,
                    tenant: {
                        id: existingTenant.id,
                        company_name: existingTenant.company_name,
                        api_key: existingTenant.api_key,
                        status: existingTenant.status,
                        package_type: existingTenant.package_type,
                        expires_at: existingTenant.expires_at,
                        created_at: existingTenant.created_at
                    }
                });
            }

            if (!apiKey) return res.status(400).json({ error: "API Key is required" });

            const { data: tenant, error } = await supabase
                .from('tenants')
                .select('*')
                .eq('api_key', apiKey)
                .maybeSingle();

            if (error) throw error;
            if (!tenant) return res.status(401).json({ error: "Invalid API Key" });
            if (tenant.status === 'suspended') return res.status(403).json({ error: "Account suspended. Please contact admin." });

            return res.status(200).json({
                success: true,
                tenant: {
                    id: tenant.id,
                    company_name: tenant.company_name,
                    api_key: tenant.api_key,
                    status: tenant.status,
                    package_type: tenant.package_type,
                    expires_at: tenant.expires_at,
                    created_at: tenant.created_at
                }
            });
        }

        // GET: Verify API Key (for session check)
        if (req.method === "GET") {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: "No token" });
            }
            const apiKey = authHeader.substring(7);

            const { data: tenant } = await supabase
                .from('tenants')
                .select('id, company_name, status, package_type, expires_at')
                .eq('api_key', apiKey)
                .maybeSingle();

            if (!tenant) return res.status(401).json({ error: "Invalid" });

            return res.status(200).json({ success: true, tenant });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("Customer Auth error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
