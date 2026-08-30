const { semanticCache } = require('../../services/cache');
const routerModule = require('../../services/ai/router');
const { generateGeminiEmbedding } = require('../../services/geminiEmbedding');
const OpenAIProvider = require('../../services/ai/providers/openai');
const GeminiProvider = require('../../services/ai/providers/gemini');
const GroqProvider = require('../../services/ai/providers/groq');
const LocalProvider = require('../../services/ai/providers/local');

function withEnv(values, run) {
    const previous = {};
    for (const [key, value] of Object.entries(values)) {
        previous[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    try {
        return run();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

describe('AI runtime guardrails', () => {
    test('uses the configured 768-dimension Gemini embedding model with a bounded payload', async () => {
        const previousFetch = global.fetch;
        const previousModel = process.env.GEMINI_EMBEDDING_MODEL;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ embedding: { values: Array(768).fill(0.25) } })
        });
        process.env.GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
        try {
            const embedding = await generateGeminiEmbedding('hello', 'test-key');
            expect(embedding).toHaveLength(768);
            const [url, options] = global.fetch.mock.calls[0];
            expect(url).toContain('/models/gemini-embedding-001:embedContent');
            expect(url).not.toContain('test-key');
            expect(options.headers['x-goog-api-key']).toBe('test-key');
            expect(JSON.parse(options.body)).toMatchObject({ model: 'models/gemini-embedding-001', outputDimensionality: 768 });
        } finally {
            global.fetch = previousFetch;
            if (previousModel === undefined) delete process.env.GEMINI_EMBEDDING_MODEL;
            else process.env.GEMINI_EMBEDDING_MODEL = previousModel;
        }
    });

    test('preserves an explicit zero temperature for every provider', async () => {
        const previousFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{}' } }],
                candidates: [{ content: { parts: [{ text: '{}' }] } }]
            })
        });
        const providers = [
            new OpenAIProvider({ apiKey: 'test', model: 'gpt-5.6-terra' }),
            new GeminiProvider({ apiKey: 'test', model: 'gemini-2.5-flash' }),
            new GroqProvider({ apiKey: 'test', model: 'llama-3.3-70b-versatile' }),
            new LocalProvider({ baseUrl: 'https://local.example', model: 'local-model' })
        ];
        try {
            for (const provider of providers) {
                await provider.generate({ system: 'system', messages: [], schema: {} }, { temperature: 0 });
            }
            global.fetch.mock.calls.forEach(([, options]) => {
                const body = JSON.parse(options.body);
                expect(body.temperature ?? body.generationConfig.temperature).toBe(0);
            });
        } finally {
            global.fetch = previousFetch;
        }
    });

    test('does not pass a model name to the wrong provider fallback', async () => {
        const previousFetch = global.fetch;
        const previous = {
            OPENAI_MODEL: process.env.OPENAI_MODEL,
            GEMINI_MODEL: process.env.GEMINI_MODEL,
            GROQ_MODEL: process.env.GROQ_MODEL,
            AI_NORMAL_MODEL: process.env.AI_NORMAL_MODEL,
            AI_FALLBACK_MODEL: process.env.AI_FALLBACK_MODEL
        };
        delete process.env.OPENAI_MODEL;
        delete process.env.GEMINI_MODEL;
        delete process.env.GROQ_MODEL;
        process.env.AI_NORMAL_MODEL = 'gpt-5.6-terra';
        process.env.AI_FALLBACK_MODEL = 'gemini-2.5-flash';
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{}' } }],
                candidates: [{ content: { parts: [{ text: '{}' }] } }]
            })
        });
        try {
            await new GeminiProvider({ apiKey: 'test' }).generate({ system: 'system', messages: [] });
            process.env.AI_NORMAL_MODEL = 'gemini-2.5-flash';
            await new OpenAIProvider({ apiKey: 'test' }).generate({ system: 'system', messages: [] });
            await new GroqProvider({ apiKey: 'test' }).generate({ system: 'system', messages: [] });
            expect(global.fetch.mock.calls[0][0]).toContain('/models/gemini-2.5-flash:generateContent');
            expect(JSON.parse(global.fetch.mock.calls[1][1].body).model).toBe('gpt-5.6-terra');
            expect(JSON.parse(global.fetch.mock.calls[2][1].body).model).toBe('llama-3.3-70b-versatile');
        } finally {
            global.fetch = previousFetch;
            for (const [key, value] of Object.entries(previous)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }
    });

    test('uses a known provider rather than retaining an invalid provider name', () => {
        withEnv({ GROQ_API_KEY: 'test-key', OPENAI_API_KEY: undefined, GEMINI_API_KEY: undefined }, () => {
            const router = new routerModule.ModelRouter();
            expect(router.getProvider('not-a-provider').name).toBe('groq');
        });
    });

    test('allows only one half-open circuit probe', () => {
        const router = new routerModule.ModelRouter();
        const state = router.circuitBreaker.getState('groq');
        state.status = 'OPEN';
        state.nextTry = Date.now() - 1;
        expect(router.circuitBreaker.canAttempt('groq')).toBe(true);
        expect(router.circuitBreaker.canAttempt('groq')).toBe(false);
    });

    test('scopes semantic cache keys to the tenant', () => {
        const base = { prompt: 'สถานะคำสั่งซื้อ', title: 'ร้านตัวอย่าง', locale: 'th', history: [] };
        expect(semanticCache._makeKey({ ...base, tenantId: 'tenant-a' })).not.toBe(semanticCache._makeKey({ ...base, tenantId: 'tenant-b' }));
        expect(semanticCache._makeKey(base)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    test('separates cache entries by conversation and knowledge revision', () => {
        const base = {
            tenantId: 'tenant-a',
            prompt: 'ร้านเปิดวันไหน',
            title: 'ร้านตัวอย่าง',
            locale: 'th',
            history: [],
            tenantKnowledge: [{ id: 'hours', revision: '2026-08-25', content: 'ร้านเปิดทุกวัน 09:00-18:00' }]
        };
        expect(semanticCache._makeKey({ ...base, conversationId: 'tenant-a:one' }))
            .not.toBe(semanticCache._makeKey({ ...base, conversationId: 'tenant-a:two' }));
        expect(semanticCache._makeKey(base))
            .not.toBe(semanticCache._makeKey({
                ...base,
                tenantKnowledge: [{ id: 'hours', revision: '2026-08-26', content: 'ร้านเปิดวันจันทร์-ศุกร์ 09:00-18:00' }]
            }));
    });

    test('keeps every configured provider available after primary and fallback', () => {
        withEnv({ OPENAI_API_KEY: 'openai', GROQ_API_KEY: 'groq', GEMINI_API_KEY: 'gemini', AI_PRIMARY_PROVIDER: 'openai', AI_FALLBACK_PROVIDER: 'groq' }, () => {
            const router = new routerModule.ModelRouter();
            const candidates = [router.getProvider(process.env.AI_PRIMARY_PROVIDER), router.getProvider(process.env.AI_FALLBACK_PROVIDER || 'groq')]
                .concat(['gemini', 'groq', 'openai', 'local'].map(name => router.getProvider(name)))
                .filter((provider, index, list) => list.findIndex(item => item.name === provider.name) === index);
            expect(candidates.map(candidate => candidate.name)).toContain('gemini');
        });
    });
});
