const registry = require('../../services/tools');
const { ToolRegistry } = require('../../services/tools/registry');

describe('tool registration and execution contract', () => {
    test('registered navigation produces a pending result, not a completed action', async () => {
        expect(await registry.execute('trigger_scroller', { target_keyword: 'รองเท้า', intent: 'find_product' })).toMatchObject({ success: true, status: 'pending', target: 'รองเท้า' });
    });
    test('handoff produces a pending result', async () => {
        expect(await registry.execute('handoff_to_human', { reason: 'user request' })).toMatchObject({ success: true, status: 'pending', subIntent: 'handoff' });
    });
    test.each([{}, { target_keyword: '' }, { target_keyword: 'shoe', unexpected: 'value' }, { target_keyword: 'shoe', intent: 'delete' }])('rejects invalid navigation arguments: %p', async args => {
        expect(await registry.execute('trigger_scroller', args)).toMatchObject({ success: false, error: { code: 'INVALID_ARGUMENTS' } });
    });
    test('a restricted tool is never executed', async () => {
        const tools = new ToolRegistry();
        const execute = jest.fn();
        tools.register({ name: 'restricted', description: 'test', parameters: { type: 'object' }, execute });
        expect(await tools.execute('restricted', {}, { allowedTools: [] })).toMatchObject({ error: { code: 'TOOL_NOT_ALLOWED' } });
        expect(execute).not.toHaveBeenCalled();
    });
    test('an unresponsive tool reaches the deadline and clears timers', async () => {
        jest.useFakeTimers();
        try {
            const tools = new ToolRegistry();
            tools.register({ name: 'stuck', description: 'test', parameters: { type: 'object' }, execute: () => new Promise(() => {}) });
            const pending = tools.execute('stuck', {}, { timeoutMs: 100 });
            await jest.advanceTimersByTimeAsync(100);
            expect(await pending).toMatchObject({ error: { code: 'TOOL_TIMEOUT' } });
            expect(jest.getTimerCount()).toBe(0);
        } finally { jest.useRealTimers(); }
    });
});
