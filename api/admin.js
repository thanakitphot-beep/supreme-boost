const crypto = require('crypto');
const { connectToDatabase } = require("./_mongodb.js");
const { authConfigured, signToken, verifyAccessJWT, secretsMatch, accessTokenFromRequest, setAdminSessionCookie, clearAdminSessionCookie } = require('./_auth.js');
const { normalizeAllowedOrigins } = require('../services/tenantAccess');
const { setCorsHeaders } = require('../services/cors');
const { checkRateLimit } = require('../services/rateLimit');
const { generateInitialPassword, hashPassword, passwordIsValid } = require('../services/passwords');
const { activateBillingRequest } = require('../services/billing');
const { canonicalPlanId } = require('../services/plans');
const { parseImageDataUrl } = require('../services/imageData');

const ADMIN_TENANT_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-5.6-terra', 'gpt-5.6-sol', 'llama-3.3-70b-versatile']);

function validIdentifier(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/u.test(value);
}

function adminTenant(tenant) {
    if (!tenant) return tenant;
    const { password, auth, ...safeTenant } = tenant;
    return safeTenant;
}

async function authenticateUser(req) {
    const token = accessTokenFromRequest(req);
    if (!token) return null;
    const decoded = verifyAccessJWT(token);
    return decoded ? { role: decoded.role } : null;
}

async function rejectBillingRequest(db, id) {
    return db.collection('billing_requests').updateOne(
        { id, status: { $in: ['pending', 'verified_pending_approval'] } },
        { $set: { status: 'rejected', updated_at: new Date().toISOString() }, $unset: { slip_base64: '' } }
    );
}

function knowledgeDeleteFilter(record, id) {
    if (record && validIdentifier(record.tenant_id) && typeof record.url === 'string' && record.url) {
        return { tenant_id: record.tenant_id, url: record.url };
    }
    return { id };
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === "OPTIONS") return res.status(200).end();

    if (!req._rateLimitChecked && !await checkRateLimit(req, res, 'admin')) return;
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action');

    if (req.method === 'POST' && action === 'logout') {
        clearAdminSessionCookie(res);
        return res.status(200).json({ success: true });
    }

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
                const data = await db.collection('billing_requests').find({}).project({
                    _id: 0,
                    id: 1,
                    tenant_id: 1,
                    tenant_name: 1,
                    contact_email: 1,
                    package_type: 1,
                    amount: 1,
                    currency: 1,
                    provider: 1,
                    status: 1,
                    created_at: 1,
                    updated_at: 1,
                    paid_at: 1,
                    rejected_at: 1
                }).sort({ created_at: -1 }).limit(100).toArray();
                const ids = data.map(request => request.id).filter(Boolean);
                const withSlip = ids.length
                    ? await db.collection('billing_requests').find({ id: { $in: ids }, slip_base64: { $type: 'string' } }).project({ _id: 0, id: 1 }).toArray()
                    : [];
                const slipIds = new Set(withSlip.map(request => request.id));
                return res.status(200).json({ requests: data.map(request => ({ ...request, has_slip: slipIds.has(request.id) })) });
            }
            if (action === 'payment_methods') {
                const data = await db.collection('payment_methods').find({}).sort({ created_at: -1 }).limit(50).toArray();
                return res.status(200).json({ methods: data || [] });
            }
            if (action === 'settings') {
                const data = await db.collection('settings').findOne({ id: 'global' });
                return res.status(200).json({ settings: { payment_mode: data && data.payment_mode || 'manual' } });
            }
            if (action === 'get_tenant_settings') {
                const tenantId = url.searchParams.get('tenantId');
                if (!validIdentifier(tenantId)) return res.status(400).json({ error: 'Valid tenant ID required' });
                const data = await db.collection('settings').findOne({ id: tenantId });
                return res.status(200).json({ settings: data || {} });
            }
            if (action === 'get_knowledge') {
                const tenantId = url.searchParams.get('tenantId');
                if (!validIdentifier(tenantId)) return res.status(400).json({ error: 'Valid tenant ID required' });
                const data = await db.collection('knowledge_chunks').find({ tenant_id: tenantId }).project({ _id: 0, embedding: 0 }).sort({ created_at: -1 }).limit(500).toArray();
                return res.status(200).json({ data: data || [] });
            }
            if (action === 'get_chat_logs') {
                const tenantId = url.searchParams.get('tenantId');
                if (!validIdentifier(tenantId)) return res.status(400).json({ error: 'Valid tenant ID required' });
                const data = await db.collection('logs').find({ type: { $in: ['chat', 'chat_completed', 'handoff'] }, 'metadata.tenantId': tenantId }).sort({ timestamp: -1 }).limit(50).toArray();
                return res.status(200).json({ logs: data || [] });
            }
            if (action === 'handoffs') {
                const data = await db.collection('handoff_tickets').find({}).sort({ created_at: -1 }).limit(100).toArray();
                return res.status(200).json({ tickets: data || [] });
            }
        }

        if (req.method === "POST") {
            const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};

            if (action === 'login') {
                const { code } = body;
                const adminSecret = process.env.ADMIN_PASSWORD;
                if (!adminSecret) {
                    return res.status(500).json({ error: "Server misconfiguration: ADMIN_PASSWORD not set" });
                }
                if (typeof code === 'string' && code.length <= 256 && secretsMatch(code, adminSecret)) {
                    const token = signToken({ role: 'admin', sub: 'admin' });
                    setAdminSessionCookie(res, token);
                    return res.status(200).json({ success: true });
                }
                return res.status(401).json({ error: "Invalid admin code" });
            }

            if (!profile) return res.status(401).json({ error: "Unauthorized" });
            if (profile.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admins only" });

            if (action === 'update_tenant') {
                const { id, status, package_type, expires_at, allowed_origins } = body;
                if (!id || typeof id !== 'string' || id.length > 100) return res.status(400).json({ error: 'Valid tenant ID required' });
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
                if (expires_at !== undefined) {
                    if (expires_at === null || expires_at === '') updateData.expires_at = null;
                    else {
                        const expiry = new Date(expires_at);
                        if (Number.isNaN(expiry.getTime())) return res.status(400).json({ error: 'Invalid tenant expiry' });
                        updateData.expires_at = expiry.toISOString();
                    }
                }
                if (allowed_origins !== undefined) updateData.allowed_origins = normalizeAllowedOrigins(allowed_origins);
                if (!Object.keys(updateData).length) return res.status(400).json({ error: 'No tenant updates provided' });

                const tenantUpdate = { $set: updateData };
                if (status === 'active') tenantUpdate.$unset = { suspension_reason: '' };
                const result = await db.collection('tenants').updateOne({ id }, tenantUpdate);
                if (!result.matchedCount) return res.status(404).json({ error: 'Tenant not found' });
                const tenant = await db.collection('tenants').findOne({ id });
                return res.status(200).json({ success: true, tenant: adminTenant(tenant) });
            }

            if (action === 'add_tenant') {
                const { company_name, package_type, duration_months, allowed_origins } = body;
                const companyName = String(company_name || '').replace(/\s+/g, ' ').trim().slice(0, 160);
                if (!companyName) return res.status(400).json({ error: "Company name required" });
                const planId = canonicalPlanId(package_type || 'starter');
                if (!planId) return res.status(400).json({ error: 'Invalid package type' });
                const origins = normalizeAllowedOrigins(allowed_origins);
                const username = companyName;
                if (await db.collection('tenants').findOne({ username })) {
                    return res.status(409).json({ error: 'A tenant with this username already exists' });
                }

                const apiKey = 'sk_live_' + crypto.randomBytes(12).toString('hex');
                const initialPassword = generateInitialPassword();
                let expires_at = null;
                
                if (duration_months !== 'unlimited') {
                    const duration = Number.parseInt(duration_months, 10);
                    if (!Number.isInteger(duration) || duration < 1 || duration > 120) return res.status(400).json({ error: 'Invalid package duration' });
                    const expiry = new Date();
                    expiry.setMonth(expiry.getMonth() + duration);
                    expires_at = expiry.toISOString();
                }

                const newTenant = {
                    id: crypto.randomUUID(),
                    company_name: companyName,
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
                if (!validIdentifier(id)) return res.status(400).json({ error: 'Valid billing request ID required' });
                const request = await db.collection('billing_requests').findOne({ id });
                if (!request) return res.status(404).json({ error: 'Billing request not found' });
                if (!['pending', 'verified_pending_approval'].includes(request.status) || request.provider === 'stripe') {
                    return res.status(400).json({ error: 'Billing request cannot be manually approved' });
                }
                const tenant = await activateBillingRequest(db, id, { provider: request.provider || 'manual', providerReference: request.provider_reference });
                return res.status(200).json({ success: true, tenant: adminTenant(tenant) });
            }

            if (action === 'reject_billing') {
                if (!validIdentifier(body.id)) return res.status(400).json({ error: 'Valid billing request ID required' });
                const result = await rejectBillingRequest(db, body.id);
                if (!result.modifiedCount) return res.status(400).json({ error: 'Billing request cannot be rejected' });
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_tenant') {
                const { id } = body;
                if (!validIdentifier(id)) return res.status(400).json({ error: 'Valid tenant ID required' });
                const result = await db.collection('tenants').deleteOne({ id });
                if (!result.deletedCount) return res.status(404).json({ error: 'Tenant not found' });
                return res.status(200).json({ success: true });
            }

            if (action === 'update_tenant_credentials') {
                const { id, company_name, username, new_password, regenerate_key } = body;
                if (!validIdentifier(id)) return res.status(400).json({ error: 'Valid tenant ID required' });

                const updateData = {};

                if (company_name !== undefined && String(company_name).trim() !== '') {
                    updateData.company_name = String(company_name).replace(/\s+/g, ' ').trim().slice(0, 160);
                }
                if (username !== undefined && String(username).trim() !== '') {
                    const normalizedUsername = String(username).replace(/\s+/g, ' ').trim().slice(0, 160);
                    const existing = await db.collection('tenants').findOne({ username: normalizedUsername, id: { $ne: id } });
                    if (existing) return res.status(400).json({ error: 'Username นี้ถูกใช้งานแล้ว' });
                    updateData.username = normalizedUsername;
                }
                if (new_password !== undefined && String(new_password).trim() !== '') {
                    if (!passwordIsValid(String(new_password).trim())) {
                        return res.status(400).json({ error: 'Password must contain 12 to 256 characters' });
                    }
                    updateData.password = await hashPassword(String(new_password).trim());
                }
                if (regenerate_key) {
                    updateData.api_key = 'sk_live_' + crypto.randomBytes(12).toString('hex');
                }

                if (Object.keys(updateData).length === 0) {
                    return res.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องการอัปเดต' });
                }

                const updated = await db.collection('tenants').updateOne({ id }, { $set: updateData });
                if (!updated.matchedCount) return res.status(404).json({ error: 'Tenant not found' });
                const tenant = await db.collection('tenants').findOne({ id });
                return res.status(200).json({ success: true, tenant: adminTenant(tenant) });
            }

            if (action === 'delete_billing') {
                const { id } = body;
                if (!validIdentifier(id)) return res.status(400).json({ error: 'Valid billing request ID required' });
                const result = await db.collection('billing_requests').deleteOne({ id, status: { $nin: ['paid', 'approved'] } });
                if (!result.deletedCount) return res.status(400).json({ error: 'Paid billing ledger entries cannot be deleted' });
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_payment_method') {
                const { id } = body;
                if (!validIdentifier(id)) return res.status(400).json({ error: 'Valid payment method ID required' });
                const result = await db.collection('payment_methods').deleteOne({ id });
                if (!result.deletedCount) return res.status(404).json({ error: 'Payment method not found' });
                return res.status(200).json({ success: true });
            }

            if (action === 'add_payment_method') {
                const { bank_name, account_number, account_name, qr_base64 } = body;
                const bankName = String(bank_name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
                const accountNumber = String(account_number || '').replace(/\s+/g, ' ').trim().slice(0, 80);
                const accountName = String(account_name || '').replace(/\s+/g, ' ').trim().slice(0, 160);
                if (!bankName || !accountNumber || !accountName) return res.status(400).json({ error: 'Complete payment method details are required' });
                const qrImage = qr_base64 ? parseImageDataUrl(qr_base64, 600_000) : null;
                if (qr_base64 && !qrImage) return res.status(400).json({ error: 'QR image must be a valid PNG, JPEG, or WebP image' });
                const newMethod = {
                    id: crypto.randomUUID(),
                    bank_name: bankName,
                    account_number: accountNumber,
                    account_name: accountName,
                    qr_base64: qrImage && qrImage.dataUrl,
                    is_active: true,
                    created_at: new Date().toISOString()
                };
                await db.collection('payment_methods').insertOne(newMethod);
                return res.status(200).json({ success: true, method: newMethod });
            }

            if (action === 'toggle_payment_method') {
                const { id, is_active } = body;
                if (!validIdentifier(id) || typeof is_active !== 'boolean') return res.status(400).json({ error: 'Valid payment method update required' });
                const result = await db.collection('payment_methods').updateOne({ id }, { $set: { is_active } });
                if (!result.matchedCount) return res.status(404).json({ error: 'Payment method not found' });
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
                if (!validIdentifier(tenantId)) return res.status(400).json({ error: 'Valid tenant ID required' });
                const payload = {};
                if (system_model !== undefined) {
                    if (!ADMIN_TENANT_MODELS.has(system_model)) return res.status(400).json({ error: 'Invalid system model' });
                    payload.system_model = system_model;
                }
                if (system_prompt !== undefined) {
                    if (typeof system_prompt !== 'string') return res.status(400).json({ error: 'Invalid system prompt' });
                    payload.system_prompt = system_prompt.replace(/\s+/g, ' ').trim().slice(0, 1200);
                }
                if (theme_color !== undefined) {
                    if (typeof theme_color !== 'string' || !/^(?:blue|purple|green|teal|orange|dark)$/u.test(theme_color)) return res.status(400).json({ error: 'Invalid theme' });
                    payload.theme_color = theme_color;
                }
                if (temperature !== undefined) {
                    const normalizedTemperature = Number(temperature);
                    if (!Number.isFinite(normalizedTemperature) || normalizedTemperature < 0 || normalizedTemperature > 1) return res.status(400).json({ error: 'Invalid temperature' });
                    payload.temperature = normalizedTemperature;
                }
                payload.updated_at = new Date().toISOString();
                
                await db.collection('settings').updateOne({ id: tenantId }, { $set: payload }, { upsert: true });
                return res.status(200).json({ success: true });
            }

            if (action === 'get_billing_slip') {
                const id = body.id;
                if (!validIdentifier(id)) return res.status(400).json({ error: 'Valid billing request ID required' });
                const request = await db.collection('billing_requests').findOne({ id }, { projection: { _id: 0, slip_base64: 1 } });
                const image = request && parseImageDataUrl(request.slip_base64, 1_000_000);
                if (!image) return res.status(404).json({ error: 'Slip image not found' });
                return res.status(200).json({ slip: image.dataUrl });
            }

            if (action === 'update_handoff') {
                const id = String(body.id || '');
                const status = String(body.status || '');
                if (!validIdentifier(id) || !['queued', 'in_progress', 'resolved', 'closed'].includes(status)) {
                    return res.status(400).json({ error: 'Invalid handoff update' });
                }
                const result = await db.collection('handoff_tickets').updateOne({ id }, { $set: { status, updated_at: new Date().toISOString() } });
                if (!result.matchedCount) return res.status(404).json({ error: 'Handoff ticket not found' });
                return res.status(200).json({ success: true });
            }

            if (action === 'delete_knowledge') {
                const { id } = body;
                if (!validIdentifier(id)) return res.status(400).json({ error: 'Valid knowledge ID required' });
                const record = await db.collection('knowledge_chunks').findOne({ id }, { projection: { tenant_id: 1, url: 1 } });
                if (!record) return res.status(404).json({ error: 'Knowledge record not found' });
                await db.collection('knowledge_chunks').deleteMany(knowledgeDeleteFilter(record, id));
                return res.status(200).json({ success: true });
            }
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (err) {
        console.error("Admin API error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

module.exports.__rejectBillingRequest = rejectBillingRequest;
module.exports.__knowledgeDeleteFilter = knowledgeDeleteFilter;
