const BaseProvider = require('./base');

class LocalProvider extends BaseProvider {
    async generate({ system, messages, schema }, options = {}) {
        const baseUrl = this.config.baseUrl || process.env.LOCAL_AI_BASE_URL;
        if (!baseUrl) throw new Error('LOCAL_AI_BASE_URL is not configured');

        const model = this.config.model || process.env.LOCAL_AI_MODEL || 'local-model';
        const url = `${baseUrl}/v1/chat/completions`; // Assuming OpenAI compatible API
        
        const payloadMessages = [
            { role: 'system', content: system },
            ...messages
        ];

        const body = {
            model,
            messages: payloadMessages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 1024,
            response_format: { type: "json_object" }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer dummy-key`
            },
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!res.ok) {
            const err = new Error(`Local AI HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content;
    }
}

module.exports = LocalProvider;
