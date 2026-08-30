const { canonicalPlanId, entitlementsFor } = require('../../services/plans');

describe('Plan entitlements', () => {
    test('normalizes legacy display labels into server-owned plans', () => {
        expect(canonicalPlanId('basic')).toBe('starter');
        expect(canonicalPlanId('Pro Matrix')).toBe('pro');
        expect(canonicalPlanId('Enterprise')).toBe('enterprise');
        expect(canonicalPlanId('free-for-all')).toBeNull();
    });

    test('uses a safe starter entitlement for legacy active tenants without a plan', () => {
        const plan = entitlementsFor({ package_type: '' });
        expect(plan.id).toBe('starter');
        expect(plan.monthlyChats).toBe(1000);
        expect(plan.features.crawl).toBe(true);
    });
});
