'use strict';

const { closeDatabase, connectToDatabase } = require('../api/_mongodb');
const { CRITICAL_INDEXES } = require('../services/mongoIndexes');
const { CHECKOUT_LOCK_STATUSES } = require('../services/billing');

function indexOptions(specification) {
    const options = { name: specification.name };
    for (const key of ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression']) {
        if (specification[key] !== undefined) options[key] = specification[key];
    }
    return options;
}

async function main() {
    const db = await connectToDatabase();
    if (!db) throw new Error('MongoDB is not configured or reachable');

    let billingIndexes = [];
    try { billingIndexes = await db.collection('billing_requests').indexes(); }
    catch (error) { if (!error || error.code !== 26) throw error; }
    const legacyReferenceIndex = billingIndexes.find(index => index.name === 'billing_provider_reference_unique' && !index.partialFilterExpression);
    if (legacyReferenceIndex) await db.collection('billing_requests').dropIndex(legacyReferenceIndex.name);

    let tenantIndexes = [];
    try { tenantIndexes = await db.collection('tenants').indexes(); }
    catch (error) { if (!error || error.code !== 26) throw error; }
    if (tenantIndexes.some(index => index.name === 'tenant_email_unique')) {
        await db.collection('tenants').dropIndex('tenant_email_unique');
    }

    // Checkout keys are transient locks, not permanent ledger identifiers.
    await db.collection('billing_requests').updateMany(
        { checkout_key: { $type: 'string' }, status: { $nin: CHECKOUT_LOCK_STATUSES } },
        { $unset: { checkout_key: '' } }
    );

    // Sequential creation is gentler on shared/free MongoDB clusters.
    for (const specification of CRITICAL_INDEXES) {
        await db.collection(specification.collection).createIndex(specification.key, indexOptions(specification));
    }

    console.log('MongoDB indexes are ready');
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(() => closeDatabase().catch(() => {}));
