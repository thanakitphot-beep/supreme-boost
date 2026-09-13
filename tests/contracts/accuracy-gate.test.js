const { assess } = require('../../evals/accuracy-gate');
const report = (n, passed = n) => ({ requested: n, split: 'holdout', datasetHash: 'test', rows: Array.from({ length: n }, (_, i) => ({ id: String(i), passed: i < passed })) });
test('perfect tiny samples cannot certify the 98.9% target', () => { expect(assess(report(24)).claimSupported).toBe(false); });
test('confidence bound rather than rounded sample accuracy controls the claim', () => {
    expect(assess(report(1000, 995)).claimSupported).toBe(false);
    expect(assess(report(1000, 1000)).claimSupported).toBe(true);
});
test('incomplete or repeated samples cannot certify accuracy', () => {
    const input = report(1000); input.rows[1].id = '0';
    expect(assess(input).claimSupported).toBe(false);
    input.requested = 1440;
    expect(assess(input).reasons).toContain('Incomplete run');
});
