const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") return res.status(200).end();

    if (!supabase) {
        return res.status(500).json({ error: "Database not configured" });
    }

    try {
        if (req.method === "GET") {
            const { data: set } = await supabase.from('settings').select('*').eq('id', 'global').maybeSingle();
            const { data: methods } = await supabase.from('payment_methods').select('id, bank_name, account_number, account_name, qr_base64').eq('is_active', true);
            
            return res.status(200).json({ 
                paymentMethods: methods || [],
                paymentMode: (set && set.payment_mode) || 'manual'
            });
        }
        
        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            
            if (!body.companyName || !body.packageType) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            const { data: set } = await supabase.from('settings').select('*').eq('id', 'global').maybeSingle();
            const mode = (set && set.payment_mode) || 'manual';

            if (mode === 'stripe') {
                // Here you would use the Stripe Node SDK:
                // const stripe = require('stripe')(set.stripe_secret_key);
                // const session = await stripe.checkout.sessions.create({ ... })
                // return res.status(200).json({ redirectUrl: session.url });
                
                // For demonstration, we return a mock URL
                return res.status(200).json({ redirectUrl: 'https://checkout.stripe.com/pay/cs_live_mock_12345' });
            }

            if (mode === 'slipok') {
                // Verify slip with SlipOK API
                if (!body.slipBase64) return res.status(400).json({ error: "Missing slip image" });
                
                try {
                    // Remove "data:image/jpeg;base64," prefix for API
                    const base64Data = body.slipBase64.split(',')[1] || body.slipBase64;
                    const slipRes = await fetch('https://api.slipok.com/api/line/apikey/' + set.slipok_branch_id, {
                        method: 'POST',
                        headers: { 'x-authorization': set.slipok_api_key, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: base64Data })
                    });
                    
                    const slipData = await slipRes.json();
                    if (!slipData.success) throw new Error(slipData.message || "Invalid slip");
                    
                    // If valid, Auto-Approve!
                    const apiKey = 'sk_live_' + require('crypto').randomBytes(12).toString('hex');
                    const expiry = new Date();
                    expiry.setMonth(expiry.getMonth() + (body.packageType === 'Pro' ? 1 : 12));
                    
                    await supabase.from('tenants').insert({
                        company_name: body.companyName,
                        api_key: apiKey,
                        package_type: body.packageType,
                        status: 'active',
                        expires_at: expiry.toISOString()
                    });
                    
                    return res.status(200).json({ success: true, autoApproved: true, apiKey: apiKey });
                    
                } catch (err) {
                    return res.status(400).json({ error: "Slip verification failed: " + err.message });
                }
            }

            // Default Manual Mode
            if (!body.slipBase64) return res.status(400).json({ error: "Missing slip image" });

            const { data, error } = await supabase
                .from('billing_requests')
                .insert({
                    tenant_name: body.companyName,
                    contact_email: body.email || '',
                    package_type: body.packageType,
                    amount: body.amount || 0,
                    slip_base64: body.slipBase64,
                    status: 'pending'
                })
                .select()
                .single();

            if (error) throw error;

            supabase.from('logs').insert({ type: 'info', message: `New manual billing request from ${body.companyName}` }).then().catch(()=>{});

            return res.status(200).json({ success: true, message: "Request submitted. Waiting for admin approval.", requestId: data.id });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("Checkout API error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
