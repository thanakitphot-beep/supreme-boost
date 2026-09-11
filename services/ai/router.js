const { logEvent } = require('./logger');
const OpenAIProvider = require('./providers/openai');
const GeminiProvider = require('./providers/gemini');
const GroqProvider = require('./providers/groq');
const LocalProvider = require('./providers/local');

const PROVIDER_NAMES = new Set(['openai', 'gemini', 'groq', 'local']);

function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function providerHasCredentials(name) {
    if (name === 'openai') return Boolean(process.env.OPENAI_API_KEY);
    if (name === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
    if (name === 'groq') return Boolean(process.env.GROQ_API_KEY || process.env.API_KEY);
    if (name === 'local') return Boolean(process.env.LOCAL_AI_BASE_URL);
    return false;
}

function defaultProvider() {
    return ['openai', 'gemini', 'groq', 'local'].find(providerHasCredentials) || 'groq';
}

function modelMatchesProvider(provider, model) {
    const value = String(model || '').toLowerCase();
    if (!value) return false;
    if (provider === 'openai') return value.startsWith('gpt-') || value.startsWith('o') || value.startsWith('ft:gpt-');
    if (provider === 'gemini') return value.startsWith('gemini-');
    if (provider === 'groq') return /^(llama|mixtral|qwen|deepseek|meta-llama\/|openai\/gpt-oss-|groq\/)/.test(value);
    return provider === 'local';
}

class CircuitBreaker {
    constructor(maxFailures, resetTimeout) {
        this.states = {};
        this.maxFailures = maxFailures;
        this.resetTimeout = resetTimeout;
    }

    getState(providerName) {
        if (!this.states[providerName]) {
            this.states[providerName] = { failures: 0, status: 'CLOSED', nextTry: 0, probeInFlight: false };
        }
        return this.states[providerName];
    }

    canAttempt(providerName) {
        const state = this.getState(providerName);
        if (state.status === 'CLOSED') return true;
        if (state.status === 'OPEN' && Date.now() > state.nextTry && !state.probeInFlight) {
            state.status = 'HALF_OPEN';
            state.probeInFlight = true;
            return true;
        }
        return false;
    }

    recordSuccess(providerName) {
        const state = this.getState(providerName);
        state.failures = 0;
        state.status = 'CLOSED';
        state.probeInFlight = false;
    }

    recordFailure(providerName, error) {
        const state = this.getState(providerName);
        state.probeInFlight = false;
        state.failures++;
        if (error?.status === 429) {
            state.status = 'OPEN';
            state.nextTry = Date.now() + Math.max(1000, Math.min(Number(error.retryAfterMs) || 60000, 300000));
            return;
        }
        if (state.failures >= this.maxFailures) {
            state.status = 'OPEN';
            state.nextTry = Date.now() + Math.min(this.resetTimeout * Math.pow(2, state.failures - this.maxFailures), 300000);
        } else {
            state.status = 'CLOSED';
        }
    }

    snapshot() {
        return Object.fromEntries(Object.entries(this.states).map(([name, state]) => [name, {
            failures: state.failures,
            status: state.status,
            nextTry: state.nextTry
        }]));
    }
}

class ModelRouter {
    constructor() {
        this.circuitBreaker = new CircuitBreaker(boundedInteger(process.env.AI_CIRCUIT_MAX_FAILURES, 3, 1, 10), 60000);
        this.providers = {
            openai: new OpenAIProvider({}),
            gemini: new GeminiProvider({}),
            groq: new GroqProvider({}),
            local: new LocalProvider({})
        };
    }

    resolveProviderName(name, fallback) {
        const candidate = String(name || '').toLowerCase().trim();
        return PROVIDER_NAMES.has(candidate) ? candidate : fallback;
    }

    getProvider(name) {
        const providerName = this.resolveProviderName(name, defaultProvider());
        return { name: providerName, instance: this.providers[providerName] };
    }

    runtimeStatus() {
        const primary = this.resolveProviderName(process.env.AI_PRIMARY_PROVIDER, defaultProvider());
        const fallback = this.resolveProviderName(process.env.AI_FALLBACK_PROVIDER, 'groq');
        return {
            primary,
            fallback,
            primaryConfigured: providerHasCredentials(primary),
            fallbackConfigured: providerHasCredentials(fallback),
            circuits: this.circuitBreaker.snapshot()
        };
    }

    async generateWithRetry(payload, options = {}, requestId) {
        const maxRetries = boundedInteger(process.env.AI_MAX_RETRIES, 1, 0, 2);
        const perAttemptTimeout = boundedInteger(process.env.AI_REQUEST_TIMEOUT_MS, 12000, 2000, 15000);
        const deadlineAt = options.deadlineAt || Date.now() + boundedInteger(process.env.AI_TOTAL_TIMEOUT_MS, 22000, 5000, 30000);
        const primary = this.getProvider(process.env.AI_PRIMARY_PROVIDER);
        const fallback = this.getProvider(process.env.AI_FALLBACK_PROVIDER || 'groq');
        const candidates = [primary, fallback]
            .concat(['gemini', 'groq', 'openai', 'local'].map(name => this.getProvider(name)))
            .filter((provider, index, list) => list.findIndex(item => item.name === provider.name) === index)
            .filter(provider => providerHasCredentials(provider.name));
        let lastError = null;

        for (const currentProvider of candidates) {
            if (!providerHasCredentials(currentProvider.name)) {
                lastError = new Error(`${currentProvider.name} provider is not configured`);
                continue;
            }

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                const remaining = deadlineAt - Date.now();
                if (remaining < 1000) throw new Error('AI request deadline exceeded');
                if (!this.circuitBreaker.canAttempt(currentProvider.name)) {
                    lastError = new Error(`${currentProvider.name} circuit is open`);
                    break;
                }
                const controller = new AbortController();
                const hasFallback = candidates.indexOf(currentProvider) < candidates.length - 1;
                const attemptBudget = Math.min(perAttemptTimeout, hasFallback ? Math.max(1000, Math.floor(remaining / 2)) : remaining);
                let timeout;
                const timedOut = new Promise((_, reject) => {
                    timeout = setTimeout(() => {
                        controller.abort();
                        const error = new Error('AI provider timed out');
                        error.name = 'AbortError';
                        reject(error);
                    }, attemptBudget);
                });
                const startedAt = Date.now();
                try {
                    logEvent('info', 'Calling provider', { provider: currentProvider.name, attempt: attempt + 1, requestId });
                    const providerOptions = { ...options, signal: controller.signal };
                    if (!modelMatchesProvider(currentProvider.name, providerOptions.model)) delete providerOptions.model;
                    const response = await Promise.race([currentProvider.instance.generate(payload, providerOptions), timedOut]);
                    if (typeof response !== 'string' || !response.trim()) throw new Error('AI provider returned an empty response');
                    clearTimeout(timeout);
                    this.circuitBreaker.recordSuccess(currentProvider.name);
                    return {
                        response,
                        metadata: { provider: currentProvider.name, latency: Date.now() - startedAt, fallback: currentProvider.name !== primary.name }
                    };
                } catch (error) {
                    clearTimeout(timeout);
                    lastError = error;
                    this.circuitBreaker.recordFailure(currentProvider.name, error);
                    logEvent('warn', 'Provider failed', {
                        provider: currentProvider.name,
                        attempt: attempt + 1,
                        requestId,
                        status: error && error.status,
                        aborted: error && error.name === 'AbortError'
                    });
                    // Permanent client errors cannot improve on retry. On timeout,
                    // reserve the remaining request budget for another provider.
                    if ((error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) ||
                        error.status === 429 || (hasFallback && error.name === 'AbortError')) break;
                    if (attempt < maxRetries && deadlineAt - Date.now() > 1500) {
                        await new Promise(resolve => setTimeout(resolve, Math.min(500 * (attempt + 1), 1000)));
                    }
                }
            }
        }
        throw lastError || new Error('No configured AI provider is available');
    }
}

module.exports = new ModelRouter();
module.exports.ModelRouter = ModelRouter;
module.exports.providerHasCredentials = providerHasCredentials;
module.exports.modelMatchesProvider = modelMatchesProvider;
