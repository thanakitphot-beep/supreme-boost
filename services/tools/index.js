const registry = require('./registry');

registry.register({
    name: 'trigger_scroller',
    description: 'Use this tool ONLY when the user wants to navigate to a page, find a product, or scroll to a specific section. This tool activates the precise Scroller Agent.',
    parameters: {
        target_keyword: { 
            type: 'string', 
            description: 'The exact short keyword (1-3 words) describing what the user wants to find (e.g. "รองเท้าวิ่ง", "ติดต่อเรา", "ราคา"). Do not include filler words.'
        },
        intent: {
            type: 'string',
            description: 'The type of action: "find_product" (for items to buy), "navigate" (for pages like about us, contact), or "scroll" (for finding information on current page).'
        }
    },
    execute: async (params, context) => {
        // This is a bridge. When GPT calls this, the Gateway will intercept it
        // and pass the params to the Indicator Agent (Scroller) for 100% deterministic matching.
        return { 
            success: true, 
            actionTrigger: true,
            target: params.target_keyword,
            subIntent: params.intent
        };
    }
});

registry.register({
    name: 'handoff_to_human',
    description: 'Use this tool when the user is angry, complaining, or explicitly asking to talk to a human agent/staff.',
    parameters: {
        reason: { type: 'string', description: 'Reason for handoff.' }
    },
    execute: async (params) => {
        return { success: true, actionTrigger: true, subIntent: 'handoff', target: params.reason };
    }
});

module.exports = registry;
