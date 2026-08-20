const BaseProvider = require('./base');

class OpenAIProvider extends BaseProvider {
    async generate({ system, messages, schema }, options = {}) {
        const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

        const model = options.model || this.config.model || process.env.AI_NORMAL_MODEL || 'gpt-4o-mini';
        const url = 'https://api.openai.com/v1/chat/completions';
        
        const payloadMessages = [
            { role: 'system', content: system },
            ...messages
        ];

        const body = {
            model,
            messages: payloadMessages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1024,
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
            let errorMsg = `OpenAI HTTP ${res.status}: ${errBody.slice(0, 200)}`;
            const err = new Error(errorMsg);
            err.status = res.status;
            err.isRateLimit = isRateLimit;
            throw err;
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content;
    }
}

module.exports = OpenAIProvider;
