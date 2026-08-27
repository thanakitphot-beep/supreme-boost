const { logEvent } = require('./logger');

const RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        reply: { type: "string" },
        action: { 
            type: ["object", "null"],
            properties: {
                type: { type: "string" }
            }
        },
        cssCommand: { type: ["string", "null"] },
        interactive: { type: ["object", "null"] }
    },
    required: ["reply"]
};

function safeParseJson(text) {
    if (!text || typeof text !== 'string') return null;
    try {
        let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) { 
            try { 
                return JSON.parse(match[0]); 
            } catch { 
                return null; 
            } 
        }
        return null;
    }
}

function safeAction(action) {
    if (!action || typeof action !== 'object') return null;
    const type = String(action.type || '').toLowerCase();
    if (type === 'handoff') {
        return { type, priority: action.priority === 'high' ? 'high' : 'normal' };
    }
    if (type === 'speech' && typeof action.text === 'string') {
        return { type, text: action.text.replace(/\s+/g, ' ').trim().slice(0, 500) };
    }
    return null;
}

function validateResponse(rawResponse, requestId) {
    logEvent('info', 'Validating response', { requestId });
    const parsed = safeParseJson(rawResponse);
    
    if (!parsed) {
        logEvent('warn', 'Failed to parse JSON', { requestId, rawResponse: rawResponse.slice(0, 100) });
        return {
            isValid: false,
            error: 'Invalid JSON format',
            parsed: null
        };
    }

    // Basic schema validation
    if (typeof parsed.reply !== 'string') {
        logEvent('warn', 'Response missing required reply string', { requestId });
        return {
            isValid: false,
            error: 'Missing or invalid "reply" field',
            parsed: null
        };
    }

    // Ensure metadata exists
    parsed.metadata = parsed.metadata || {};
    // Provider output is never allowed to control DOM mutation, plugin loading,
    // script injection, or navigation. Website navigation comes from the
    // deterministic resolver, not an arbitrary model response.
    parsed.action = safeAction(parsed.action);

    return {
        isValid: true,
        error: null,
        parsed
    };
}

module.exports = {
    validateResponse,
    RESPONSE_SCHEMA,
    safeAction
};
