const crypto = require('crypto');
const { connectToDatabase } = require("./_mongodb.js");
const { configuredClientId, verifyGoogleCredential } = require('./_googleAuth');
const { signToken } = require('./_auth');

const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function passwordMatches(tenant, password) {
    if (!tenant || typeof password !== 'string' || !password) return false;
    const hashed = hashPassword(password);
    return tenant.password === hashed || tenant.password === password;
}

function publicTenant(tenant) {
    return {
        id: tenant.id,
        username: tenant.username,
        company_name: tenant.company_name,
        api_key: tenant.api_key,
        status: tenant.status,
        package_type: tenant.package_type,
        expires_at: tenant.expires_at,
        created_at: tenant.created_at,
        allowed_origins: Array.isArray(tenant.allowed_origins) ? tenant.allowed_origins : []
    };
}

function setTenantSession(res, tenant) {
    const token = signToken({ role: 'tenant', tenantId: tenant.id, sub: tenant.id });
    if (!token) throw new Error('Tenant session is not configured');
    const attributes = ['tenant_session=' + encodeURIComponent(token), 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=43200'];
    if (process.env.NODE_ENV === 'production') attributes.push('Secure');
    res.setHeader('Set-Cookie', attributes.join('; '));
}

function clearTenantSession(res) {
    const attributes = ['tenant_session=', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
    if (process.env.NODE_ENV === 'production') attributes.push('Secure');
    res.setHeader('Set-Cookie', attributes.join('; '));
}

function respondTenant(res, status, tenant) {
    setTenantSession(res, tenant);
    return res.status(status).json({ success: true, tenant: publicTenant(tenant) });
}

async function uniqueGoogleUsername(db, email) {
    const base = String(email || 'google-user').split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'google-user';
    for (let attempt = 0; attempt < 10; attempt++) {
        const username = attempt === 0 ? base : `${base}-${crypto.randomBytes(3).toString('hex')}`;
        if (!await db.collection('tenants').findOne({ username })) return username;
    }
    return null;
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === "OPTIONS") return res.status(200).end();

    if (!req._rateLimitChecked && !checkRateLimit(req, res, 'auth')) {
        return;
    }

    if (req.method === 'GET') {
        const action = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('action');
        if (action === 'google-config') {
            const clientId = configuredClientId();
            return clientId ? res.status(200).json({ clientId }) : res.status(503).json({ error: 'Google Sign-In is not configured' });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let requestBody;
    try { requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
    catch (_) { return res.status(400).json({ error: 'Invalid request body' }); }
    if (requestBody.action === 'logout') {
        clearTenantSession(res);
        return res.status(200).json({ success: true });
    }

    const db = await connectToDatabase();
    if (!db) return res.status(503).json({ error: "Database is not configured" });

    try {
        if (req.method === "POST") {
            const body = requestBody;
            const { action, username, password } = body;

            if (action === 'google') {
                const verified = await verifyGoogleCredential(body.credential);
                if (verified.error) {
                    const status = configuredClientId() ? 401 : 503;
                    return res.status(status).json({ error: verified.error });
                }

                const profile = verified.profile;
                const existingGoogle = await db.collection('tenants').findOne({ 'auth.google.sub': profile.sub });
                if (existingGoogle) {
                    await db.collection('tenants').updateOne({ id: existingGoogle.id }, { $set: { 'auth.google.last_login_at': new Date().toISOString() } });
                    return respondTenant(res, 200, existingGoogle);
                }

                // Do not bind a Google identity to a password account solely by email.
                const existingEmail = await db.collection('tenants').findOne({ email: profile.email });
                if (existingEmail) {
                    const suppliedUsername = String(body.username || '').trim();
                    if (suppliedUsername !== existingEmail.username || !passwordMatches(existingEmail, body.password)) {
                        return res.status(409).json({ error: 'This email already has an account. Enter its existing username and password, then choose Google again to link it.' });
                    }
                    const now = new Date().toISOString();
                    const googleAuth = { sub: profile.sub, email: profile.email, email_verified: true, linked_at: now, last_login_at: now };
                    const updates = { 'auth.google': googleAuth };
                    if (existingEmail.password === body.password && existingEmail.password !== hashPassword(body.password)) updates.password = hashPassword(body.password);
                    await db.collection('tenants').updateOne({ id: existingEmail.id }, { $set: updates });
                    return respondTenant(res, 200, { ...existingEmail, auth: { google: googleAuth } });
                }

                const googleUsername = await uniqueGoogleUsername(db, profile.email);
                if (!googleUsername) return res.status(503).json({ error: 'Unable to create a unique account name. Please try again.' });
                const now = new Date().toISOString();
                const newTenant = {
                    id: crypto.randomUUID(),
                    company_name: profile.name || googleUsername,
                    username: googleUsername,
                    email: profile.email,
                    api_key: 'sk_live_' + crypto.randomBytes(18).toString('hex'),
                    status: 'pending',
                    package_type: 'none',
                    expires_at: null,
                    allowed_origins: [],
                    auth: { google: { sub: profile.sub, email: profile.email, email_verified: true, linked_at: now, last_login_at: now } },
                    created_at: now
                };
                try {
                    await db.collection('tenants').insertOne(newTenant);
                } catch (_) {
                    return res.status(409).json({ error: 'Google account is already linked. Please sign in again.' });
                }
                return respondTenant(res, 201, newTenant);
            }

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
                const newApiKey = 'sk_live_' + crypto.randomBytes(18).toString('hex');
                
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
                    allowed_origins: [],
                    created_at: new Date().toISOString()
                };

                try {
                    await db.collection('tenants').insertOne(newTenant);
                } catch (dbErr) {
                    console.warn('[AUTH] MongoDB insertOne failed, ignoring for read-only DB:', dbErr.message);
                }

                return respondTenant(res, 200, newTenant);
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

                const hashMatch = tenant.password === hashPassword(password);
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

                return respondTenant(res, 200, tenant);
            }

            return res.status(400).json({ error: "Invalid action" });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error('Customer Auth Error:', err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
