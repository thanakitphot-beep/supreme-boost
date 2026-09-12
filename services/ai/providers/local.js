const BaseProvider = require('./base');

class LocalProvider extends BaseProvider {
    async generate({ system, messages, schema }, options = {}) {
        const baseUrl = this.config.baseUrl || process.env.LOCAL_AI_BASE_URL;
        if (!baseUrl) throw new Error('LOCAL_AI_BASE_URL is not configured');

        const model = options.model || this.config.model || process.env.LOCAL_AI_MODEL || 'local-model';
        const normalizedUrl = baseUrl.replace(/\/+$/, '');
        const url = `${normalizedUrl.endsWith('/v1') ? normalizedUrl : normalizedUrl + '/v1'}/chat/completions`;
        
        const payloadMessages = [
            { role: 'system', content: system },
            ...messages
        ];

        const body = {
            model,
            messages: payloadMessages,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens || 1024,
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
            const errBody = await res.text().catch(() => '');
            let errorMsg = `Local AI HTTP ${res.status}: ${errBody.slice(0, 200)}`;
            const err = new Error(errorMsg);
            err.status = res.status;
            throw err;
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content;
    }
}

module.exports = LocalProvider;
