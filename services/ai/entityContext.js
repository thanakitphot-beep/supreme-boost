'use strict';

// Keep visible product facts in a separate budget so long page/RAG text cannot
// evict them. Only public, allowlisted fields become model context.
function entityContext(siteDNA, query = '') {
    const items = Array.isArray(siteDNA?.entityIndex) ? siteDNA.entityIndex : [];
    const request = String(query).normalize('NFC').toLowerCase();
    const clean = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
    const candidates = items.slice(0, 120).flatMap((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const title = clean(item.title || item.name || item.label, 200);
        if (!title || title.toLowerCase().startsWith('__indicator_context_product__:')) return [];
        const entity = { title, description: clean(item.description || item.desc, 400) };
        if (typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0) entity.price = item.price;
        else if (typeof item.price === 'string' && item.price.trim()) entity.price = item.price.slice(0, 80);
        if (typeof item.inStock === 'boolean') entity.inStock = item.inStock;
        const matched = request.includes(title.normalize('NFC').toLowerCase());
        return [{ entity, index, matched }];
    }).sort((a, b) => Number(b.matched) - Number(a.matched) || a.index - b.index);
    const selected = [];
    let remaining = 6000;
    for (const { entity } of candidates) {
        const size = JSON.stringify(entity).length + 1;
        if (size > remaining) continue;
        selected.push(entity);
        remaining -= size;
        if (selected.length >= 20) break;
    }
    return selected;
}

module.exports = { entityContext };
