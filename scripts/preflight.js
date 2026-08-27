'use strict';

const nodemailer = require('nodemailer');
const { closeDatabase, connectToDatabase, databaseIsReady } = require('../api/_mongodb');
const { validateProductionConfig } = require('../services/productionConfig');
const { CRITICAL_INDEXES, criticalIndexesAreReady, mongoSupportsTransactions } = require('../services/mongoIndexes');

async function verifyMongo(errors) {
    if (!await databaseIsReady()) {
        errors.push('MongoDB ping failed');
        return;
    }
    const db = await connectToDatabase();
    if (!await criticalIndexesAreReady(db)) errors.push('One or more critical MongoDB indexes are missing or incorrectly configured');
    if (!await mongoSupportsTransactions(db)) errors.push('MongoDB must be a replica set or sharded cluster for transactional billing');
}

async function verifySmtp(errors) {
    const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
    const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    try { await transport.verify(); }
    catch (_) { errors.push('SMTP verification failed'); }
    finally { transport.close(); }
}

async function stripeGet(pathname, errors) {
    const response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64')}` },
        signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) errors.push(`Stripe verification failed: ${pathname}`);
}

async function verifyStripe(errors) {
    await stripeGet('account', errors);
    await Promise.all(['STARTER', 'PRO'].map(async plan => {
        const priceId = process.env[`STRIPE_PRICE_${plan}`];
        if (priceId) await stripeGet(`prices/${encodeURIComponent(priceId)}`, errors);
    }));
}

async function verifyPublicHealth(errors) {
    const base = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
    try {
        const response = await fetch(`${base}/api/v1/livez`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) errors.push('Public liveness endpoint did not return 2xx');
    } catch (_) {
        errors.push('Public liveness endpoint is unreachable');
    }
}

async function main() {
    const validation = validateProductionConfig();
    const errors = [...validation.errors];
    validation.warnings.forEach(warning => console.warn(`WARN: ${warning}`));

    const dependencies = process.argv.includes('--dependencies') || process.argv.includes('--live');
    if (dependencies && errors.length === 0) {
        await verifyMongo(errors);
        await verifySmtp(errors);
        if (['stripe', 'both'].includes(String(process.env.PAYMENT_MODE).toLowerCase())) await verifyStripe(errors);
        if (process.argv.includes('--live')) await verifyPublicHealth(errors);
    }

    if (errors.length) {
        errors.forEach(error => console.error(`ERROR: ${error}`));
        process.exitCode = 1;
        return;
    }
    console.log(process.argv.includes('--live') ? 'Production live preflight passed' : dependencies ? 'Production dependency preflight passed' : 'Production configuration preflight passed');
}

if (require.main === module) main().catch(error => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
}).finally(() => closeDatabase().catch(() => {}));

module.exports = { REQUIRED_INDEXES: CRITICAL_INDEXES };
