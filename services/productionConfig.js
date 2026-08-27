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

function validateProductionConfig(env = process.env) {
    const errors = [];
    const warnings = [];
    const requireValue = (name, minimum = 1) => {
        if (!configured(env[name]) || String(env[name]).trim().length < minimum) errors.push(`${name} is missing or too short`);
    };

    requireValue('MONGODB_URI');
    requireValue('JWT_SECRET', 32);
    requireValue('ADMIN_PASSWORD', 12);
    requireValue('CORS_ALLOWED_ORIGINS');
    requireValue('SMTP_HOST');
    requireValue('SMTP_USER');
    requireValue('SMTP_PASS');

    const origins = String(env.CORS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!origins.length || origins.some(origin => !exactHttpsOrigin(origin))) errors.push('CORS_ALLOWED_ORIGINS must contain exact HTTPS origins without wildcards or paths');
    if (env.ENFORCE_STRICT_CORS !== 'true') errors.push('ENFORCE_STRICT_CORS must be true');
    if (env.REQUIRE_TENANT_API_KEY !== 'true') errors.push('REQUIRE_TENANT_API_KEY must be true');
    if (env.INDICATOR_STRICT_SITE_ORIGIN !== 'true') errors.push('INDICATOR_STRICT_SITE_ORIGIN must be true');
    if (env.INDICATOR_ALLOW_FIRST_PARTY_DEMO !== 'false') errors.push('INDICATOR_ALLOW_FIRST_PARTY_DEMO must be false');
    if (env.INDICATOR_FILE_LEARNING !== 'false') errors.push('INDICATOR_FILE_LEARNING must be false');
    if (env.TRUST_PROXY_HEADERS !== 'true') warnings.push('TRUST_PROXY_HEADERS should be true behind a trusted ingress or platform proxy');
    if (!configured(env.RATE_LIMIT_SECRET) && configured(env.JWT_SECRET)) warnings.push('RATE_LIMIT_SECRET is not set; JWT_SECRET will also key rate-limit identities');

    const publicUrl = env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL;
    if (!exactHttpsOrigin(publicUrl)) errors.push('PUBLIC_BASE_URL or RENDER_EXTERNAL_URL must be an exact HTTPS origin');

    const paymentMode = String(env.PAYMENT_MODE || '').toLowerCase();
    if (!['stripe', 'slipok', 'both'].includes(paymentMode)) errors.push('PAYMENT_MODE must be stripe, slipok, or both for automatic billing');
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
    return { ok: errors.length === 0, errors, warnings };
}

module.exports = { exactHttpsOrigin, validateProductionConfig };
