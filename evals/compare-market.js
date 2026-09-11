'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildContext } = require('../services/ai/contextBuilder');
const { grade } = require('./run-thai-assistant');
const cases = require('./thai-assistant.cases');
const tools = require('../services/tools').getAvailableTools();
async function main() {
    if (!process.argv.includes('--live')) throw new Error('Use --live to make paid model requests');
    const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
    const providers = [
        { name: 'openai', model: 'gpt-4.1-mini-2025-04-14', key: env.OPENAI_API_KEY },
        { name: 'gemini', model: 'gemini-2.5-flash', key: env.GEMINI_API_KEY },
        { name: 'groq', model: 'qwen/qwen3.8-27b', key: env.GROQ_API_KEY }
    ];
    const report = { createdAt: new Date().toISOString(), datasetHash: crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex'), limitation: 'Same INDICATOR prompt and synthetic tasks across commercial model APIs, not full commercial agents. Keyword/action grading requires human review. No fallback; unavailable calls are failures. No model weights trained.', providers: [] };
    const output = path.join(__dirname, 'results', 'market-' + Date.now() + '.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2));
    const oldLog = console.log; console.log = () => {};
    try {
        for (const config of providers.filter(item => !process.argv.includes('--groq-only') || item.name === 'groq')) {
            const Provider = require('../services/ai/providers/' + config.name);
            const provider = new Provider({ apiKey: config.key, model: config.model });
            const group = { provider: config.name, model: config.model, requested: cases.length, completed: 0, passed: 0, rows: [] };
            report.providers.push(group);
            let consecutiveFailures = 0;
            for (const test of cases) {
                const started = Date.now();
                const row = { id: test.id };
                try {
                    if (!config.key) throw new Error('missing_key');
                    const context = buildContext({ userMessage: test.prompt, ragContext: test.context, memory: test.memory || [], tools });
                    const raw = await provider.generate(context, { model: config.model, temperature: 0, maxTokens: 700, signal: AbortSignal.timeout(25000) });
                    row.result = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''));
                    row.failures = grade(test, row.result);
                    consecutiveFailures = 0;
                } catch (error) {
                    row.failures = ['response_unavailable'];
                    row.httpStatus = error.status || null;
                    row.errorType = error.name;
                    consecutiveFailures++;
                }
                row.latencyMs = Date.now() - started;
                row.passed = row.failures.length === 0;
                group.rows.push(row); group.completed++; group.passed += Number(row.passed);
                save();
                process.stdout.write(`${config.name}/${test.id}: ${row.passed ? 'PASS' : 'FAIL'}${row.httpStatus ? ' HTTP ' + row.httpStatus : ''}\n`);
                if (consecutiveFailures >= 2) break;
                await new Promise(resolve => setTimeout(resolve, 1100));
            }
        }
    } finally { console.log = oldLog; save(); }
    console.log(JSON.stringify({ output, summary: report.providers.map(({ provider, model, requested, completed, passed }) => ({ provider, model, requested, completed, passed })) }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
