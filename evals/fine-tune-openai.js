'use strict';
// Explicit live operations only. Never prints credentials or raw API error bodies.
const fs = require('node:fs');
const path = require('node:path');
const { validateArtifacts } = require('./prepare-agent-training');
const directory = path.join(__dirname, 'generated');
const statePath = path.join(__dirname, 'results', 'fine-tune-job.json');
const model = 'gpt-4.1-mini-2025-04-14';
async function main() {
    const action = process.argv[2];
    const manifest = validateArtifacts(directory);
    const plan = { model, epochs: 1, examples: manifest.examples, trainBytes: fs.statSync(path.join(directory, 'train.jsonl')).size, corpusHash: manifest.corpusHash };
    if (!['start', 'status'].includes(action)) return console.log(JSON.stringify(plan, null, 2));
    const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
    const key = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is missing');
    const api = async (route, options = {}) => {
        const response = await fetch('https://api.openai.com/v1/' + route, { ...options, headers: { Authorization: 'Bearer ' + key, ...options.headers }, signal: AbortSignal.timeout(45000) });
        const body = await response.json();
        if (!response.ok) throw new Error(`OpenAI HTTP ${response.status} (${body.error?.code || body.error?.type || 'request_failed'})`);
        return body;
    };
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : { ...plan };
    const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    if (action === 'start' && !state.jobId) {
        if (state.createAttempted) throw new Error('Previous job creation outcome is uncertain; inspect the dashboard before retrying');
        if (state.corpusHash !== plan.corpusHash) throw new Error('Training corpus changed; review the existing job state');
        // Probe paid inference before uploading files or scheduling training.
        await api('chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply OK' }], max_tokens: 3 }) });
        for (const split of ['train', 'validation']) {
            if (state[split + 'File']) continue;
            const data = new FormData();
            data.append('purpose', 'fine-tune');
            data.append('file', new Blob([fs.readFileSync(path.join(directory, split + '.jsonl'))], { type: 'application/jsonl' }), 'indicator-' + split + '.jsonl');
            state[split + 'File'] = (await api('files', { method: 'POST', body: data })).id;
            save();
        }
        state.createAttempted = true;
        save();
        const job = await api('fine_tuning/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, training_file: state.trainFile, validation_file: state.validationFile, suffix: 'indicator-th', method: { type: 'supervised', supervised: { hyperparameters: { n_epochs: 1 } } } }) });
        state.jobId = job.id;
        save();
    }
    if (!state.jobId) throw new Error('No training job has been created');
    const job = await api('fine_tuning/jobs/' + encodeURIComponent(state.jobId));
    Object.assign(state, { status: job.status, fineTunedModel: job.fine_tuned_model, trainedTokens: job.trained_tokens, errorCode: job.error?.code, checkedAt: new Date().toISOString() });
    save();
    console.log(JSON.stringify(state, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
