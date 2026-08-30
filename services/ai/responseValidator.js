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

function safeInteractive(interactive) {
    if (!interactive || typeof interactive !== 'object' || interactive.type !== 'carousel' || !Array.isArray(interactive.items)) return null;
    const items = interactive.items.slice(0, 8).map(item => {
        if (!item || typeof item !== 'object') return null;
        const title = String(item.title || item.name || item.label || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 120);
        const subtitle = String(item.subtitle || item.description || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 240);
        return title ? { title, subtitle, description: subtitle } : null;
    }).filter(Boolean);
    return items.length ? { type: 'carousel', items } : null;
}

function validateResponse(rawResponse, requestId) {
    logEvent('info', 'Validating response', { requestId });
    const parsed = safeParseJson(rawResponse);
    
    if (!parsed) {
        logEvent('warn', 'Failed to parse JSON', {
            requestId,
            responseType: typeof rawResponse,
            responseLength: typeof rawResponse === 'string' ? rawResponse.length : 0
        });
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

    // Provider output cannot control CSS, navigation, plugin loading, or carry
    // arbitrary metadata into the public API response.
    const safeResponse = {
        reply: parsed.reply.slice(0, 4000),
        action: safeAction(parsed.action),
        cssCommand: '',
        interactive: safeInteractive(parsed.interactive),
        metadata: {},
        status: 'ok'
    };

    return {
        isValid: true,
        error: null,
        parsed: safeResponse
    };
}

module.exports = {
    validateResponse,
    RESPONSE_SCHEMA,
    safeAction,
    safeInteractive
};
