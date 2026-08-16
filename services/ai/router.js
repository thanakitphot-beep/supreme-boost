const { logEvent } = require('./logger');

const OpenAIProvider = require('./providers/openai');
const GeminiProvider = require('./providers/gemini');
const GroqProvider = require('./providers/groq');
const LocalProvider = require('./providers/local');

class CircuitBreaker {
    constructor(maxFailures = 3, resetTimeout = 60000) {
        this.states = {}; // providerName -> state
        this.maxFailures = maxFailures;
        this.resetTimeout = resetTimeout;
    }

    getState(providerName) {
        if (!this.states[providerName]) {
            this.states[providerName] = {
                failures: 0,
                status: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
                nextTry: 0
            };
        }
        return this.states[providerName];
    }

    canAttempt(providerName) {
        const state = this.getState(providerName);
        if (state.status === 'CLOSED') return true;
        if (state.status === 'OPEN') {
            if (Date.now() > state.nextTry) {
                state.status = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        return true; // HALF_OPEN allows one attempt
    }

    recordSuccess(providerName) {
        const state = this.getState(providerName);
        state.failures = 0;
        state.status = 'CLOSED';
    }

    recordFailure(providerName) {
        const state = this.getState(providerName);
        state.failures++;
        if (state.failures >= this.maxFailures) {
            state.status = 'OPEN';
            // Exponential backoff for reset timeout could be implemented here
            const backoff = Math.min(this.resetTimeout * Math.pow(2, state.failures - this.maxFailures), 300000); // max 5 min
            state.nextTry = Date.now() + backoff;
        }
    }
}

class ModelRouter {
    constructor() {
        this.circuitBreaker = new CircuitBreaker(
            process.env.AI_CIRCUIT_MAX_FAILURES ? parseInt(process.env.AI_CIRCUIT_MAX_FAILURES) : 3,
            60000
        );
        this.providers = {
            openai: new OpenAIProvider({}),
            gemini: new GeminiProvider({}),
            groq: new GroqProvider({}),
            local: new LocalProvider({})
        };
    }

    getProvider(name) {
        const providerName = (name || process.env.AI_PRIMARY_PROVIDER || 'gemini').toLowerCase();
        return { name: providerName, instance: this.providers[providerName] || this.providers['gemini'] };
    }

    async generateWithRetry(payload, options = {}, requestId) {
        const maxRetries = process.env.AI_MAX_RETRIES ? parseInt(process.env.AI_MAX_RETRIES) : 2;
        const timeoutMs = process.env.AI_REQUEST_TIMEOUT_MS ? parseInt(process.env.AI_REQUEST_TIMEOUT_MS) : 15000;
        
        const primaryConfig = this.getProvider(process.env.AI_PRIMARY_PROVIDER);
        const fallbackConfig = this.getProvider(process.env.AI_FALLBACK_PROVIDER || 'groq');

        let attempts = 0;
        let lastError = null;
        let currentProvider = primaryConfig;

        while (attempts <= maxRetries) {
            attempts++;
            
            // Check Circuit Breaker
            if (!this.circuitBreaker.canAttempt(currentProvider.name)) {
                logEvent('warn', 'Circuit breaker OPEN', { provider: currentProvider.name, requestId });
                if (currentProvider.name !== fallbackConfig.name) {
                    logEvent('info', 'Switching to fallback provider', { fallback: fallbackConfig.name, requestId });
                    currentProvider = fallbackConfig;
                    attempts = 1; // reset attempts for fallback
                    continue;
                } else {
                    throw new Error(`All providers failed or circuit open. Last error: ${lastError?.message}`);
                }
            }

            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
            const callOptions = { ...options, signal: abortController.signal };

            const startTime = Date.now();
            try {
                logEvent('info', `Calling provider`, { provider: currentProvider.name, attempt: attempts, requestId });
                
                const response = await currentProvider.instance.generate(payload, callOptions);
                
                clearTimeout(timeoutId);
                this.circuitBreaker.recordSuccess(currentProvider.name);
                
                logEvent('info', 'Provider success', { 
                    provider: currentProvider.name, 
                    latencyMs: Date.now() - startTime,
                    requestId 
                });
                
                return { response, metadata: { provider: currentProvider.name, latency: Date.now() - startTime } };
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                
                const isAbort = err.name === 'AbortError';
                const isRateLimit = err.isRateLimit;
                
                logEvent('warn', 'Provider failed', { 
                    provider: currentProvider.name, 
                    error: err.message,
                    isAbort,
                    isRateLimit,
                    latencyMs: Date.now() - startTime,
                    requestId 
                });

                if (isAbort || !isRateLimit || err.status >= 500) {
                    this.circuitBreaker.recordFailure(currentProvider.name);
                }

                if (attempts > maxRetries) {
                    if (currentProvider.name !== fallbackConfig.name) {
                        logEvent('info', 'Switching to fallback provider after max retries', { fallback: fallbackConfig.name, requestId });
                        currentProvider = fallbackConfig;
                        attempts = 1;
                        continue;
                    }
                    throw new Error(`All retries exhausted for ${currentProvider.name}. Last error: ${err.message}`);
                }

                // Exponential backoff
                const backoffMs = Math.min(1000 * Math.pow(2, attempts) + Math.random() * 500, 5000);
                await new Promise(r => setTimeout(r, backoffMs));
            }
        }
        
        throw lastError;
    }
}

module.exports = new ModelRouter();
