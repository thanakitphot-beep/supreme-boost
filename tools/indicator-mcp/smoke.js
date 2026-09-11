'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function main() {
    const client = new Client({ name: 'indicator-smoke', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, 'server.js')], stderr: 'pipe' });
    try {
        await client.connect(transport);
        const list = await client.listTools();
        assert.equal(list.tools.length, 3);
        const preview = await client.callTool({ name: 'indicator_preview', arguments: { prompt: 'สวัสดี' } });
        assert.ok(!preview.isError);
        assert.equal(JSON.parse(preview.content[0].text).actionExecuted, false);
        const context = await client.callTool({ name: 'indicator_context', arguments: { prompt: 'ราคาเท่าไร', entities: [{ title: 'ตัวอย่าง', price: 765 }] } });
        assert.ok(JSON.parse(context.content[0].text).messages.at(-1).content.includes('"price":765'));
        const invalid = await client.callTool({ name: 'indicator_preview', arguments: { prompt: '' } });
        assert.equal(invalid.isError, true);
        const audit = await client.callTool({ name: 'indicator_training_audit', arguments: {} });
        assert.ok(!audit.isError);
        assert.ok(JSON.parse(audit.content[0].text).corpusHash);
        console.log('PASS: MCP initialize, discover 3 tools, preview, context, invalid input, training audit');
    } finally {
        await client.close();
        await transport.close();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
