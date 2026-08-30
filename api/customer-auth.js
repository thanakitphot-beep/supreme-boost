const crypto = require('crypto');
const { connectToDatabase } = require("./_mongodb.js");
const { configuredClientId, verifyGoogleCredential } = require('./_googleAuth');
const { signToken } = require('./_auth');
const { hashPassword, passwordIsValid, verifyPassword } = require('../services/passwords');
const { appendCookie, clearRegistrationGrant, readRegistrationGrant } = require('../services/registrationGrant');
const { normalizeEmail } = require('../services/email');
const { registrationMode } = require('../services/productionConfig');

const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');

async function passwordMatches(tenant, password) {
    if (!tenant) return { matches: false, needsUpgrade: false };
    return verifyPassword(tenant.password, password);
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
    const attributes = ['tenant_session=' + encodeURIComponent(token), 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=43200'];
    if (process.env.NODE_ENV === 'production') attributes.push('Secure');
    appendCookie(res, attributes.join('; '));
}

function clearTenantSession(res) {
    const attributes = ['tenant_session=', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0'];
    if (process.env.NODE_ENV === 'production') attributes.push('Secure');
    appendCookie(res, attributes.join('; '));
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

    if (!req._rateLimitChecked && !await checkRateLimit(req, res, 'auth')) {
        return;
    }

    if (req.method === 'GET') {
        const action = new URL(req.url, 'http://localhost').searchParams.get('action');
        if (action === 'public-config') {
            return res.status(200).json({
                registrationEnabled: registrationMode() === 'smtp',
                googleSignInEnabled: Boolean(configuredClientId())
            });
        }
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
    if (requestBody.action === 'register' && registrationMode() !== 'smtp') {
        return res.status(503).json({ error: 'Public registration is currently disabled' });
    }
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
                    if (existingGoogle.status === 'suspended') return res.status(403).json({ error: 'Account suspended. Please contact admin.' });
                    await db.collection('tenants').updateOne({ id: existingGoogle.id }, { $set: { 'auth.google.last_login_at': new Date().toISOString() } });
                    return respondTenant(res, 200, existingGoogle);
                }

                // Do not bind a Google identity to a password account solely by email.
                const suppliedUsername = typeof body.username === 'string' ? body.username.trim().slice(0, 160) : '';
                const suppliedPassword = typeof body.password === 'string' && body.password.length <= 256 ? body.password : '';
                const emailAccountExists = await db.collection('tenants').findOne({ email: profile.email }, { projection: { id: 1 } });
                if (emailAccountExists) {
                    const existingEmail = suppliedUsername
                        ? await db.collection('tenants').findOne({ email: profile.email, username: suppliedUsername })
                        : null;
                    const passwordCheck = await passwordMatches(existingEmail, suppliedPassword);
                    if (!existingEmail || !passwordCheck.matches) {
                        return res.status(409).json({ error: 'This email already has an account. Enter its existing username and password, then choose Google again to link it.' });
                    }
                    if (existingEmail.status === 'suspended') return res.status(403).json({ error: 'Account suspended. Please contact admin.' });
                    const now = new Date().toISOString();
                    const googleAuth = { sub: profile.sub, email: profile.email, email_verified: true, linked_at: now, last_login_at: now };
                    const updates = { 'auth.google': googleAuth };
                    if (passwordCheck.needsUpgrade) updates.password = await hashPassword(suppliedPassword, { enforcePolicy: false });
                    await db.collection('tenants').updateOne({ id: existingEmail.id }, { $set: updates });
                    return respondTenant(res, 200, { ...existingEmail, auth: { google: googleAuth } });
                }

                if (registrationMode() !== 'smtp') {
                    return res.status(503).json({ error: 'Public registration is currently disabled' });
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
                const normalizedUsername = typeof username === 'string' ? username.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
                const normalizedEmail = normalizeEmail(email);
                if (!normalizedUsername || !password) {
                    return res.status(400).json({ error: "Username and Password are required" });
                }
                if (!passwordIsValid(password)) {
                    return res.status(400).json({ error: 'Password must contain 12 to 256 characters' });
                }
                if (!normalizedEmail) {
                    return res.status(400).json({ error: 'Valid email is required' });
                }
                const registrationGrant = readRegistrationGrant(req, normalizedEmail);
                if (!registrationGrant) {
                    return res.status(403).json({ error: 'Verify your email before registering' });
                }

                // Check unique username
                const existing = await db.collection('tenants').findOne({ username: normalizedUsername });
                if (existing) {
                    return res.status(400).json({ error: "Username already exists" });
                }

                const hashedPassword = await hashPassword(password);
                const newApiKey = 'sk_live_' + crypto.randomBytes(18).toString('hex');
                
                const newTenant = {
                    id: crypto.randomUUID(),
                    company_name: normalizedUsername,
                    username: normalizedUsername,
                    email: normalizedEmail,
                    password: hashedPassword,
                    api_key: newApiKey,
                    status: 'pending',
                    package_type: 'none',
                    expires_at: null,
                    allowed_origins: [],
                    created_at: new Date().toISOString()
                };

                let grantClaimed = false;
                try {
                    await db.collection('registration_grants').insertOne({ id: registrationGrant.nonce, email: normalizedEmail, expires_at: new Date(registrationGrant.expiresAt), created_at: new Date().toISOString() });
                    grantClaimed = true;
                    await db.collection('tenants').insertOne(newTenant);
                } catch (dbErr) {
                    if (grantClaimed) await db.collection('registration_grants').deleteOne({ id: registrationGrant.nonce }).catch(() => { });
                    if (dbErr && dbErr.code === 11000) return res.status(409).json({ error: 'This email verification or account has already been used' });
                    console.warn('[AUTH] Registration failed:', dbErr.message);
                    return res.status(503).json({ error: 'Unable to create account. Please try again.' });
                }

                clearRegistrationGrant(res);
                return respondTenant(res, 200, newTenant);
            }

            // 2. Login Action
            if (action === 'login') {
                if (typeof username !== 'string' || !username.trim() || username.length > 160 || typeof password !== 'string' || !password || password.length > 256) {
                    return res.status(400).json({ error: "Username and Password are required" });
                }

                const tenant = await db.collection('tenants').findOne({ username: username.trim() });

                if (!tenant) {
                    return res.status(401).json({ error: "Invalid Username or Password" });
                }

                const passwordCheck = await passwordMatches(tenant, password);
                if (!passwordCheck.matches) {
                    return res.status(401).json({ error: "Invalid Username or Password" });
                }
                
                // Migrate old SHA-256/plaintext passwords after a valid login.
                if (passwordCheck.needsUpgrade) {
                    try {
                        const newHash = await hashPassword(password, { enforcePolicy: false });
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
