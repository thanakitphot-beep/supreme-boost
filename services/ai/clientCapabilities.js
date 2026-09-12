'use strict';
const ACTIONS = new Set(['warp', 'navigate', 'warp_cross_page', 'highlight', 'handoff', 'confetti', 'speech', 'plugin_action']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function sanitizeCapabilities(value) {
    if (!object(value)) return null;
    const actions = Array.isArray(value.actions) ? [...new Set(value.actions.filter(a => ACTIONS.has(a)))].slice(0, 8) : [];
    const plugins = (Array.isArray(value.plugins) ? value.plugins : []).slice(0, 20).filter(p => object(p) && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(p.name || '') && !['constructor', 'prototype', '__proto__'].includes(p.name)).map(p => ({
        name: p.name, description: typeof p.description === 'string' ? p.description.slice(0, 300) : '',
        parameters: object(p.parameters) && JSON.stringify(p.parameters).length <= 4000 ? p.parameters : {}, requiresConfirmation: p.requiresConfirmation !== false
    }));
    return { version: 1, actions, plugins };
}
function safeClientAction(action, capabilities) {
    if (!object(action)) return null;
    if (capabilities && !capabilities.actions.includes(action.type)) return null;
    if (action.type === 'plugin_action') {
        const plugin = capabilities?.plugins.find(p => p.name === action.pluginName);
        if (!plugin || !object(action.payload || {}) || JSON.stringify(action.payload || {}).length > 4000) return null;
        return { type: 'plugin_action', pluginName: plugin.name, payload: action.payload || {}, confirmationRequired: plugin.requiresConfirmation };
    }
    return action;
}
module.exports = { sanitizeCapabilities, safeClientAction };
