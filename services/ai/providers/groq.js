const BaseProvider = require('./base');

class GroqProvider extends BaseProvider {
    async generate({ system, messages, schema }, options = {}) {
        const apiKey = this.config.apiKey || process.env.GROQ_API_KEY || process.env.API_KEY;
        if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

        const model = options.model || this.config.model || process.env.AI_GROQ_MODEL || process.env.AI_FALLBACK_MODEL || 'qwen/qwen3.8-27b';
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        
        const payloadMessages = [
            { role: 'system', content: system },
            ...messages
        ];

        const configuredTokens = Number.parseInt(process.env.AI_GROQ_MAX_TOKENS, 10);
        const maxTokens = options.maxTokens ?? (Number.isFinite(configuredTokens) ? Math.max(64, Math.min(configuredTokens, 4096)) : 512);
        const body = {
            model,
            messages: payloadMessages,
            temperature: options.temperature ?? 0.3,
            max_tokens: maxTokens,
            response_format: { type: "json_object" }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${apiKey}` 
            },
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            let isRateLimit = res.status === 429;
            let errorMsg = `Groq HTTP ${res.status}: ${errBody.slice(0, 200)}`;
            const err = new Error(errorMsg);
            err.status = res.status;
            err.isRateLimit = isRateLimit;
            const retryAfter = res.headers?.get('retry-after');
            if (retryAfter) err.retryAfterMs = /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
            throw err;
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content;
    }
}

module.exports = GroqProvider;
