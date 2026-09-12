'use strict';
// Local stdio developer tools. Never loads credentials, connects to customer
// databases, evaluates code, or executes generated browser actions.
const readline = require('node:readline');
const registry = require('../services/tools');
const { buildArtifacts } = require('../evals/prepare-agent-training');
const names = ['calculate', 'search_website', 'compare_products'];
function toolList() {
    return [{ name: 'indicator_training_status', description: 'Read synthetic training curriculum counts and hash. No model training is started.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
        ...registry.getAvailableTools({ allowedTools: names }).map(tool => ({ name: tool.name, description: tool.description,
            inputSchema: { type: 'object', required: ['arguments'], additionalProperties: false, properties: {
                arguments: tool.parameters,
                website: { type: 'object', description: 'Public website data supplied for this call only', properties: {
                    pageContent: { type: 'string', maxLength: 12000 },
                    entityIndex: { type: 'array', maxItems: 120, items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, price: { type: 'number' }, description: { type: 'string' } } } }
                } }
            } } }))];
}
async function handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    if (message.id === undefined) return null;
    let result;
    if (message.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'indicator-developer-tools', version: '1.0.0' } };
    else if (message.method === 'ping') result = {};
    else if (message.method === 'tools/list') result = { tools: toolList() };
    else if (message.method === 'tools/call') {
        const { name, arguments: args = {} } = message.params || {};
        let value;
        if (name === 'indicator_training_status') { const m = buildArtifacts().manifest; value = { examples: m.examples, splits: m.splits, corpusHash: m.corpusHash, weightTrainingPerformed: false }; }
        else if (names.includes(name)) {
            const website = args.website || {};
            value = await registry.execute(name, args.arguments, { allowedTools: names, payload: {
                pageContent: typeof website.pageContent === 'string' ? website.pageContent.slice(0, 12000) : '',
                siteDNA: { entityIndex: Array.isArray(website.entityIndex) ? website.entityIndex.slice(0, 120) : [] }
            } });
        } else return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Unknown tool' } };
        result = { content: [{ type: 'text', text: JSON.stringify(value) }], isError: value.success === false };
    } else return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
    return { jsonrpc: '2.0', id: message.id, result };
}
if (require.main === module) {
    const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    input.on('line', async line => {
        let response;
        try {
            if (Buffer.byteLength(line) > 100000) throw Error('Request too large');
            response = await handle(JSON.parse(line));
        } catch (_) { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON request' } }; }
        if (response) process.stdout.write(JSON.stringify(response) + '\n');
    });
}
module.exports = { handle, toolList };
