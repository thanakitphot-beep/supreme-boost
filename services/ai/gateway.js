'use strict';
const { buildContext } = require('./contextBuilder');
const { RESPONSE_SCHEMA } = require('./responseValidator');
const { logEvent, generateRequestId } = require('./logger');
const { runAgent } = require('./agentRuntime');
const registry = require('../tools');
const { selectTools } = require('./tokenBudget');

class IndicatorAIGateway {
    async generate({ identity, memory, ragContext, tools = [], userMessage, pageContent, siteDNA, metadata = {}, runtimeOptions = {}, toolContext = {} }) {
        const requestId = metadata.requestId || generateRequestId();
        const deadlineAt = Date.now() + Math.min(Math.max(parseInt(process.env.AI_TOTAL_TIMEOUT_MS || '22000', 10) || 22000, 5000), 30000);
        const registered = registry.getAvailableTools(toolContext);
        const offered = registered.filter(tool => tools.some(toolOffer => toolOffer.name === tool.name));
        const allowed = runtimeOptions.allTools === true ? offered : selectTools(offered, userMessage);
        const payload = buildContext({ identity, memory, ragContext, tools: allowed, userMessage, pageContent, siteDNA, requestId, clientCapabilities: toolContext.payload?.clientCapabilities });
        payload.schema = RESPONSE_SCHEMA;
        try {
            const result = await runAgent(payload, { requestId, deadlineAt, runtimeOptions, tools: allowed,
                toolContext: { ...toolContext, payload: toolContext.payload || { ragContext, pageContent, siteDNA } } });
            result.metadata.usedRag = !!ragContext;
            return result;
        } catch (error) {
            logEvent('error', 'AI Gateway generation failed', { requestId, error: error.message });
            return { reply: 'ระบบ AI ยังทำคำขอนี้ไม่สำเร็จ กรุณาลองอีกครั้งครับ', action: null, cssCommand: '', interactive: null,
                status: 'error', metadata: { error: true, requestId } };
        }
    }
}
module.exports = new IndicatorAIGateway();
