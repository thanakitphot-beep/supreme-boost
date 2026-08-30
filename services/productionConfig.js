'use strict';

function configured(value) {
    const text = String(value || '').trim();
    return Boolean(text && !/^(your_|change[-_]?me|replace[-_]?me|<)/iu.test(text));
}

function exactHttpsOrigin(value) {
    try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'https:' && Boolean(url.hostname) && !url.hostname.includes('*') && !url.username && !url.password && !url.search && !url.hash && (!url.pathname || url.pathname === '/');
    } catch (_) {
        return false;
    }
}

function deploymentOrigin(env = process.env) {
    for (const value of [env.PUBLIC_BASE_URL, env.RENDER_EXTERNAL_URL, env.RENDER_SERVICE_URL]) {
        const candidate = String(value || '').trim();
        if (exactHttpsOrigin(candidate)) return new URL(candidate).origin;
    }
    const serviceName = String(env.RENDER_SERVICE_NAME || '').trim().toLowerCase();
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(serviceName) ? `https://${serviceName}.onrender.com` : '';
}

function hasCharacterDiversity(value, minimumUnique) {
    return new Set(String(value || '')).size >= minimumUnique;
}

function registrationMode(env = process.env) {
    return String(env.REGISTRATION_MODE || 'disabled').trim().toLowerCase();
}

function handoffDeliveryMode(env = process.env) {
    return String(env.HANDOFF_DELIVERY_MODE || 'contact_only').trim().toLowerCase();
}

function validateProductionConfig(env = process.env) {
    const errors = [];
    const warnings = [];
    const requireValue = (name, minimum = 1) => {
        if (!configured(env[name]) || String(env[name]).trim().length < minimum) errors.push(`${name} is missing or too short`);
    };

    requireValue('MONGODB_URI');
    requireValue('JWT_SECRET', 32);
    requireValue('ADMIN_PASSWORD', 12);
    const jwtSecret = String(env.JWT_SECRET || '').trim();
    const adminPassword = String(env.ADMIN_PASSWORD || '').trim();
    if (configured(jwtSecret) && !hasCharacterDiversity(jwtSecret, 8)) errors.push('JWT_SECRET must be randomly generated');
    if (configured(adminPassword) && !hasCharacterDiversity(adminPassword, 8)) errors.push('ADMIN_PASSWORD is too predictable');
    if (configured(jwtSecret) && jwtSecret === adminPassword) errors.push('JWT_SECRET and ADMIN_PASSWORD must be different');
    requireValue('CORS_ALLOWED_ORIGINS');

    if (![env.OPENAI_API_KEY, env.GEMINI_API_KEY, env.GROQ_API_KEY, env.API_KEY, env.LOCAL_AI_BASE_URL].some(configured)) {
        errors.push('At least one AI provider must be configured');
    }

    const registration = registrationMode(env);
    const handoff = handoffDeliveryMode(env);
    if (!['disabled', 'smtp'].includes(registration)) errors.push('REGISTRATION_MODE must be disabled or smtp');
    if (!['contact_only', 'smtp'].includes(handoff)) errors.push('HANDOFF_DELIVERY_MODE must be contact_only or smtp');
    if (registration === 'smtp' || handoff === 'smtp') {
        requireValue('SMTP_HOST');
        requireValue('SMTP_USER');
        requireValue('SMTP_PASS');
    }
    if (registration === 'disabled') warnings.push('Public registration is disabled');
    if (handoff === 'contact_only') warnings.push('Handoff email delivery is disabled; requests remain in the support queue');

    const configuredOrigins = String(env.CORS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const origins = configuredOrigins.filter(exactHttpsOrigin);
    if (configuredOrigins.length !== origins.length) warnings.push('Invalid CORS origins are ignored');
    if (!origins.length && deploymentOrigin(env)) origins.push(deploymentOrigin(env));
    if (!origins.length || origins.some(origin => !exactHttpsOrigin(origin))) errors.push('CORS_ALLOWED_ORIGINS must contain exact HTTPS origins without wildcards or paths');
    if (env.INDICATOR_ALLOW_FIRST_PARTY_DEMO === 'true') errors.push('INDICATOR_ALLOW_FIRST_PARTY_DEMO must not be enabled in production');
    if (env.INDICATOR_FILE_LEARNING === 'true') errors.push('INDICATOR_FILE_LEARNING must not be enabled in production');
    if (env.TRUST_PROXY_HEADERS !== 'true') warnings.push('TRUST_PROXY_HEADERS should be true behind a trusted ingress or platform proxy');
    if (!configured(env.RATE_LIMIT_SECRET) && configured(env.JWT_SECRET)) warnings.push('RATE_LIMIT_SECRET is not set; JWT_SECRET will also key rate-limit identities');

    const publicUrl = deploymentOrigin(env);
    if (!exactHttpsOrigin(publicUrl)) errors.push('PUBLIC_BASE_URL or RENDER_EXTERNAL_URL must be an exact HTTPS origin');

    const paymentMode = String(env.PAYMENT_MODE || 'manual').trim().toLowerCase();
    if (!['manual', 'stripe', 'slipok', 'both'].includes(paymentMode)) errors.push('PAYMENT_MODE must be manual, stripe, slipok, or both');
    if (paymentMode === 'manual') warnings.push('Payments require manual approval');
    if (['stripe', 'both'].includes(paymentMode)) {
        requireValue('STRIPE_SECRET_KEY', 12);
        requireValue('STRIPE_WEBHOOK_SECRET', 12);
        requireValue('STRIPE_PRICE_STARTER');
        requireValue('STRIPE_PRICE_PRO');
        if (!exactHttpsOrigin(env.STRIPE_SUCCESS_URL) && !/^https:\/\/[^\s]+$/u.test(String(env.STRIPE_SUCCESS_URL || ''))) errors.push('STRIPE_SUCCESS_URL must be HTTPS');
        if (!exactHttpsOrigin(env.STRIPE_CANCEL_URL) && !/^https:\/\/[^\s]+$/u.test(String(env.STRIPE_CANCEL_URL || ''))) errors.push('STRIPE_CANCEL_URL must be HTTPS');
    }
    if (['slipok', 'both'].includes(paymentMode)) {
        requireValue('SLIPOK_API_KEY');
        requireValue('SLIPOK_BRANCH_ID');
        requireValue('SLIPOK_RECEIVER_ACCOUNT', 4);
    }
    if (env.NODE_ENV !== 'production') warnings.push('NODE_ENV is not production');
    return { ok: errors.length === 0, errors, warnings, modes: { registration, handoff, payment: paymentMode } };
}

module.exports = { deploymentOrigin, exactHttpsOrigin, handoffDeliveryMode, registrationMode, validateProductionConfig };
