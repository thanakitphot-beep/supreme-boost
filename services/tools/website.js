'use strict';
const ok = data => ({ success: true, status: 'completed', data });
const fail = message => ({ success: false, status: 'error', error: { code: 'INSUFFICIENT_EVIDENCE', message } });
const str = (v, n = 600) => typeof v === 'string' ? v.slice(0, n) : '';
function records(payload = {}) {
    const catalog = Array.isArray(payload.siteProfile?.knowledge?.catalog) ? payload.siteProfile.knowledge.catalog : [];
    const entities = Array.isArray(payload.siteDNA?.entityIndex) ? payload.siteDNA.entityIndex : [];
    const rows = [...entities, ...catalog].filter(item => item && typeof item === 'object').slice(0, 240).map((item, index) => ({
        id: str(item.id || item.entityId, 160) || 'product-' + index,
        title: str(item.title || item.name, 220), description: str(item.description),
        price: typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : null,
        inStock: typeof item.inStock === 'boolean' ? item.inStock : null,
        source: entities.includes(item) ? 'current_page' : 'site_catalog'
    })).filter(item => item.title);
    const seen = new Set();
    return rows.filter(item => { const key = item.title.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}
function calculate(expression) {
    const source = expression.replace(/\s/g, '');
    const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+*/%\-]/g) || [];
    if (!source || tokens.join('') !== source || tokens.length > 150) throw Error('Invalid arithmetic expression');
    let index = 0, depth = 0;
    function primary() {
        if (++depth > 25) throw Error('Expression too deep');
        let value;
        if (tokens[index] === '+' || tokens[index] === '-') { const sign = tokens[index++]; value = (sign === '-' ? -1 : 1) * primary(); }
        else if (tokens[index] === '(') { index++; value = sum(); if (tokens[index++] !== ')') throw Error('Missing closing parenthesis'); }
        else { const token = tokens[index++]; if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token || '')) throw Error('Expected number'); value = Number(token); }
        if (tokens[index] === '%') { index++; value /= 100; }
        depth--; return value;
    }
    function product() { let value = primary(); while (['*', '/'].includes(tokens[index])) { const op = tokens[index++], right = primary(); if (op === '/' && right === 0) throw Error('Division by zero'); value = op === '*' ? value * right : value / right; } return value; }
    function sum() { let value = product(); while (['+', '-'].includes(tokens[index])) { const op = tokens[index++], right = product(); value = op === '+' ? value + right : value - right; } return value; }
    const value = sum();
    if (index !== tokens.length || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw Error('Invalid or out-of-range result');
    return Number(value.toPrecision(14));
}
function registerWebsiteTools(registry) {
    registry.register({ name: 'search_website', description: 'Search current site products and supplied public knowledge. Does not browse the Internet or query live inventory.',
        parameters: { type: 'object', required: ['query'], additionalProperties: false, properties: { query: { type: 'string', minLength: 1, maxLength: 250 }, limit: { type: 'integer', minimum: 1, maximum: 8 } } },
        execute: async ({ query, limit = 5 }, { payload = {} }) => {
            const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
            const items = records(payload).map(item => ({ ...item, relevance: terms.filter(term => (item.title + ' ' + item.description).toLowerCase().includes(term)).length }))
                .filter(item => item.relevance).sort((a, b) => b.relevance - a.relevance).slice(0, limit);
            const knowledge = [payload.ragContext, payload.pageContent, ...(payload.expertKnowledge?.pages || []).map(page => page.text || page.content)].filter(v => typeof v === 'string')
                .flatMap(v => v.split(/\n+/)).filter(line => terms.some(term => line.toLowerCase().includes(term))).slice(0, 6).map(line => line.slice(0, 700));
            return ok({ items, excerpts: knowledge, found: items.length + knowledge.length, stockIsLive: false });
        } });
    registry.register({ name: 'compare_products', description: 'Compare 2 to 5 exact product titles or IDs from search_website. Missing prices and stock remain unknown.',
        parameters: { type: 'object', required: ['products'], additionalProperties: false, properties: { products: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 220 } } } },
        execute: async ({ products }, { payload = {} }) => {
            const available = records(payload), selected = [];
            for (const name of products) {
                const matches = available.filter(item => item.id === name || item.title.toLowerCase() === name.toLowerCase());
                if (matches.length !== 1 || selected.includes(matches[0])) return fail('Each requested product must identify a different, unambiguous item in this website. Search first.');
                selected.push(matches[0]);
            }
            return ok({ products: selected, priceDifference: selected.every(item => item.price !== null) ? Math.max(...selected.map(i => i.price)) - Math.min(...selected.map(i => i.price)) : null });
        } });
    registry.register({ name: 'calculate', description: 'Evaluate arithmetic using + - * / parentheses and postfix percent. Use only verified numbers; this does not verify shop prices or policies.',
        parameters: { type: 'object', required: ['expression'], additionalProperties: false, properties: { expression: { type: 'string', minLength: 1, maxLength: 300 } } },
        execute: async ({ expression }) => { try { return ok({ expression, value: calculate(expression) }); } catch (error) { return { success: false, status: 'error', error: { code: 'INVALID_EXPRESSION', message: error.message } }; } } });
}
module.exports = { registerWebsiteTools, calculate, records };
