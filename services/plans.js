'use strict';

const { connectToDatabase } = require('../api/_mongodb');
const { incrementBoundedCounter } = require('./mongoCounter');

const PLANS = {
    starter: {
        id: 'starter',
        monthlyPriceThb: 990,
        chatPerMinute: 20,
        monthlyChats: 1000,
        monthlyCrawls: 20,
        monthlyHandoffs: 25,
        monthlyKnowledgeOperations: 50,
        features: { crawl: true, handoff: true, knowledge: true, memory: true }
    },
    pro: {
        id: 'pro',
        monthlyPriceThb: 2490,
        chatPerMinute: 60,
        monthlyChats: 10000,
        monthlyCrawls: 100,
        monthlyHandoffs: 250,
        monthlyKnowledgeOperations: 500,
        features: { crawl: true, handoff: true, knowledge: true, memory: true }
    },
    enterprise: {
        id: 'enterprise',
        monthlyPriceThb: null,
        chatPerMinute: 180,
        monthlyChats: 100000,
        monthlyCrawls: 1000,
        monthlyHandoffs: 2500,
        monthlyKnowledgeOperations: 5000,
        features: { crawl: true, handoff: true, knowledge: true, memory: true }
    }
};

const PLAN_ALIASES = {
    basic: 'starter',
    starter: 'starter',
    pro: 'pro',
    'pro matrix': 'pro',
    enterprise: 'enterprise'
};

function canonicalPlanId(value) {
    const key = String(value || '').trim().toLocaleLowerCase('en-US');
    return PLAN_ALIASES[key] || null;
}

function entitlementsFor(tenant) {
    const plan = PLANS[canonicalPlanId(tenant && tenant.package_type) || 'starter'];
    return { ...plan, features: { ...plan.features } };
}

function usagePeriod(tenant) {
    const billingEnd = new Date(tenant && tenant.billing && tenant.billing.current_period_end || 0);
    if (Number.isFinite(billingEnd.getTime()) && billingEnd.getTime() > Date.now()) {
        return { key: `billing:${billingEnd.toISOString()}`, expiresAt: billingEnd };
    }
    const now = new Date();
    return {
        key: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
        expiresAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    };
}

function usageLimit(plan, metric) {
    if (metric === 'chat') return plan.monthlyChats;
    if (metric === 'crawl') return plan.monthlyCrawls;
    if (metric === 'handoff') return plan.monthlyHandoffs;
    if (metric === 'knowledge') return plan.monthlyKnowledgeOperations;
    return 0;
}

async function loadEntitledTenant(tenantId) {
    const db = await connectToDatabase();
    if (!db) return null;
    const tenant = await db.collection('tenants').findOne({ id: String(tenantId || '') });
    if (!tenant || tenant.status !== 'active') return null;
    if (tenant.expires_at && new Date(tenant.expires_at).getTime() < Date.now()) return null;
    return { ...tenant, entitlements: entitlementsFor(tenant) };
}

async function usageSnapshot(tenant) {
    const plan = entitlementsFor(tenant);
    const empty = { chat: 0, crawl: 0, handoff: 0, knowledge: 0 };
    const tenantId = String(tenant && tenant.id || '');
    const db = tenantId ? await connectToDatabase() : null;
    const period = usagePeriod(tenant);
    const record = db ? await db.collection('tenant_usage').findOne({ tenant_id: tenantId, period_key: period.key }, { projection: { usage: 1 } }) : null;
    return {
        period: period.key,
        usage: { ...empty, ...record && record.usage },
        limits: { chat: plan.monthlyChats, crawl: plan.monthlyCrawls, handoff: plan.monthlyHandoffs, knowledge: plan.monthlyKnowledgeOperations }
    };
}

async function consumeUsage(tenant, metric) {
    const plan = entitlementsFor(tenant);
    const limit = usageLimit(plan, metric);
    if (!limit) return { allowed: false, status: 403, reason: 'This plan does not include this feature', plan };

    const tenantId = String(tenant && tenant.id || '');
    if (!tenantId || tenantId === 'demo' || tenantId === 'test') return { allowed: true, plan, remaining: limit };

    const db = await connectToDatabase();
    if (!db) {
        if (process.env.NODE_ENV === 'production') return { allowed: false, status: 503, reason: 'Usage service is unavailable', plan };
        return { allowed: true, plan, remaining: limit };
    }

    const period = usagePeriod(tenant);
    const periodKey = period.key;
    const field = `usage.${metric}`;
    try {
        const result = await incrementBoundedCounter(
            db.collection('tenant_usage'),
            { tenant_id: tenantId, period_key: periodKey },
            field,
            limit,
            { expires_at: period.expiresAt, created_at: new Date() }
        );
        if (!result.allowed) {
            return { allowed: false, status: 429, reason: `Monthly ${metric} quota reached`, plan, remaining: 0 };
        }
        return { allowed: true, plan, remaining: Math.max(0, limit - result.count) };
    } catch (_) {
        if (process.env.NODE_ENV === 'production') return { allowed: false, status: 503, reason: 'Usage service is unavailable', plan };
        return { allowed: true, plan, remaining: limit };
    }
}

module.exports = { PLANS, canonicalPlanId, consumeUsage, entitlementsFor, loadEntitledTenant, usageSnapshot };
