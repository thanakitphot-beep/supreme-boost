const { logEvent } = require('./logger');

const RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        reply: { type: "string" },
        action: { 
            type: ["object", "null"],
            properties: {
                type: { type: "string" },
                target_keyword: { type: "string" }
            }
        },
        cssCommand: { type: ["string", "null"] },
        interactive: { type: ["object", "null"] },
        toolCalls: { type: 'array', maxItems: 3, items: {
            type: 'object', required: ['name', 'arguments'],
            properties: { id: { type: 'string' }, name: { type: 'string' }, arguments: { type: 'object' } }
        } }
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

function validateResponse(rawResponse, requestId) {
    logEvent('info', 'Validating response', { requestId });
    const parsed = safeParseJson(rawResponse);
    
    if (!parsed) {
        logEvent('warn', 'Failed to parse JSON', { requestId });
        return {
            isValid: false,
            error: 'Invalid JSON format',
            parsed: null
        };
    }

    // Basic schema validation
    if (typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.reply !== 'string' || !parsed.reply.trim()) {
        logEvent('warn', 'Response missing required reply string', { requestId });
        return {
            isValid: false,
            error: 'Missing or invalid "reply" field',
            parsed: null
        };
    }

    const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if ((parsed.action != null && (!isObject(parsed.action) || typeof parsed.action.type !== 'string' || !parsed.action.type.trim())) ||
        (parsed.cssCommand != null && typeof parsed.cssCommand !== 'string') ||
        (parsed.interactive != null && !isObject(parsed.interactive))) {
        return { isValid: false, error: 'Invalid action, cssCommand, or interactive field', parsed: null };
    }
    parsed.metadata = isObject(parsed.metadata) ? parsed.metadata : {};
    if (parsed.toolCalls !== undefined && (!Array.isArray(parsed.toolCalls) || parsed.toolCalls.length > 3 ||
        parsed.toolCalls.some(call => !isObject(call) || !/^[a-z][a-z0-9_]{0,63}$/.test(call.name || '') ||
            !isObject(call.arguments) || JSON.stringify(call.arguments).length > 16000 ||
            (call.id !== undefined && (typeof call.id !== 'string' || call.id.length > 80))))) {
        return { isValid: false, error: 'Invalid toolCalls', parsed: null };
    }
    if (parsed.toolCalls?.length && parsed.action) return { isValid: false, error: 'Tool turns cannot also propose client actions', parsed: null };

    return {
        isValid: true,
        error: null,
        parsed
    };
}

module.exports = {
    validateResponse,
    RESPONSE_SCHEMA
};
