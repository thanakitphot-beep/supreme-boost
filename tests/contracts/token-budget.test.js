const { ModelRouter } = require('../../services/ai/router');
const { createTokenBudget, selectTools } = require('../../services/ai/tokenBudget');

describe('request token limits', () => {
    let previous;
    beforeEach(() => {
        previous = { ...process.env };
        Object.assign(process.env, { OPENAI_API_KEY: 'test', GROQ_API_KEY: 'test', AI_PRIMARY_PROVIDER: 'openai', AI_FALLBACK_PROVIDER: 'groq', AI_MAX_RETRIES: '0', AI_MAX_OUTPUT_TOKENS_PER_REQUEST: '1000' });
        delete process.env.GEMINI_API_KEY;
        delete process.env.LOCAL_AI_BASE_URL;
    });
    afterEach(() => { process.env = previous; });
    test('counts failed attempts, fallback and later agent rounds in one budget', async () => {
        const router = new ModelRouter();
        router.providers.openai.generate = jest.fn().mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
        router.providers.groq.generate = jest.fn().mockResolvedValue('{"reply":"ok"}');
        const tokenBudget = createTokenBudget({ maxTokens: 600 });
        await router.generateWithRetry({ system: 'test', messages: [] }, { tokenBudget });
        expect(router.providers.openai.generate.mock.calls[0][1].maxTokens).toBe(600);
        expect(router.providers.groq.generate.mock.calls[0][1].maxTokens).toBe(400);
        expect(tokenBudget.reservedOutput).toBe(1000);
        expect(tokenBudget.calls).toBe(2);
        await expect(router.generateWithRetry({}, { tokenBudget })).rejects.toThrow('token budget');
        expect(router.providers.groq.generate).toHaveBeenCalledTimes(1);
    });
    test('omits unrelated schemas while keeping comparison tools', () => {
        const tools = ['search_website', 'compare_products', 'calculate', 'handoff_to_human'].map(name => ({ name }));
        expect(selectTools(tools, 'compare these products').map(t => t.name)).toEqual(['search_website', 'compare_products']);
        expect(selectTools(tools, 'hello')).toEqual([]);
    });
    test('fallback uses a model belonging to the selected provider', async () => {
        process.env.AI_NORMAL_MODEL = 'gpt-4o-mini';
        process.env.GEMINI_API_KEY = 'test';
        process.env.AI_FALLBACK_PROVIDER = 'gemini';
        const router = new ModelRouter();
        router.providers.openai.generate = jest.fn().mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
        router.providers.gemini.generate = jest.fn().mockResolvedValue('{"reply":"ok"}');
        await router.generateWithRetry({ system: 'test', messages: [] });
        expect(router.providers.gemini.generate.mock.calls[0][1].model).toBe('gemini-2.5-flash');
    });
});
