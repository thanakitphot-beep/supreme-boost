const crypto = require('crypto');
const { connectToDatabase } = require("./_mongodb.js");
const { authConfigured, signToken, verifyAccessJWT } = require('./_auth.js');
const { normalizeAllowedOrigins } = require('../services/tenantAccess');
const { setCorsHeaders } = require('../services/cors');
const { checkRateLimit } = require('../services/rateLimit');
const { generateInitialPassword, hashPassword, passwordIsValid } = require('../services/passwords');
const { activateBillingRequest } = require('../services/billing');
const { canonicalPlanId } = require('../services/plans');

function adminTenant(tenant) {
    if (!tenant) return tenant;
    const { password, auth, ...safeTenant } = tenant;
    return safeTenant;
}

async function authenticateUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessJWT(token);
    return decoded ? { role: decoded.role } : null;
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === "OPTIONS") return res.status(200).end();

    if (!await checkRateLimit(req, res, 'admin')) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const action = url.searchParams.get('action');

    let profile = null;
    if (action !== 'login') {
        profile = await authenticateUser(req);
        if (!profile) return res.status(401).json({ error: "Unauthorized" });
        if (profile.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admins only" });
    }

    if (!authConfigured()) return res.status(503).json({ error: 'Authentication is not configured' });
    const db = await connectToDatabase();
    if (!db) return res.status(503).json({ error: "Database is not configured" });

    try {
        if (req.method === "GET") {
            if (action === 'stats') {
                const tenantsCount = await db.collection('tenants').countDocuments();
                const pendingBilling = await db.collection('billing_requests').countDocuments({ status: { $in: ['pending', 'verified_pending_approval'] } });
                return res.status(200).json({ tenants: tenantsCount || 0, pendingBilling: pendingBilling || 0 });
            }
            if (action === 'tenants') {
                const data = await db.collection('tenants').find({}).sort({ created_at: -1 }).toArray();
                return res.status(200).json({ tenants: (data || []).map(adminTenant) });
            }
            if (action === 'billing') {
                const data = await db.collection('billing_requests').find({}).sort({ created_at: -1 }).toArray();
                return res.status(200).json({ requests: data || [] });
            }
            if (action === 'payment_methods') {
                const data = await db.collection('payment_methods').find({}).sort({ created_at: -1 }).toArray();
                return res.status(200).json({ methods: data || [] });
            }
            if (action === 'settings') {
                const data = await db.collection('settings').findOne({ id: 'global' });
                const { stripe_secret_key, slipok_api_key, ...settings } = data || {};
                return res.status(200).json({ settings });
            }
            if (action === 'get_tenant_settings') {
                const tenantId = url.searchParams.get('tenantId');
                if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
                const data = await db.collection('settings').findOne({ id: tenantId });
                return res.status(200).json({ settings: data || {} });
            }
            if (action === 'get_knowledge') {
                const tenantId = url.searchParams.get('tenantId');
                if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
                const data = await db.collection('knowledge_chunks').find({ tenant_id: tenantId }).sort({ created_at: -1 }).toArray();
                return res.status(200).json({ data: data || [] });
            }
            if (action === 'get_chat_logs') {
                const tenantId = url.searchParams.get('tenantId');
                if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
                const data = await db.collection('logs').find({ type: { $in: ['chat', 'handoff'] } }).sort({ timestamp: -1 }).limit(200).toArray();
                const filtered = (data || []).filter(l => l.metadata && l.metadata.tenantId === tenantId).slice(0, 50);
                return res.status(200).json({ logs: filtered });
            }
            if (action === 'handoffs') {
                const data = await db.collection('handoff_tickets').find({}).sort({ created_at: -1 }).limit(100).toArray();
                return res.status(200).json({ tickets: data || [] });
            }
        }

        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            if (action === 'login') {
                const { code } = body;
                const adminSecret = process.env.ADMIN_PASSWORD;
                if (!adminSecret) {
                    return res.status(500).json({ error: "Server misconfiguration: ADMIN_PASSWORD not set" });
                }
                if (code === adminSecret) {
                    // Issue a real JWT — never return a static token
                    const token = signToken({ role: 'admin', sub: 'admin' });
                    return res.status(200).json({ success: true, token });
                }
                return res.status(401).json({ error: "Invalid admin code" });
            }

            if (!profile) return res.status(401).json({ error: "Unauthorized" });
            if (profile.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admins only" });

            if (action === 'update_tenant') {
                const { id, status, package_type, expires_at, allowed_origins } = body;
                const updateData = {};
                if (status !== undefined) {
                    if (!['active', 'suspended', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid tenant status' });
                    updateData.status = status;
                    if (status === 'suspended') updateData.suspension_reason = 'admin';
                }
                if (package_type !== undefined) {
                    const planId = canonicalPlanId(package_type);
                    if (!planId) return res.status(400).json({ error: 'Invalid package type' });
                    updateData.package_type = planId;
                }
                if (expires_at !== undefined) updateData.expires_at = expires_at;
                if (allowed_origins !== undefined) updateData.allowed_origins = normalizeAllowedOrigins(allowed_origins);

                const tenantUpdate = { $set: updateData };
                if (status === 'active') tenantUpdate.$unset = { suspension_reason: '' };
                await db.collection('tenants').updateOne({ id }, tenantUpdate);
                const tenant = await db.collection('tenants').findOne({ id });
                return res.status(200).json({ success: true, tenant: adminTenant(tenant) });
            }

            if (action === 'add_tenant') {
                const { company_name, package_type, duration_months, allowed_origins } = body;
                if (!company_name) return res.status(400).json({ error: "Company name required" });
                const planId = canonicalPlanId(package_type || 'starter');
                if (!planId) return res.status(400).json({ error: 'Invalid package type' });
                const origins = normalizeAllowedOrigins(allowed_origins);
                const username = company_name.trim();
                if (!username) return res.status(400).json({ error: 'Company name required' });
                if (await db.collection('tenants').findOne({ username })) {
                    return res.status(409).json({ error: 'A tenant with this username already exists' });
                }

                const apiKey = 'sk_live_' + crypto.randomBytes(12).toString('hex');
                const initialPassword = generateInitialPassword();
                let expires_at = null;
                
                if (duration_months !== 'unlimited') {
                    const expiry = new Date();
                    expiry.setMonth(expiry.getMonth() + parseInt(duration_months));
                    expires_at = expiry.toISOString();
                }

                const newTenant = {
                    id: crypto.randomUUID(),
                    company_name,
                    username,
                    password: await hashPassword(initialPassword),
                    api_key: apiKey,
                    package_type: planId,
                    allowed_origins: origins,
                    status: origins.length ? 'active' : 'pending',
                    expires_at,
                    created_at: new Date().toISOString()
                };
                
                await db.collection('tenants').insertOne(newTenant);
                // This is the only response that contains the generated
                // credential. The admin must deliver it through a secure channel.
                return res.status(200).json({ success: true, tenant: adminTenant(newTenant), initialPassword });
            }

            if (action === 'approve_billing') {
                const { id } = body;
                
                const request = await db.collection('billing_requests').findOne({ id });
                if (!request) throw new Error("Request not found");
                if (!['pending', 'verified_pending_approval'].includes(request.status) || request.provider === 'stripe') {
                    return res.status(400).json({ error: 'Billing request cannot be manually approved' });
                }
                const tenant = await activateBillingRequest(db, id, { provider: request.provider || 'manual', providerReference: request.provider_reference });
                return res.status(200).json({ success: true, tenant: adminTenant(tenant) });
            }

            if (action === 'reject_billing') {
                const result = await db.collection('billing_requests').updateOne(
                    { id: body.id, status: { $in: ['pending', 'verified_pending_approval'] } },
                    { $set: { status: 'rejected', updated_at: new Date().toISOString() } }
                );
                if (!result.modifiedCount) return res.status(400).json({ error: 'Billing request cannot be rejected' });
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_tenant') {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Tenant ID required' });
                await db.collection('tenants').deleteOne({ id });
                return res.status(200).json({ success: true });
            }

            if (action === 'update_tenant_credentials') {
                const { id, company_name, username, new_password, regenerate_key } = body;
                if (!id) return res.status(400).json({ error: 'Tenant ID required' });

                const updateData = {};

                if (company_name !== undefined && company_name.trim() !== '') {
                    updateData.company_name = company_name.trim();
                }
                if (username !== undefined && username.trim() !== '') {
                    const existing = await db.collection('tenants').findOne({ username: username.trim(), id: { $ne: id } });
                    if (existing) return res.status(400).json({ error: 'Username นี้ถูกใช้งานแล้ว' });
                    updateData.username = username.trim();
                }
                if (new_password !== undefined && new_password.trim() !== '') {
                    if (!passwordIsValid(new_password.trim())) {
                        return res.status(400).json({ error: 'Password must be at least 12 characters' });
                    }
                    updateData.password = await hashPassword(new_password.trim());
                }
                if (regenerate_key) {
                    updateData.api_key = 'sk_live_' + crypto.randomBytes(12).toString('hex');
                }

                if (Object.keys(updateData).length === 0) {
                    return res.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องการอัปเดต' });
                }

                await db.collection('tenants').updateOne({ id }, { $set: updateData });
                const tenant = await db.collection('tenants').findOne({ id });
                return res.status(200).json({ success: true, tenant: adminTenant(tenant) });
            }

            if (action === 'delete_billing') {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Billing ID required' });
                const result = await db.collection('billing_requests').deleteOne({ id, status: { $nin: ['paid', 'approved'] } });
                if (!result.deletedCount) return res.status(400).json({ error: 'Paid billing ledger entries cannot be deleted' });
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_payment_method') {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Payment method ID required' });
                await db.collection('payment_methods').deleteOne({ id });
                return res.status(200).json({ success: true });
            }

            if (action === 'add_payment_method') {
                const { bank_name, account_number, account_name, qr_base64 } = body;
                const newMethod = {
                    id: crypto.randomUUID(),
                    bank_name, account_number, account_name, qr_base64, is_active: true,
                    created_at: new Date().toISOString()
                };
                await db.collection('payment_methods').insertOne(newMethod);
                return res.status(200).json({ success: true, method: newMethod });
            }

            if (action === 'toggle_payment_method') {
                const { id, is_active } = body;
                await db.collection('payment_methods').updateOne({ id }, { $set: { is_active } });
                return res.status(200).json({ success: true });
            }

            if (action === 'save_settings') {
                const paymentMode = String(body.payment_mode || 'manual').toLowerCase();
                if (!['manual', 'slipok', 'stripe', 'both'].includes(paymentMode)) return res.status(400).json({ error: 'Invalid payment mode' });
                const payload = {
                    payment_mode: paymentMode,
                    updated_at: new Date().toISOString()
                };
                await db.collection('settings').updateOne(
                    { id: 'global' },
                    { $set: payload, $unset: { stripe_secret_key: '', slipok_api_key: '', slipok_branch_id: '' } },
                    { upsert: true }
                );
                return res.status(200).json({ success: true });
            }

            if (action === 'save_tenant_settings') {
                const { tenantId, system_model, system_prompt, theme_color, temperature } = body;
                if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
                const payload = {};
                if (system_model !== undefined) payload.system_model = system_model;
                if (system_prompt !== undefined) payload.system_prompt = system_prompt;
                if (theme_color !== undefined) payload.theme_color = theme_color;
                if (temperature !== undefined) payload.temperature = temperature;
                payload.updated_at = new Date().toISOString();
                
                await db.collection('settings').updateOne({ id: tenantId }, { $set: payload }, { upsert: true });
                return res.status(200).json({ success: true });
            }

            if (action === 'update_handoff') {
                const id = String(body.id || '');
                const status = String(body.status || '');
                if (!id || !['queued', 'in_progress', 'resolved', 'closed'].includes(status)) {
                    return res.status(400).json({ error: 'Invalid handoff update' });
                }
                await db.collection('handoff_tickets').updateOne({ id }, { $set: { status, updated_at: new Date().toISOString() } });
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_knowledge') {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Knowledge ID required' });
                await db.collection('knowledge_chunks').deleteOne({ id });
                return res.status(200).json({ success: true });
            }
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (err) {
        console.error("Admin API error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
