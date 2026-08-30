const router = require('./router');
const { buildContext } = require('./contextBuilder');
const { validateResponse, RESPONSE_SCHEMA } = require('./responseValidator');
const { logEvent, generateRequestId } = require('./logger');

class IndicatorAIGateway {
    async generate({
        identity,
        memory,
        ragContext,
        tools,
        userMessage,
        pageContent,
        siteDNA,
        metadata = {},
        runtimeOptions = {}
    }) {
        const requestId = metadata.requestId || generateRequestId();
        const deadlineAt = Date.now() + Math.min(Math.max(Number.parseInt(process.env.AI_TOTAL_TIMEOUT_MS || '22000', 10) || 22000, 5000), 30000);
        logEvent('info', 'AI Generation requested', { requestId, hasRag: !!ragContext, toolsCount: tools?.length || 0 });

        const payload = buildContext({
            identity,
            memory,
            ragContext,
            tools,
            userMessage,
            pageContent,
            siteDNA,
            requestId
        });
        
        payload.schema = RESPONSE_SCHEMA;

        try {
            // First attempt
            let { response, metadata: providerMeta } = await router.generateWithRetry(payload, { deadlineAt, ...runtimeOptions }, requestId);
            
            let validation = validateResponse(response, requestId);
            
            // Auto-correction on failure (1 retry for bad JSON)
            if (!validation.isValid) {
                logEvent('info', 'Attempting auto-correction for invalid JSON', { requestId });
                const correctionPayload = {
                    ...payload,
                    messages: [
                        ...payload.messages,
                        { role: 'assistant', content: response },
                        { role: 'user', content: 'Your last response was not valid JSON matching the schema. Please fix it and return ONLY valid JSON.' }
                    ]
                };
                
                const correctionResult = await router.generateWithRetry(correctionPayload, { deadlineAt, ...runtimeOptions }, requestId);
                validation = validateResponse(correctionResult.response, requestId);
                providerMeta = correctionResult.metadata;
            }

            if (!validation.isValid) {
                throw new Error('Failed to generate valid structured output after correction');
            }

            const result = validation.parsed;
            result.metadata = {
                ...result.metadata,
                provider: providerMeta.provider,
                latency: providerMeta.latency,
                usedRag: !!ragContext,
                usedTools: !!(result.action && result.action.type),
                requestId
            };

            return result;

        } catch (error) {
            logEvent('error', 'AI Gateway generation failed', { requestId, error: error.message });
            
            // Safe Fallback Response
            return {
                reply: "⚡ ระบบ AI ขัดข้องชั่วคราว รบกวนลองอีกครั้งสักครู่นะครับ",
                action: null,
                cssCommand: "",
                interactive: null,
                status: "error",
                metadata: {
                    error: true,
                    requestId
                }
            };
        }
    }
}

module.exports = new IndicatorAIGateway();
