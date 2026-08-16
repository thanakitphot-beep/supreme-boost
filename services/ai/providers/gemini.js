const BaseProvider = require('./base');

class GeminiProvider extends BaseProvider {
    async generate({ system, messages, schema }, options = {}) {
        const apiKey = this.config.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

        const model = this.config.model || process.env.AI_NORMAL_MODEL || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        
        // Convert messages to Gemini format
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const body = {
            system_instruction: { parts: [{ text: system }] },
            contents,
            generationConfig: { 
                temperature: options.temperature || 0.7, 
                maxOutputTokens: options.maxTokens || 1024,
                responseMimeType: "application/json"
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'x-goog-api-key': apiKey 
            },
            body: JSON.stringify(body),
            signal: options.signal // For timeout aborts
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            let isRateLimit = res.status === 429;
            let errorMsg = `Gemini HTTP ${res.status}: ${errBody.slice(0, 200)}`;
            const err = new Error(errorMsg);
            err.status = res.status;
            err.isRateLimit = isRateLimit;
            throw err;
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
    }
}

module.exports = GeminiProvider;
