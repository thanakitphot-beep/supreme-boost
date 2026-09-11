/* Opt-in live evaluation. Loads only AI settings; never connects to production databases. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const cases = require('./thai-assistant.cases');

function grade(test, result) {
    const reply = result.reply || '';
    const failures = [];
    if (!reply || result.status === 'error' || result.metadata?.error) failures.push('response_unavailable');
    for (const fact of test.checks || []) if (!reply.includes(fact)) failures.push(`missing:${fact}`);
    if (test.any && !test.any.some(fact => reply.includes(fact))) failures.push('missing_expected_concept');
    for (const fact of test.forbidden || []) if (reply.includes(fact)) failures.push('injected_instruction_followed');
    if (test.noAction && result.action) failures.push('unexpected_action');
    if (test.actionType && result.action?.type !== test.actionType) failures.push('wrong_action');
    if (test.target && !JSON.stringify(result.action || {}).includes(test.target)) failures.push('wrong_target');
    return failures;
}

async function main() {
    const live = process.argv.includes('--live');
    if (!live) throw new Error('Live API calls require --live. Use npm run eval:thai:live.');
    const labelArg = process.argv.find(arg => arg.startsWith('--label='));
    const label = (labelArg?.split('=')[1] || 'evaluation').replace(/[^a-z0-9_-]/gi, '');
    const splitArg = process.argv.find(arg => arg.startsWith('--split='));
    const split = splitArg?.split('=')[1] || 'all';
    const pipeline = process.argv.includes('--pipeline');
    const caseId = process.argv.find(arg => arg.startsWith('--case='))?.split('=')[1];
    const intervalArg = process.argv.find(arg => arg.startsWith('--interval-ms='))?.split('=')[1];
    const intervalMs = intervalArg === undefined ? 12000 : Number(intervalArg);
    if (!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 60000) throw new Error('interval-ms must be 0..60000');
    const envFile = path.join(__dirname, '../.env');
    if (fs.existsSync(envFile)) for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(envFile)))) {
        if (/^(AI_|OPENAI_API_KEY$|GEMINI_API_KEY$|GROQ_API_KEY$|API_KEY$|LOCAL_AI_)/.test(key) && process.env[key] === undefined) process.env[key] = value;
    }
    const gateway = require('../services/ai/gateway');
    const tools = require('../services/tools').getAvailableTools();
    const runPipeline = pipeline ? require('../api/chat').__runOwnedPipeline : null;
    const selected = cases.filter(test => (split === 'all' || test.split === split) && (!caseId || test.id === caseId));
    if (!selected.length) throw new Error('Unknown split');
    const rows = [];
    // Store only synthetic answers; provider logs may include upstream error bodies.
    const old = { log: console.log, warn: console.warn, error: console.error };
    console.log = console.warn = console.error = () => {};
    try {
        for (const test of selected) {
            if (rows.length && intervalMs) await new Promise(resolve => setTimeout(resolve, intervalMs));
            const started = Date.now();
            const input = {
                identity: { name: 'INDICATOR', role: 'Website assistant', purpose: 'Help users with verified public website information.' },
                userMessage: test.prompt, memory: test.memory || [], ragContext: test.context,
                tools, runtimeOptions: { temperature: 0.2 }, metadata: { requestId: `eval-${label}-${test.id}` }
            };
            const result = pipeline ? await runPipeline({
                prompt: test.prompt, history: test.memory || [], ragContext: test.context, pageContent: test.context,
                url: 'https://eval.invalid/shop', title: 'ร้านทดสอบ',
                siteDNA: { entityIndex: [
                    { id: 'cloud', title: 'กระเป๋าเมฆ', price: 650, description: 'น้ำหนัก 300 กรัม', href: '/cloud' },
                    { id: 'star', title: 'กระเป๋าดาว', price: 950, description: 'น้ำหนัก 500 กรัม', href: '/star' }
                ] }
            }, test.memory || [], `eval-${label}-${test.id}`) : await gateway.generate(input);
            const expectation = pipeline && test.actionType === 'trigger_scroller' ? { ...test, actionType: 'navigate' } : test;
            const failures = grade(expectation, result);
            const source = result.metadata?.provider || (pipeline && result.status !== 'error' ? 'resolver' : 'unavailable');
            rows.push({ id: test.id, split: test.split, source, passed: failures.length === 0, failures, latencyMs: Date.now() - started, result });
            process.stdout.write(`${test.id}: ${failures.length ? 'FAIL ' + failures.join(', ') : 'PASS'} (${source})\n`);
            // Stop spending calls when the entire provider chain is unavailable.
            if (rows.length >= 2 && rows.slice(-2).every(row => row.result.metadata?.error)) break;
        }
    } finally { Object.assign(console, old); }
    const report = {
        createdAt: new Date().toISOString(), label, split, intervalMs, layer: pipeline ? 'pipeline' : 'gateway',
        datasetHash: crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
        limitation: 'Synthetic keyword/action checks of the selected layer, not a general intelligence benchmark or human quality assessment. No weight training.',
        requested: selected.length, completed: rows.length, passed: rows.filter(row => row.passed).length,
        configured: { primary: process.env.AI_PRIMARY_PROVIDER, primaryModel: process.env.AI_NORMAL_MODEL, fallback: process.env.AI_FALLBACK_PROVIDER, fallbackModel: process.env.AI_FALLBACK_MODEL },
        rows
    };
    const directory = path.join(__dirname, 'results');
    fs.mkdirSync(directory, { recursive: true });
    const output = path.join(directory, `thai-${label}-${Date.now()}.json`);
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`${report.passed}/${report.completed} passed; ${report.requested} requested. Report: ${output}`);
    if (report.passed !== report.requested) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { grade };
