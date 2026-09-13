'use strict';
// A conservative gate for a scoped accuracy claim, not general intelligence.
function assess(report) {
    const rows = report.rows || [], n = rows.length;
    const successes = rows.filter(row => row.passed === true).length;
    const p = n ? successes / n : 0, z = 1.96;
    const lower = n ? (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n) : 0;
    const reasons = [];
    if (n < 1000) reasons.push('At least 1,000 evaluated examples are required');
    if (new Set(rows.map(row => row.id)).size !== n) reasons.push('Duplicate example IDs');
    if (report.requested !== n) reasons.push('Incomplete run');
    if (report.split !== 'holdout' || !report.datasetHash) reasons.push('Versioned holdout required');
    if (lower < 0.989) reasons.push('95% Wilson lower bound is below 98.9%');
    return { targetPercent: 98.9, evaluated: n, passed: successes, observedPercent: 100*p, lower95Percent: 100*lower, claimSupported: !reasons.length, reasons,
        scope: 'Only the specified dataset and grader. Human review and wider language/task coverage are required for market comparisons.' };
}
if (require.main === module) {
    const report = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
    const result = assess(report);
    console.log(JSON.stringify(result, null, 2));
    if (!result.claimSupported) process.exitCode = 1;
}
module.exports = { assess };
