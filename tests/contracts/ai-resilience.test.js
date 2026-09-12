const { ModelRouter } = require('../../services/ai/router');
const { validateResponse } = require('../../services/ai/responseValidator');
const { semanticCache } = require('../../services/cache');
const { runIndicatorAgent } = require('../../services/indicatorAgent');

describe('AI response and context regressions', () => {
    afterEach(() => semanticCache._store.clear());

    test.each([undefined, null, 12, '', '{}', '{"reply":" "}', '{"reply":"ok","action":[]}', '{"reply":"ok","action":{"type":42}}', '{"reply":"ok","cssCommand":{}}', '{"reply":"ok","interactive":[]}'])('rejects malformed output without crashing: %p', raw => {
        expect(validateResponse(raw).isValid).toBe(false);
    });

    test('accepts fenced JSON and normalizes malformed metadata', () => {
        expect(validateResponse('```json\n{"reply":"hello","metadata":"wrong"}\n```').parsed.metadata).toEqual({});
    });

    test('distinguishes long prompts, changed prices, and updated knowledge', () => {
        const base = { prompt: 'x'.repeat(240), pageContent: 'price 100', ragContext: 'old policy' };
        const key = semanticCache._makeKey(base);
        for (const change of [{ prompt: base.prompt + 'different' }, { pageContent: 'price 200' }, { ragContext: 'new policy' }]) {
            expect(semanticCache._makeKey({ ...base, ...change })).not.toBe(key);
        }
    });

    test('does not replay errors or actions and isolates cached objects', () => {
        const payload = { prompt: 'hello' };
        for (const result of [{ reply: 'failed', status: 'error' }, { reply: 'go', action: { type: 'warp' } }, { reply: 'unknown', metadata: { needsReasoning: true } }]) {
            semanticCache.set(payload, result);
            expect(semanticCache.get(payload)).toBeNull();
        }
        const answer = { reply: 'hello', status: 'ok', metadata: { requestId: 'original' } };
        semanticCache.set(payload, answer);
        answer.metadata.requestId = 'mutated';
        semanticCache.get(payload).metadata.requestId = 'also mutated';
        expect(semanticCache.get(payload).metadata.requestId).toBe('original');
    });

    test('unrecognized questions are eligible for AI reasoning', () => {
        const result = runIndicatorAgent({ prompt: 'อธิบายความแตกต่างระหว่างแนวคิดสองแบบนี้', siteDNA: {}, history: [] });
        expect(result.metadata.needsReasoning).toBe(true);
    });
});

describe('provider failover', () => {
    let previous;
    let router;
    beforeEach(() => {
        previous = { ...process.env };
        Object.assign(process.env, { OPENAI_API_KEY: 'test', GROQ_API_KEY: 'test', AI_PRIMARY_PROVIDER: 'openai', AI_FALLBACK_PROVIDER: 'groq', AI_MAX_RETRIES: '1' });
        delete process.env.GEMINI_API_KEY;
        delete process.env.LOCAL_AI_BASE_URL;
        router = new ModelRouter();
        router.providers.openai.generate = jest.fn();
        router.providers.groq.generate = jest.fn().mockResolvedValue('{"reply":"fallback"}');
    });
    afterEach(() => { process.env = previous; jest.useRealTimers(); });

    test('authentication failure switches providers without retrying invalid credentials', async () => {
        router.providers.openai.generate.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
        const result = await router.generateWithRetry({});
        expect(result.metadata.provider).toBe('groq');
        expect(router.providers.openai.generate).toHaveBeenCalledTimes(1);
    });

    test('a provider ignoring abort cannot consume the fallback budget', async () => {
        jest.useFakeTimers();
        router.providers.openai.generate.mockImplementation(() => new Promise(() => {}));
        const pending = router.generateWithRetry({}, { deadlineAt: Date.now() + 6000 });
        await jest.advanceTimersByTimeAsync(3000);
        expect((await pending).metadata.provider).toBe('groq');
        expect(router.providers.openai.generate).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('expired requests do not lock the recovery probe', async () => {
        const state = router.circuitBreaker.getState('openai');
        Object.assign(state, { status: 'OPEN', nextTry: Date.now() - 1 });
        await expect(router.generateWithRetry({}, { deadlineAt: Date.now() - 1 })).rejects.toThrow('deadline');
        expect(state.probeInFlight).toBe(false);
    });

    test('empty responses fall through to a healthy provider', async () => {
        process.env.AI_MAX_RETRIES = '0';
        router.providers.openai.generate.mockResolvedValue(undefined);
        expect((await router.generateWithRetry({})).metadata.provider).toBe('groq');
    });

    test('rate limiting respects cooldown and skips futile retries on later requests', async () => {
        router.providers.openai.generate.mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429, retryAfterMs: 30000 }));
        expect((await router.generateWithRetry({})).metadata.provider).toBe('groq');
        expect((await router.generateWithRetry({})).metadata.provider).toBe('groq');
        expect(router.providers.openai.generate).toHaveBeenCalledTimes(1);
        expect(router.circuitBreaker.getState('openai').nextTry).toBeGreaterThan(Date.now() + 29000);
    });
});
