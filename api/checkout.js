const crypto = require('crypto');
const { connectToDatabase } = require("./_mongodb.js");

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") return res.status(200).end();

    const db = await connectToDatabase();
    if (!db) return res.status(500).json({ error: "Database not configured" });

    try {
        if (req.method === "GET") {
            const set = await db.collection('settings').findOne({ id: 'global' });
            const methods = await db.collection('payment_methods').find({ is_active: true }).project({ id: 1, bank_name: 1, account_number: 1, account_name: 1, qr_base64: 1 }).toArray();
            
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

            const set = await db.collection('settings').findOne({ id: 'global' });
            const mode = (set && set.payment_mode) || 'manual';

            if (mode === 'stripe') {
                return res.status(200).json({ redirectUrl: 'https://checkout.stripe.com/pay/cs_live_mock_12345' });
            }

            if (mode === 'slipok') {
                if (!body.slipBase64) return res.status(400).json({ error: "Missing slip image" });
                
                try {
                    const base64Data = body.slipBase64.split(',')[1] || body.slipBase64;
                    const slipRes = await fetch('https://api.slipok.com/api/line/apikey/' + set.slipok_branch_id, {
                        method: 'POST',
                        headers: { 'x-authorization': set.slipok_api_key, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: base64Data })
                    });
                    
                    const slipData = await slipRes.json();
                    if (!slipData.success) throw new Error(slipData.message || "Invalid slip");
                    
                    const apiKey = 'sk_live_' + crypto.randomBytes(12).toString('hex');
                    const expiry = new Date();
                    expiry.setMonth(expiry.getMonth() + (body.packageType === 'Pro' ? 1 : 12));
                    
                    await db.collection('tenants').insertOne({
                        id: crypto.randomUUID(),
                        company_name: body.companyName,
                        api_key: apiKey,
                        package_type: body.packageType,
                        status: 'active',
                        expires_at: expiry.toISOString(),
                        created_at: new Date().toISOString()
                    });
                    
                    return res.status(200).json({ success: true, autoApproved: true, apiKey: apiKey });
                    
                } catch (err) {
                    return res.status(400).json({ error: "Slip verification failed: " + err.message });
                }
            }

            // Default Manual Mode
            if (!body.slipBase64) return res.status(400).json({ error: "Missing slip image" });

            const newRequest = {
                id: crypto.randomUUID(),
                tenant_name: body.companyName,
                contact_email: body.email || '',
                package_type: body.packageType,
                amount: body.amount || 0,
                slip_base64: body.slipBase64,
                status: 'pending',
                created_at: new Date().toISOString()
            };

            await db.collection('billing_requests').insertOne(newRequest);

            db.collection('logs').insertOne({ 
                id: crypto.randomUUID(),
                type: 'info', 
                message: `New manual billing request from ${body.companyName}`,
                timestamp: new Date().toISOString()
            }).then().catch(()=>{});

            return res.status(200).json({ success: true, message: "Request submitted. Waiting for admin approval.", requestId: newRequest.id });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("Checkout API error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
