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

// Real Supabase JWT & Secret Token Auth Middleware
async function authenticateUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    
    // Check for Secret Admin Token
    if (token === 'ADMIN_SUPREME_TOKEN_12345') {
        return { role: 'admin' };
    }

    // Validate JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    // Fetch user profile to get role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .maybeSingle();
        
    return profile;
}

module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") return res.status(200).end();

    if (!supabase) return res.status(500).json({ error: "Database not configured" });
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const action = url.searchParams.get('action');

    // Bypass auth for login action
    let profile = null;
    if (action !== 'login') {
        profile = await authenticateUser(req);
        if (!profile) return res.status(401).json({ error: "Unauthorized" });
        if (profile.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admins only" });
    }

    try {
        if (req.method === "GET") {
            if (action === 'stats') {
                const { count: tenantsCount } = await supabase.from('tenants').select('*', { count: 'exact', head: true });
                const { count: pendingBilling } = await supabase.from('billing_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
                return res.status(200).json({ tenants: tenantsCount || 0, pendingBilling: pendingBilling || 0 });
            }
            if (action === 'tenants') {
                const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
                return res.status(200).json({ tenants: data || [] });
            }
            if (action === 'billing') {
                const { data } = await supabase.from('billing_requests').select('*').order('created_at', { ascending: false });
                return res.status(200).json({ requests: data || [] });
            }
            if (action === 'payment_methods') {
                const { data } = await supabase.from('payment_methods').select('*').order('created_at', { ascending: false });
                return res.status(200).json({ methods: data || [] });
            }
            if (action === 'settings') {
                const { data } = await supabase.from('settings').select('*').eq('id', 'global').maybeSingle();
                return res.status(200).json({ settings: data || {} });
            }
        }

        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            // Allow login without token
            if (action === 'login') {
                const { code } = body;
                // Use ADMIN_PASSWORD from env, or a fallback secret
                const adminSecret = process.env.ADMIN_PASSWORD || 'INDICOR 911';
                if (code === adminSecret) {
                    return res.status(200).json({ success: true, token: 'ADMIN_SUPREME_TOKEN_12345' });
                }
                return res.status(401).json({ error: "Invalid admin code" });
            }

            // For all other POST actions, require authentication
            if (!profile) return res.status(401).json({ error: "Unauthorized" });
            if (profile.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admins only" });

            if (action === 'update_tenant') {
                const { id, status, package_type, expires_at } = body;
                const updateData = {};
                if (status !== undefined) updateData.status = status;
                if (package_type !== undefined) updateData.package_type = package_type;
                if (expires_at !== undefined) updateData.expires_at = expires_at;

                const { data, error } = await supabase.from('tenants').update(updateData).eq('id', id).select();
                if (error) throw error;
                return res.status(200).json({ success: true, tenant: data[0] });
            }

            if (action === 'add_tenant') {
                const { company_name, package_type, duration_months } = body;
                if (!company_name) return res.status(400).json({ error: "Company name required" });

                const apiKey = 'sk_live_' + crypto.randomBytes(12).toString('hex');
                let expires_at = null;
                
                if (duration_months !== 'unlimited') {
                    const expiry = new Date();
                    expiry.setMonth(expiry.getMonth() + parseInt(duration_months));
                    expires_at = expiry.toISOString();
                }

                const { data: newTenant, error: tenErr } = await supabase.from('tenants').insert({
                    id: crypto.randomUUID(),
                    company_name,
                    api_key: apiKey,
                    package_type: package_type || 'basic',
                    status: 'active',
                    expires_at
                }).select().single();
                
                if (tenErr) throw tenErr;
                return res.status(200).json({ success: true, tenant: newTenant });
            }

            if (action === 'approve_billing') {
                const { id } = body;
                
                // 1. Get request
                const { data: request, error: reqErr } = await supabase.from('billing_requests').select('*').eq('id', id).single();
                if (reqErr || !request) throw new Error("Request not found");
                if (request.status !== 'pending') return res.status(400).json({ error: "Already processed" });

                // 2. Generate API Key
                const apiKey = 'sk_live_' + crypto.randomBytes(12).toString('hex');
                const expiry = new Date();
                expiry.setMonth(expiry.getMonth() + (request.package_type === 'Pro' ? 1 : 12)); // Just an example

                // 3. Create Tenant
                const { data: newTenant, error: tenErr } = await supabase.from('tenants').insert({
                    id: crypto.randomUUID(),
                    company_name: request.tenant_name,
                    api_key: apiKey,
                    package_type: request.package_type,
                    status: 'active',
                    expires_at: expiry.toISOString()
                }).select().single();
                
                if (tenErr) throw tenErr;

                // 4. Update Billing Request
                await supabase.from('billing_requests').update({ status: 'approved' }).eq('id', id);

                return res.status(200).json({ success: true, apiKey: apiKey });
            }

            if (action === 'reject_billing') {
                await supabase.from('billing_requests').update({ status: 'rejected' }).eq('id', body.id);
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_tenant') {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Tenant ID required' });
                const { error } = await supabase.from('tenants').delete().eq('id', id);
                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_billing') {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Billing ID required' });
                const { error } = await supabase.from('billing_requests').delete().eq('id', id);
                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_payment_method') {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Payment method ID required' });
                const { error } = await supabase.from('payment_methods').delete().eq('id', id);
                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            if (action === 'add_payment_method') {
                const { bank_name, account_number, account_name, qr_base64 } = body;
                const { data, error } = await supabase.from('payment_methods').insert({
                    bank_name, account_number, account_name, qr_base64, is_active: true
                }).select().single();
                if (error) throw error;
                return res.status(200).json({ success: true, method: data });
            }

            if (action === 'toggle_payment_method') {
                const { id, is_active } = body;
                await supabase.from('payment_methods').update({ is_active }).eq('id', id);
                return res.status(200).json({ success: true });
            }

            if (action === 'save_settings') {
                const payload = {
                    payment_mode: body.payment_mode || 'manual',
                    stripe_secret_key: body.stripe_secret_key || '',
                    slipok_api_key: body.slipok_api_key || '',
                    slipok_branch_id: body.slipok_branch_id || ''
                };
                const { error } = await supabase.from('settings').upsert({ id: 'global', ...payload });
                if (error) throw error;
                return res.status(200).json({ success: true });
            }
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (err) {
        console.error("Admin API error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
