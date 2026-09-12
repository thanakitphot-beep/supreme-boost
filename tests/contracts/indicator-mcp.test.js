const { handle } = require('../../mcp/indicator-server');
describe('local developer MCP', () => {
    const call = (method, params) => handle({ jsonrpc: '2.0', id: 1, method, params });
    test('initializes and lists only local read tools', async () => {
        expect((await call('initialize', {})).result.protocolVersion).toBe('2025-06-18');
        const names = (await call('tools/list')).result.tools.map(t => t.name);
        expect(names).toEqual(['indicator_training_status', 'search_website', 'compare_products', 'calculate']);
    });
    test('executes arithmetic through MCP', async () => {
        const r = await call('tools/call', { name: 'calculate', arguments: { arguments: { expression: '2*(3+4)' } } });
        expect(JSON.parse(r.result.content[0].text).data.value).toBe(14);
    });
    test('refuses writes and reports training honestly', async () => {
        expect((await call('tools/call', { name: 'trigger_scroller' })).error.code).toBe(-32602);
        const r = await call('tools/call', { name: 'indicator_training_status' });
        expect(JSON.parse(r.result.content[0].text)).toMatchObject({ examples: 120, weightTrainingPerformed: false });
    });
});
