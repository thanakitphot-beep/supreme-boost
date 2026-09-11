'use strict';

// stdout belongs exclusively to MCP JSON-RPC, including logs from imports.
console.log = (...args) => console.error(...args);
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { runIndicatorAgent } = require('../../services/indicatorAgent');
const { buildContext } = require('../../services/ai/contextBuilder');
const { buildArtifacts } = require('../../evals/prepare-agent-training');

const server = new McpServer({ name: 'indicator-local', version: '1.0.0' });
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const inputSchema = {
    prompt: z.string().trim().min(1).max(1200),
    pageContent: z.string().max(6000).optional(),
    entities: z.array(z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(400).optional(),
        price: z.number().nonnegative().finite().optional(),
        inStock: z.boolean().optional()
    }).strict()).max(120).optional()
};
const payload = args => ({ prompt: args.prompt, pageContent: args.pageContent || '', url: 'https://mcp-preview.invalid/', siteDNA: { entityIndex: args.entities || [] } });
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

server.registerTool('indicator_preview', {
    description: 'Preview the local INDICATOR deterministic website resolver with supplied public sample facts. Does not call a language model, execute browser actions, connect staff, or train weights. Actions are proposals only.',
    inputSchema, annotations
}, args => result({ mode: 'offline-resolver-preview', actionExecuted: false, result: runIndicatorAgent(payload(args)) }));

server.registerTool('indicator_context', {
    description: 'Inspect the exact bounded model prompt built from supplied sample facts. Diagnoses lost prices, missing context and instruction separation without calling a paid API.',
    inputSchema, annotations
}, args => result(buildContext({ ...payload(args), userMessage: args.prompt })));

server.registerTool('indicator_training_audit', {
    description: 'Validate the synthetic INDICATOR training curriculum and return split counts and hashes. Does not upload data or train a model; this is not a market benchmark.',
    inputSchema: {}, annotations
}, () => result(buildArtifacts().manifest));

server.connect(new StdioServerTransport()).catch(() => {
    console.error('INDICATOR MCP could not start');
    process.exitCode = 1;
});
