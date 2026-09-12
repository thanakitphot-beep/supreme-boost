jest.mock('../../services/ai/router', () => ({ generateWithRetry: jest.fn() }));
const router = require('../../services/ai/router');
const gateway = require('../../services/ai/gateway');
const registry = require('../../services/tools');
const { calculate } = require('../../services/tools/website');
const { safeClientAction, sanitizeCapabilities } = require('../../services/ai/clientCapabilities');
const response = value => ({ response: JSON.stringify(value), metadata: { provider: 'mock', latency: 1 } });
const input = () => ({ userMessage: 'Compare A and B', runtimeOptions: { allTools: true, maxTokens: 400 }, tools: registry.getAvailableTools(),
    toolContext: { tenantId: 'a', payload: { tenantId: 'a', siteDNA: { entityIndex: [
        { id: 'a', title: 'Cup A', price: 120 }, { id: 'b', title: 'Cup B', price: 180 }
    ] } } } });
describe('multi-step agent execution', () => {
    beforeEach(() => router.generateWithRetry.mockReset());
    test('searches actual context, compares, calculates, and returns final answer', async () => {
        router.generateWithRetry.mockResolvedValueOnce(response({ reply: 'Searching', toolCalls: [{ name: 'search_website', arguments: { query: 'Cup' } }] }))
            .mockResolvedValueOnce(response({ reply: 'Comparing', toolCalls: [{ name: 'compare_products', arguments: { products: ['a', 'b'] } }, { name: 'calculate', arguments: { expression: '(120+180)*2' } }] }))
            .mockResolvedValueOnce(response({ reply: '600', action: null }));
        const result = await gateway.generate(input());
        expect(result.reply).toBe('600');
        expect(result.metadata.usedTools).toBe(true);
        expect(result.metadata.toolCalls).toHaveLength(3);
        expect(JSON.stringify(router.generateWithRetry.mock.calls[2][0].messages)).toContain('priceDifference');
        expect(result.toolCalls).toBeUndefined();
    });
    test('unknown tools are refused and duplicate calls are not rerun', async () => {
        const call = { reply: 'Work', toolCalls: [{ name: 'delete_database', arguments: {} }] };
        router.generateWithRetry.mockResolvedValueOnce(response(call)).mockResolvedValueOnce(response(call)).mockResolvedValueOnce(response({ reply: 'Cannot perform that action' }));
        const result = await gateway.generate(input());
        expect(result.metadata.toolCalls.map(t => t.code)).toEqual(['UNKNOWN_TOOL', 'DUPLICATE_CALL']);
        expect(result.metadata.usedTools).toBe(false);
    });
    test('endless tool calls stop at the budget without exposing progress as success', async () => {
        router.generateWithRetry.mockResolvedValue(response({ reply: 'Working', toolCalls: [{ name: 'calculate', arguments: { expression: '1+1' } }] }));
        expect((await gateway.generate(input())).status).toBe('error');
        expect(router.generateWithRetry).toHaveBeenCalledTimes(4);
    });
    test('tenant mismatch is blocked and missing catalog stays empty', async () => {
        expect(await registry.execute('search_website', { query: 'Cup' }, { tenantId: 'b', payload: input().toolContext.payload })).toMatchObject({ error: { code: 'TENANT_MISMATCH' } });
        expect(await registry.execute('search_website', { query: 'Nike' }, { payload: {} })).toMatchObject({ data: { items: [], found: 0 } });
    });
    test.each(['process.exit()', '1/0', '1e20', '(1+2', '2**3'])('rejects unsafe/invalid arithmetic %s', expression => expect(() => calculate(expression)).toThrow());
    test('supports arithmetic precedence and percentage', () => expect(calculate('(990*2)*(1-10%)')).toBe(1782));
    test('plugins must be advertised and cannot bypass manifest confirmation', () => {
        expect(safeClientAction({ type: 'plugin_action', pluginName: 'unknown' }, null)).toBeNull();
        const caps = sanitizeCapabilities({ actions: ['plugin_action'], plugins: [{ name: 'cart', requiresConfirmation: true }] });
        expect(safeClientAction({ type: 'plugin_action', pluginName: 'cart', confirmationRequired: false }, caps).confirmationRequired).toBe(true);
    });
});
