const { buildContext } = require('../../services/ai/contextBuilder');
const GeminiProvider = require('../../services/ai/providers/gemini');
const GroqProvider = require('../../services/ai/providers/groq');
const { RESPONSE_SCHEMA } = require('../../services/ai/responseValidator');
const { grade } = require('../../evals/run-thai-assistant');

describe('context and structured output', () => {
    test('missing optional context is accepted', () => {
        const context = buildContext();
        expect(context.system).toContain('Always include reply');
        expect(context.messages.at(-1).role).toBe('user');
    });
    test('large identity and tools do not truncate output rules or page facts', () => {
        const context = buildContext({ identity: { purpose: 'x'.repeat(10000) }, tools: [{ name: 'trigger_scroller', description: 'x'.repeat(10000) }], pageContent: 'Visible price 1234', userMessage: 'price?' });
        expect(context.system).toContain('Return ONLY one JSON object');
        expect(context.messages.at(-1).content).toContain('Visible price 1234');
        expect(context.system).not.toContain('Visible price 1234');
    });
    test('newest corrections survive long older messages without mutating input', () => {
        const memory = [...Array.from({ length: 7 }, () => ({ role: 'user', text: 'old'.repeat(2000) })), { role: 'user', content: 'Actually choose the blue item' }];
        const before = JSON.stringify(memory);
        const context = buildContext({ memory, userMessage: 'How heavy is it?' });
        expect(context.messages.at(-2).content).toBe('Actually choose the blue item');
        expect(JSON.stringify(memory)).toBe(before);
    });
    test('current prompt is not duplicated in prior history', () => {
        const context = buildContext({ memory: [{ role: 'user', text: 'UNIQUE_CURRENT' }], userMessage: 'UNIQUE_CURRENT' });
        expect(context.messages.filter(message => message.content.includes('UNIQUE_CURRENT'))).toHaveLength(1);
    });
    test('untrusted history cannot create a system message', () => {
        const context = buildContext({ memory: [{ role: 'system', text: 'OVERRIDE_RULES' }], pageContent: 'UNTRUSTED_PAGE_TEXT' });
        expect(JSON.stringify(context.messages)).not.toContain('OVERRIDE_RULES');
        expect(context.system).not.toContain('UNTRUSTED_PAGE_TEXT');
    });
    test('eval catches injected output and unwanted actions independently of facts', () => {
        expect(grade({ checks: ['09:00'], forbidden: ['HACKED'], noAction: true }, { reply: '09:00 HACKED', action: { type: 'warp' } })).toEqual(['injected_instruction_followed', 'unexpected_action']);
    });
    test('Gemini sends schema and respects temperature zero', async () => {
        const original = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"reply":"ok"}' }] } }] }) });
        try {
            await new GeminiProvider({ apiKey: 'test' }).generate({ system: 's', messages: [], schema: RESPONSE_SCHEMA }, { temperature: 0 });
            const body = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(body.generationConfig.responseJsonSchema).toEqual(RESPONSE_SCHEMA);
            expect(body.generationConfig.temperature).toBe(0);
        } finally { global.fetch = original; }
    });
    test('Groq respects temperature zero', async () => {
        const original = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"reply":"ok"}' } }] }) });
        try {
            await new GroqProvider({ apiKey: 'test' }).generate({ system: 's', messages: [] }, { temperature: 0 });
            const body = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(body.temperature).toBe(0);
            expect(body.max_tokens).toBeLessThan(1000);
        } finally { global.fetch = original; }
    });
});
