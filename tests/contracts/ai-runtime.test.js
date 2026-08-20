const { semanticCache } = require('../../services/cache');
const routerModule = require('../../services/ai/router');

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
